import type {
  CommercialProceedRequest,
  CommercialRequest,
} from "@/domain/commercial/types";
import type { SessionUser } from "@/server/commercial/auth";
import {
  getEmailDeliveryProvider,
  getEmailFromConfig,
} from "@/server/commercial/email";
import {
  isEmailVerified,
  isLiveEmailMode,
} from "@/server/commercial/emailVerification";
import {
  buildOutboundInternetMessageId,
  buildRequestReplyAddress,
  generateReplyToken,
  isInboundEmailEnabled,
} from "@/server/commercial/inbound/replyAddress";
import { effectiveQuote, expiryState } from "@/server/commercial/comparison/normalize";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
  resetRateLimitProviderForTests,
} from "@/server/ops/rateLimit";
import { findUserById } from "@/server/commercial/store";

const MAX_SUBJECT = 300;
const MAX_BODY = 12000;

export type SendProceedResult =
  | {
      ok: true;
      request: CommercialRequest;
      proceed: CommercialProceedRequest;
      simulated: boolean;
      alreadySent?: boolean;
    }
  | {
      ok: false;
      error: string;
      code: string;
      request?: CommercialRequest;
      proceed?: CommercialProceedRequest;
    };

export async function sendProceedRequest(input: {
  requestId: string;
  proceedId: string;
  user: SessionUser;
  subject?: string;
  body?: string;
}): Promise<SendProceedResult> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.user.id) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  const proceed = await repos.proceedRequests.get(input.proceedId);
  if (
    !proceed ||
    proceed.commercialRequestId !== request.id ||
    proceed.userId !== input.user.id
  ) {
    return { ok: false, error: "Proceed request not found", code: "not_found" };
  }

  if (proceed.status === "SENT" || proceed.status === "DELIVERY_SIMULATED") {
    return {
      ok: true,
      request,
      proceed,
      simulated: proceed.status === "DELIVERY_SIMULATED",
      alreadySent: true,
    };
  }

  if (proceed.status === "SENDING") {
    return {
      ok: false,
      error: "Proceed send already in progress",
      code: "send_in_progress",
      request,
      proceed,
    };
  }

  if (proceed.status !== "READY_TO_SEND" && proceed.status !== "SEND_FAILED") {
    return {
      ok: false,
      error: "Proceed request is not ready to send",
      code: "invalid_status",
      request,
      proceed,
    };
  }

  // Server-side rechecks
  const quote = await repos.quotes.get(proceed.commercialQuoteId);
  if (!quote) {
    return { ok: false, error: "Selected quote not found", code: "not_found" };
  }
  if (quote.isLatest === false || quote.quoteStatus === "SUPERSEDED") {
    return {
      ok: false,
      error:
        "A newer version of this quote is available. Please review it before proceeding.",
      code: "quote_superseded",
      request,
      proceed,
    };
  }
  if (expiryState(effectiveQuote(quote).validityUntil) === "expired") {
    return {
      ok: false,
      error: "Quote expired",
      code: "QUOTE_EXPIRED",
      request,
      proceed,
    };
  }

  if (isLiveEmailMode()) {
    const stored = await findUserById(input.user.id);
    if (!stored || !isEmailVerified(stored)) {
      return {
        ok: false,
        error: "Verify your email address before sending commercial requests.",
        code: "EMAIL_VERIFICATION_REQUIRED",
        request,
        proceed,
      };
    }
  }

  if (!(await checkProceedRateLimit(input.user.id))) {
    return {
      ok: false,
      error: "Send rate limit exceeded. Try again later.",
      code: "rate_limited",
      request,
      proceed,
    };
  }

  const subject = (input.subject ?? proceed.subject).trim().slice(0, MAX_SUBJECT);
  const body = (input.body ?? proceed.body).trim().slice(0, MAX_BODY);
  if (!subject || !body) {
    return {
      ok: false,
      error: "Subject and message are required",
      code: "validation",
      request,
      proceed,
    };
  }

  const recipientEmail = proceed.recipientEmail.trim().toLowerCase();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return {
      ok: false,
      error: "Invalid recipient",
      code: "missing_recipient",
      request,
      proceed,
    };
  }

  // Directory validation when contact id present — email must match directory or inbound
  if (proceed.recipientContactId && !proceed.recipientFromInbound) {
    const contact = await repos.contacts.getById(proceed.recipientContactId);
    if (!contact?.email || contact.email.trim().toLowerCase() !== recipientEmail) {
      return {
        ok: false,
        error: "Recipient is not in the approved commercial directory",
        code: "invalid_recipient",
        request,
        proceed,
      };
    }
  }

  const claimed = await repos.proceedRequests.claimForSend(
    proceed.id,
    input.user.id,
  );
  if (!claimed) {
    const latest = await repos.proceedRequests.get(proceed.id);
    if (
      latest &&
      (latest.status === "SENT" || latest.status === "DELIVERY_SIMULATED")
    ) {
      return {
        ok: true,
        request,
        proceed: latest,
        simulated: latest.status === "DELIVERY_SIMULATED",
        alreadySent: true,
      };
    }
    return {
      ok: false,
      error: "Could not claim proceed request for sending",
      code: "claim_failed",
      request,
      proceed: latest,
    };
  }

  const now = new Date().toISOString();
  await repos.requests.save({
    ...request,
    status: "PROCEED_SENDING",
    updatedAt: now,
  });

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.user.id,
    eventType: "PROCEED_SEND_STARTED",
    metadata: { proceedId: proceed.id, quoteId: quote.id },
    createdAt: now,
  });

  let replyToken = request.replyToken;
  if (!replyToken) {
    replyToken = generateReplyToken();
  }
  const captureReplyTo = isInboundEmailEnabled()
    ? buildRequestReplyAddress(replyToken)
    : null;
  const replyTo =
    captureReplyTo ||
    process.env.EMAIL_REPLY_TO_OVERRIDE?.trim() ||
    input.user.email;
  const internetMessageId = buildOutboundInternetMessageId(replyToken);
  const from = getEmailFromConfig();

  let provider;
  try {
    provider = getEmailDeliveryProvider();
  } catch (err) {
    const failed = await markProceedFailed(
      claimed,
      request,
      err instanceof Error ? err.message : "provider_config",
    );
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: request.id,
      userId: input.user.id,
      eventType: "PROCEED_SEND_FAILED",
      metadata: { reason: "provider_config" },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: false,
      error:
        "CargoConnect could not send this proceed request. It has been saved and can be retried.",
      code: "provider_config",
      request: failed.request,
      proceed: failed.proceed,
    };
  }

  const html = `<pre style="font-family:Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(body)}</pre>`;

  const result = await provider.sendCommercialRequest({
    requestId: `proceed-${proceed.id}`,
    toAddress: recipientEmail,
    toOrganization: proceed.recipientOrganization,
    subject,
    textBody: body,
    htmlBody: html,
    replyTo,
    fromAddress: from.address,
    fromName: from.name,
    idempotencyKey: `cc-proceed-${proceed.id}`,
    headers: { "Message-ID": internetMessageId },
  });

  if (!result.ok) {
    const failed = await markProceedFailed(claimed, request, "provider_failed");
    await repos.messages.create({
      id: newId("msg"),
      commercialRequestId: request.id,
      direction: "OUTBOUND",
      messageKind: "PROCEED_REQUEST",
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      internetMessageId,
      fromAddress: `${from.name} <${from.address}>`,
      replyTo,
      toAddress: recipientEmail,
      subject,
      bodySnapshot: body,
      htmlSnapshot: html,
      deliveryStatus: "FAILED",
      errorMessage: result.error ?? "send_failed",
      createdAt: new Date().toISOString(),
      sentAt: null,
    });
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: request.id,
      userId: input.user.id,
      eventType: "PROCEED_SEND_FAILED",
      metadata: { provider: result.provider },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: false,
      error:
        "CargoConnect could not send this proceed request. It has been saved and can be retried.",
      code: "send_failed",
      request: failed.request,
      proceed: failed.proceed,
    };
  }

  const simulated = Boolean(result.simulated);
  const sentAt = new Date().toISOString();
  const msgId = newId("msg");
  await repos.messages.create({
    id: msgId,
    commercialRequestId: request.id,
    direction: "OUTBOUND",
    messageKind: "PROCEED_REQUEST",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    internetMessageId,
    fromAddress: `${from.name} <${from.address}>`,
    replyTo,
    toAddress: recipientEmail,
    subject,
    bodySnapshot: body,
    htmlSnapshot: html,
    deliveryStatus: simulated ? "SIMULATED" : "SENT",
    errorMessage: null,
    createdAt: sentAt,
    sentAt,
  });

  // Freeze snapshot (already on proceed) and lock selection
  const selection = await repos.selections.get(proceed.selectionId);
  if (selection) {
    await repos.selections.update({
      ...selection,
      active: true,
      lockedAt: sentAt,
    });
  }

  const sentProceed: CommercialProceedRequest = {
    ...claimed,
    status: simulated ? "DELIVERY_SIMULATED" : "SENT",
    subject,
    body,
    snapshot: claimed.snapshot, // immutable
    outboundMessageId: msgId,
    sentAt,
    updatedAt: sentAt,
    lastSendError: null,
  };
  await repos.proceedRequests.update(sentProceed);

  const sentRequest: CommercialRequest = {
    ...request,
    replyToken,
    status: "AWAITING_CONFIRMATION",
    confirmationStatus: "AWAITING",
    selectedQuoteSelectionId: proceed.selectionId,
    updatedAt: sentAt,
  };
  await repos.requests.save(sentRequest);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.user.id,
    eventType: "PROCEED_SENT",
    metadata: {
      proceedId: proceed.id,
      quoteId: quote.id,
      simulated,
      provider: result.provider,
      snapshotQuoteVersion: claimed.snapshot.quoteVersion,
    },
    createdAt: sentAt,
  });

  return {
    ok: true,
    request: sentRequest,
    proceed: sentProceed,
    simulated,
  };
}

async function markProceedFailed(
  proceed: CommercialProceedRequest,
  request: CommercialRequest,
  reason: string,
): Promise<{ proceed: CommercialProceedRequest; request: CommercialRequest }> {
  const now = new Date().toISOString();
  const failedProceed: CommercialProceedRequest = {
    ...proceed,
    status: "SEND_FAILED",
    lastSendError: reason,
    updatedAt: now,
  };
  await getRepositories().proceedRequests.update(failedProceed);
  const failedRequest: CommercialRequest = {
    ...request,
    status: "PROCEED_SEND_FAILED",
    updatedAt: now,
  };
  await getRepositories().requests.save(failedRequest);
  return { proceed: failedProceed, request: failedRequest };
}

async function checkProceedRateLimit(userId: string): Promise<boolean> {
  const result = await enforceRateLimit({
    policy: "email_send",
    identityParts: [hashRateLimitIdentity(`proceed:${userId}`)],
  });
  return result.allowed;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function resetProceedRateLimitsForTests(): void {
  resetRateLimitProviderForTests();
}
