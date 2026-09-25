import type { CommercialRequest } from "@/domain/commercial/types";
import type { SessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import type { AuditEventType } from "@/server/commercial/repos/types";
import {
  getEmailDeliveryProvider,
  getEmailFromConfig,
} from "@/server/commercial/email";
import { buildCommercialEmailBodies } from "@/server/commercial/email/buildBodies";
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
import { findUserById } from "@/server/commercial/store";


import {
  enforceRateLimit,
  hashRateLimitIdentity,
  resetRateLimitProviderForTests,
} from "@/server/ops/rateLimit";
import { metrics } from "@/server/ops/metrics";
import { logger } from "@/server/ops/logger";

const MAX_SUBJECT = 300;
const MAX_BODY = 12000;

export type SendRequestResult =
  | {
      ok: true;
      request: CommercialRequest;
      simulated: boolean;
      alreadySent?: boolean;
    }
  | { ok: false; error: string; code: string; request?: CommercialRequest };

export async function appendAudit(input: {
  commercialRequestId: string;
  userId?: string | null;
  eventType: AuditEventType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: input.commercialRequestId,
    userId: input.userId,
    eventType: input.eventType,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Idempotent commercial send:
 * READY_TO_SEND | SEND_FAILED → SENDING → SENT | DELIVERY_SIMULATED | SEND_FAILED
 */
export async function sendCommercialRequest(input: {
  requestId: string;
  user: SessionUser;
}): Promise<SendRequestResult> {
  const repos = getRepositories();
  const existing = await repos.requests.get(input.requestId);

  if (!existing || existing.userId !== input.user.id) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  if (
    existing.status === "SENT" ||
    existing.status === "DELIVERY_SIMULATED"
  ) {
    return {
      ok: true,
      request: existing,
      simulated: existing.status === "DELIVERY_SIMULATED",
      alreadySent: true,
    };
  }

  if (existing.status === "SENDING") {
    return {
      ok: false,
      error: "Send already in progress",
      code: "send_in_progress",
      request: existing,
    };
  }

  if (existing.status !== "READY_TO_SEND" && existing.status !== "SEND_FAILED") {
    return {
      ok: false,
      error: "Request is not ready to send",
      code: "invalid_status",
      request: existing,
    };
  }

  if (!(await checkRateLimit(input.user.id))) {
    return {
      ok: false,
      error: "Send rate limit exceeded. Try again later.",
      code: "rate_limited",
      request: existing,
    };
  }

  // Live outbound commercial email requires a verified account email.
  // Log/simulated mode may send without verification (marked DELIVERY_SIMULATED).
  if (isLiveEmailMode()) {
    const stored = await findUserById(input.user.id);
    if (!stored || !isEmailVerified(stored)) {
      return {
        ok: false,
        error:
          "Verify your email address before sending commercial requests.",
        code: "EMAIL_VERIFICATION_REQUIRED",
        request: existing,
      };
    }
  }

  const validationError = validateReadyRequest(existing);
  if (validationError) {
    return { ok: false, error: validationError, code: "validation", request: existing };
  }

  const existingRecipient = existing.recipient!;
  let recipient: NonNullable<CommercialRequest["recipient"]>;
  let toEmail: string;
  let toOrganization: string;

  if (existingRecipient.contactId && !existingRecipient.manual) {
    const contact = await repos.contacts.getById(existingRecipient.contactId);
    if (!contact) {
      return {
        ok: false,
        error: "Recipient is not in the approved commercial directory",
        code: "invalid_recipient",
        request: existing,
      };
    }
    if (!contact.email?.trim()) {
      return {
        ok: false,
        error: "Selected recipient has no verified email address",
        code: "missing_recipient_email",
        request: existing,
      };
    }
    // Resolve directory recipient from store — never trust browser email
    recipient = {
      contactId: contact.id,
      organizationName: contact.organizationName,
      contactType: contact.contactType,
      portId: contact.portId,
      portName: contact.portName,
      email: contact.email,
      sourceUrl: contact.sourceUrl,
      manual: false,
    };
    toEmail = contact.email.trim().toLowerCase();
    toOrganization = contact.organizationName;
  } else {
    const email = existingRecipient.email?.trim().toLowerCase() ?? "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        ok: false,
        error: "Enter a valid destination recipient email before sending",
        code: "missing_recipient_email",
        request: existing,
      };
    }
    toEmail = email;
    toOrganization =
      existingRecipient.organizationName.trim() || "Commercial recipient";
    recipient = {
      ...existingRecipient,
      email: toEmail,
      organizationName: toOrganization,
      manual: true,
      sourceUrl: existingRecipient.sourceUrl || "user-provided",
    };
  }

  const claimed = await repos.requests.claimForSend(input.requestId, input.user.id);
  if (!claimed) {
    const latest = await repos.requests.get(input.requestId);
    if (
      latest &&
      (latest.status === "SENT" || latest.status === "DELIVERY_SIMULATED")
    ) {
      return {
        ok: true,
        request: latest,
        simulated: latest.status === "DELIVERY_SIMULATED",
        alreadySent: true,
      };
    }
    return {
      ok: false,
      error: "Could not claim request for sending",
      code: "claim_failed",
      request: latest,
    };
  }

  await appendAudit({
    commercialRequestId: input.requestId,
    userId: input.user.id,
    eventType: "SEND_STARTED",
    metadata: {
      contactId: recipient.contactId ?? null,
      manual: Boolean(recipient.manual),
    },
  });

  // Ensure reply correlation token exists before send
  let replyToken = claimed.replyToken;
  if (!replyToken) {
    replyToken = generateReplyToken();
  }
  const captureReplyTo =
    isInboundEmailEnabled() ? buildRequestReplyAddress(replyToken) : null;
  const replyTo =
    captureReplyTo ||
    process.env.EMAIL_REPLY_TO_OVERRIDE?.trim() ||
    input.user.email;
  const internetMessageId = buildOutboundInternetMessageId(replyToken);

  const from = getEmailFromConfig();
  const subject = existing.aiDraft!.subject.trim().slice(0, MAX_SUBJECT);
  const textDraft = existing.aiDraft!.body.slice(0, MAX_BODY);
  const bodies = buildCommercialEmailBodies({
    request: {
      ...claimed,
      replyToken,
      recipient,
      aiDraft: { ...existing.aiDraft!, subject, body: textDraft },
    },
    requester: input.user,
    recipientOrganization: toOrganization,
    repliesCapturedByCargoConnect: Boolean(captureReplyTo),
  });

  const idempotencyKey = `cc-send-${input.requestId}`;
  let provider;
  try {
    provider = getEmailDeliveryProvider();
  } catch (err) {
    const failed = await markSendFailed(
      { ...claimed, replyToken },
      err instanceof Error ? err.message : "email_provider_config",
    );
    await appendAudit({
      commercialRequestId: input.requestId,
      userId: input.user.id,
      eventType: "EMAIL_SEND_FAILED",
      metadata: { reason: "provider_config" },
    });
    return {
      ok: false,
      error:
        "CargoConnect could not send this request. Your request has been saved and can be retried.",
      code: "provider_config",
      request: failed,
    };
  }

  const result = await provider.sendCommercialRequest({
    requestId: input.requestId,
    toAddress: toEmail,
    toOrganization,
    subject,
    textBody: bodies.text,
    htmlBody: bodies.html,
    replyTo,
    fromAddress: from.address,
    fromName: from.name,
    idempotencyKey,
    headers: {
      "Message-ID": internetMessageId,
    },
  });

  const now = new Date().toISOString();

  if (!result.ok) {
    await repos.messages.create({
      id: newId("msg"),
      commercialRequestId: input.requestId,
      direction: "OUTBOUND",
      messageKind: existing.type === "RESERVATION" ? "RESERVATION_REQUEST" : "RFQ",
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      internetMessageId,
      fromAddress: `${from.name} <${from.address}>`,
      replyTo,
      toAddress: toEmail,
      subject,
      bodySnapshot: bodies.text,
      htmlSnapshot: bodies.html,
      deliveryStatus: "FAILED",
      errorMessage: result.error ?? "send_failed",
      createdAt: now,
      sentAt: null,
    });
    const failed = await markSendFailed(
      { ...claimed, replyToken },
      "provider_failed",
    );
    await appendAudit({
      commercialRequestId: input.requestId,
      userId: input.user.id,
      eventType: "EMAIL_SEND_FAILED",
      metadata: { provider: result.provider },
    });
    return {
      ok: false,
      error:
        "CargoConnect could not send this request. Your request has been saved and can be retried.",
      code: "send_failed",
      request: failed,
    };
  }

  const simulated = Boolean(result.simulated);
  const nextStatus = simulated ? "DELIVERY_SIMULATED" : "SENT";

  const sentRequest: CommercialRequest = {
    ...claimed,
    replyToken,
    recipient,
    status: nextStatus,
    aiDraft: { ...existing.aiDraft!, subject, body: textDraft },
    sentAt: now,
    lastSendError: null,
    updatedAt: now,
  };

  await repos.requests.save(sentRequest);
  await repos.messages.create({
    id: newId("msg"),
    commercialRequestId: input.requestId,
    direction: "OUTBOUND",
    messageKind: existing.type === "RESERVATION" ? "RESERVATION_REQUEST" : "RFQ",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    internetMessageId,
    fromAddress: `${from.name} <${from.address}>`,
    replyTo,
    toAddress: toEmail,
    subject,
    bodySnapshot: bodies.text,
    htmlSnapshot: bodies.html,
    deliveryStatus: simulated ? "SIMULATED" : "SENT",
    errorMessage: null,
    createdAt: now,
    sentAt: now,
  });

  await appendAudit({
    commercialRequestId: input.requestId,
    userId: input.user.id,
    eventType: simulated ? "DELIVERY_SIMULATED" : "EMAIL_SENT",
    metadata: {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      toDomain: toEmail.split("@")[1],
      inboundCapture: Boolean(captureReplyTo),
      manual: Boolean(recipient.manual),
    },
  });

  return { ok: true, request: sentRequest, simulated };
}

function validateReadyRequest(request: CommercialRequest): string | null {
  if (!request.origin?.name || !request.destination?.name) {
    return "Origin and destination are required before sending";
  }
  if (!request.recipient) {
    return "Select a commercial recipient or enter a destination email before sending";
  }
  if (!request.recipient.email?.trim()) {
    return "Destination recipient email is required before sending";
  }
  if (!request.aiDraft?.subject?.trim() || !request.aiDraft?.body?.trim()) {
    return "A reviewed subject and message are required before sending";
  }
  if (request.aiDraft.subject.length > MAX_SUBJECT) {
    return "Subject is too long";
  }
  if (request.aiDraft.body.length > MAX_BODY) {
    return "Message body is too long";
  }
  return null;
}

async function markSendFailed(
  request: CommercialRequest,
  reason: string,
): Promise<CommercialRequest> {
  const failed: CommercialRequest = {
    ...request,
    status: "SEND_FAILED",
    lastSendError: reason,
    updatedAt: new Date().toISOString(),
  };
  await getRepositories().requests.save(failed);
  return failed;
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const result = await enforceRateLimit({
    policy: "email_send",
    identityParts: [hashRateLimitIdentity(userId)],
  });
  if (!result.allowed) {
    metrics.rateLimited();
    logger.warn("email.send_rate_limited", { event: "email.send_rate_limited" });
  }
  return result.allowed;
}

/** Test helper */
export function resetSendRateLimitsForTests(): void {
  resetRateLimitProviderForTests();
}
