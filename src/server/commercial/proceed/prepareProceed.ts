import type {
  CommercialProceedRequest,
  CommercialRequest,
} from "@/domain/commercial/types";
import type { SessionUser } from "@/server/commercial/auth";
import {
  effectiveQuote,
  expiryState,
  normalizeCommercialQuote,
} from "@/server/commercial/comparison/normalize";
import {
  buildProceedSnapshot,
  generateProceedMessage,
} from "@/server/commercial/proceed/generateProceedMessage";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

export type PrepareProceedResult =
  | {
      ok: true;
      proceed: CommercialProceedRequest;
      request: CommercialRequest;
      warnings: string[];
      draft: { subject: string; body: string };
      sourceMessageId: string;
    }
  | { ok: false; error: string; code: string };

export async function prepareProceedRequest(input: {
  requestId: string;
  user: SessionUser;
}): Promise<PrepareProceedResult> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.user.id) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  if (
    request.status === "AWAITING_CONFIRMATION" ||
    request.status === "PROCEED_SENDING"
  ) {
    const existing = await repos.proceedRequests.getLatestForRequest(request.id);
    if (existing && (existing.status === "SENT" || existing.status === "DELIVERY_SIMULATED")) {
      return {
        ok: false,
        error: "Proceed request already sent",
        code: "already_sent",
      };
    }
  }

  const selection = await repos.selections.getActiveForRequest(request.id);
  if (!selection) {
    return { ok: false, error: "Select a quote first", code: "no_selection" };
  }

  const quote = await repos.quotes.get(selection.commercialQuoteId);
  if (!quote) {
    return { ok: false, error: "Selected quote not found", code: "not_found" };
  }

  if (quote.isLatest === false || quote.quoteStatus === "SUPERSEDED") {
    return {
      ok: false,
      error:
        "A newer version of this quote is available. Please review it before proceeding.",
      code: "quote_superseded",
    };
  }

  const effective = effectiveQuote(quote);
  if (expiryState(effective.validityUntil) === "expired") {
    return { ok: false, error: "Quote expired", code: "quote_expired" };
  }

  const inbound = await repos.messages.listForRequest(request.id);
  const sourceMsg = inbound.find((m) => m.id === quote.inboundMessageId);

  // Resolve recipient: prefer inbound sender when present, else directory contact
  let recipientEmail =
    sourceMsg?.fromAddress.match(/<([^>]+)>/)?.[1] ??
    sourceMsg?.fromAddress ??
    "";
  recipientEmail = recipientEmail.trim().toLowerCase();
  let recipientOrganization =
    quote.organizationName ??
    sourceMsg?.fromName ??
    request.recipient?.organizationName ??
    "Commercial contact";
  let recipientFromInbound = Boolean(sourceMsg?.fromAddress);
  const inboundSenderTrust = sourceMsg?.senderTrust ?? null;

  if (!recipientEmail && request.recipient?.email) {
    recipientEmail = request.recipient.email.trim().toLowerCase();
    recipientFromInbound = false;
  }

  // Prefer directory contact email when it matches expected sender domain path
  if (!recipientEmail) {
    return {
      ok: false,
      error: "Selected quote has no resolvable recipient email",
      code: "missing_recipient",
    };
  }

  // If we have a directory contact for the quote, use it when inbound missing
  if (quote.contactId) {
    const contact = await repos.contacts.getById(quote.contactId);
    if (contact?.email && !sourceMsg) {
      recipientEmail = contact.email.trim().toLowerCase();
      recipientOrganization = contact.organizationName;
    }
  }

  const snapshot = buildProceedSnapshot({ quote, request });
  const draft = generateProceedMessage({
    request,
    snapshot,
    requester: {
      fullName: input.user.fullName,
      email: input.user.email,
      companyName: input.user.companyName,
      phone: input.user.phone,
    },
  });

  const normalized = normalizeCommercialQuote({ quote, request });
  const warnings: string[] = [...normalized.warnings];
  if (!snapshot.validity) warnings.push("Quote validity not specified.");
  if (normalized.expiryState === "expiring_soon") {
    warnings.push("Quote expires soon.");
  }
  if (normalized.confidenceLabel !== "High") {
    warnings.push(`Extraction confidence: ${normalized.confidenceLabel}`);
  }
  if (quote.corrections?.length) {
    warnings.push("This quote includes manual corrections.");
  }
  if (inboundSenderTrust && inboundSenderTrust !== "EXPECTED_SENDER") {
    warnings.push(
      `Reply sender trust: ${inboundSenderTrust} — review recipient carefully.`,
    );
  }

  const now = new Date().toISOString();
  const existingDraft = await repos.proceedRequests.getLatestForRequest(request.id);
  let proceed: CommercialProceedRequest;

  if (
    existingDraft &&
    (existingDraft.status === "DRAFT" ||
      existingDraft.status === "READY_TO_SEND" ||
      existingDraft.status === "SEND_FAILED") &&
    existingDraft.commercialQuoteId === quote.id
  ) {
    proceed = {
      ...existingDraft,
      selectionId: selection.id,
      snapshot,
      subject: draft.subject,
      body: draft.body,
      recipientEmail,
      recipientOrganization,
      recipientContactId: quote.contactId ?? request.recipient?.contactId ?? null,
      recipientFromInbound,
      inboundSenderTrust,
      status: "READY_TO_SEND",
      updatedAt: now,
      lastSendError: null,
    };
    await repos.proceedRequests.update(proceed);
  } else {
    proceed = {
      id: newId("proceed"),
      commercialRequestId: request.id,
      selectionId: selection.id,
      commercialQuoteId: quote.id,
      userId: input.user.id,
      status: "READY_TO_SEND",
      snapshot,
      subject: draft.subject,
      body: draft.body,
      recipientEmail,
      recipientOrganization,
      recipientContactId: quote.contactId ?? request.recipient?.contactId ?? null,
      recipientFromInbound,
      inboundSenderTrust,
      outboundMessageId: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      lastSendError: null,
    };
    await repos.proceedRequests.create(proceed);
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: request.id,
      userId: input.user.id,
      eventType: "PROCEED_REQUEST_CREATED",
      metadata: { proceedId: proceed.id, quoteId: quote.id },
      createdAt: now,
    });
  }

  const updatedRequest: CommercialRequest = {
    ...request,
    status: "PROCEED_READY_TO_SEND",
    selectedQuoteSelectionId: selection.id,
    updatedAt: now,
  };
  await repos.requests.save(updatedRequest);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.user.id,
    eventType: "PROCEED_REQUEST_READY",
    metadata: { proceedId: proceed.id },
    createdAt: now,
  });

  return {
    ok: true,
    proceed,
    request: updatedRequest,
    warnings,
    draft,
    sourceMessageId: quote.inboundMessageId,
  };
}
