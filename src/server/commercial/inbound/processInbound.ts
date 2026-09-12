import type { CommercialQuote } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import type {
  CommercialMessage,
  CommercialMessageAttachment,
} from "@/server/commercial/repos/types";
import { isAttachmentAllowed } from "./attachments";
import {
  correlateInboundToRequest,
  evaluateSenderTrust,
  normalizeMessageId,
} from "./correlate";
import { extractQuoteDeterministic } from "./extractQuote";

export interface InboundEmailPayload {
  provider: string;
  providerMessageId: string;
  fromAddress: string;
  fromName?: string | null;
  toAddresses: string[];
  ccAddresses?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  internetMessageId?: string | null;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  receivedAt?: string;
  attachments?: Array<{
    id?: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
  }>;
  rawMetadata?: Record<string, unknown>;
}

export type ProcessInboundResult =
  | {
      ok: true;
      duplicate?: boolean;
      message: CommercialMessage;
      quote?: CommercialQuote | null;
      unmatched?: boolean;
    }
  | { ok: false; error: string; code: string };

/**
 * Persist inbound commercial email, correlate, extract quote, update status.
 * Idempotent on (provider, providerMessageId).
 */
export async function processInboundEmail(
  input: InboundEmailPayload,
): Promise<ProcessInboundResult> {
  const repos = getRepositories();
  const providerMessageId = input.providerMessageId?.trim();
  if (!providerMessageId) {
    return { ok: false, error: "Missing provider message id", code: "malformed" };
  }
  if (!input.fromAddress?.trim() || input.toAddresses.length === 0) {
    return { ok: false, error: "Malformed inbound payload", code: "malformed" };
  }

  const existing = await repos.messages.findByProviderMessageId(
    input.provider,
    providerMessageId,
  );
  if (existing) {
    return { ok: true, duplicate: true, message: existing };
  }

  const now = input.receivedAt ?? new Date().toISOString();
  const correlation = await correlateInboundToRequest({
    toAddresses: input.toAddresses,
    inReplyTo: input.inReplyTo,
    referencesHeader: input.referencesHeader,
  });

  const request = correlation.request;
  const senderTrust = evaluateSenderTrust({
    fromAddress: input.fromAddress,
    request,
  });

  const extraction = extractQuoteDeterministic({
    subject: input.subject,
    textBody: input.textBody,
    requestType: request?.type,
  });

  const message: CommercialMessage = {
    id: newId("msg"),
    commercialRequestId: request?.id ?? null,
    direction: "INBOUND",
    provider: input.provider,
    providerMessageId,
    internetMessageId: input.internetMessageId
      ? normalizeMessageId(input.internetMessageId)
      : null,
    inReplyTo: input.inReplyTo ? normalizeMessageId(input.inReplyTo) : null,
    referencesHeader: input.referencesHeader ?? null,
    fromAddress: input.fromAddress.trim(),
    fromName: input.fromName ?? null,
    replyTo: "",
    toAddress: input.toAddresses.join(", "),
    ccAddresses: input.ccAddresses?.join(", ") ?? null,
    subject: input.subject.slice(0, 500),
    bodySnapshot: input.textBody.slice(0, 100_000),
    htmlSnapshot: input.htmlBody?.slice(0, 200_000) ?? null,
    deliveryStatus: "RECEIVED",
    errorMessage: null,
    senderTrust,
    correlationMethod: correlation.method,
    responseClassification: extraction.quote.responseClassification,
    rawMetadata: {
      ...(input.rawMetadata ?? {}),
      // never store secrets
      toCount: input.toAddresses.length,
    },
    createdAt: now,
    sentAt: null,
    receivedAt: now,
  };

  await repos.messages.create(message);

  const attachmentRows: CommercialMessageAttachment[] = [];
  for (const att of input.attachments ?? []) {
    const check = isAttachmentAllowed({
      filename: att.filename,
      contentType: att.contentType,
      sizeBytes: att.sizeBytes,
    });
    if (!check.ok) continue;
    attachmentRows.push({
      id: newId("att"),
      commercialMessageId: message.id,
      filename: check.filename,
      contentType: att.contentType || "application/octet-stream",
      sizeBytes: att.sizeBytes,
      providerAttachmentId: att.id ?? null,
      storageReference: null,
      createdAt: now,
    });
  }
  await repos.attachments.createMany(attachmentRows);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request?.id ?? null,
    userId: request?.userId ?? null,
    eventType: "INBOUND_EMAIL_RECEIVED",
    metadata: {
      provider: input.provider,
      providerMessageId,
      senderTrust,
      attachmentCount: attachmentRows.length,
    },
    createdAt: now,
  });

  if (!request) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: null,
      userId: null,
      eventType: "INBOUND_EMAIL_UNMATCHED",
      metadata: { provider: input.provider, providerMessageId },
      createdAt: now,
    });
    return { ok: true, message, unmatched: true, quote: null };
  }

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: request.userId,
    eventType: "INBOUND_EMAIL_CORRELATED",
    metadata: {
      method: correlation.method,
      senderTrust,
      messageId: message.id,
    },
    createdAt: now,
  });

  // Only live SENT requests become RESPONSE_RECEIVED
  if (request.status === "SENT" || request.status === "RESPONSE_RECEIVED") {
    if (request.status === "SENT") {
      const updated = {
        ...request,
        status: "RESPONSE_RECEIVED" as const,
        updatedAt: now,
      };
      await repos.requests.save(updated);
      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: request.id,
        userId: request.userId,
        eventType: "COMMERCIAL_RESPONSE_RECEIVED",
        metadata: { messageId: message.id },
        createdAt: now,
      });
    }
  }

  // After proceed: classify, extract, compare — never auto-book
  let proceedConfirmationHandled = false;
  if (
    request.status === "AWAITING_CONFIRMATION" ||
    request.status === "CONFIRMATION_RECEIVED" ||
    request.status === "CONFIRMATION_REVIEW_REQUIRED" ||
    request.status === "TERMS_CHANGED" ||
    request.status === "MORE_INFORMATION_REQUIRED"
  ) {
    try {
      const { processProceedConfirmationReply } = await import(
        "@/server/commercial/confirmation/acknowledgeConfirmation"
      );
      const result = await processProceedConfirmationReply({
        request,
        message,
        subject: input.subject,
        textBody: input.textBody ?? "",
      });
      Object.assign(request, result.request);
      proceedConfirmationHandled = true;
    } catch {
      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: request.id,
        userId: request.userId,
        eventType: "COMMERCIAL_RESPONSE_RECEIVED",
        metadata: {
          messageId: message.id,
          note: "Proceed confirmation processing failed — reply stored",
        },
        createdAt: now,
      });
    }
  }

  // Skip quote supersession for proceed-confirmation replies (preserve selected quote)
  // Still attempt operational milestone candidates when an execution exists.
  try {
    const { createEmailMilestoneCandidates } = await import(
      "@/server/execution/emailMilestoneCandidates"
    );
    await createEmailMilestoneCandidates({
      commercialRequestId: request.id,
      inboundMessageId: message.id,
      fromAddress: message.fromAddress,
      senderTrust: message.senderTrust ?? null,
      textBody: input.textBody ?? "",
    });
  } catch {
    // Non-fatal — inbound reply remains stored
  }

  try {
    const { createVesselSubstitutionException } = await import(
      "@/server/exceptions/vesselSubstitution"
    );
    const { evaluateExceptionsForBooking } = await import(
      "@/server/exceptions/evaluateExceptions"
    );
    await createVesselSubstitutionException({
      commercialRequestId: request.id,
      inboundMessageId: message.id,
      textBody: input.textBody ?? "",
    });
    const booking = await repos.bookings.getForRequest(request.id);
    if (booking) {
      await evaluateExceptionsForBooking(booking.id);
    }
  } catch {
    // Non-fatal
  }

  if (proceedConfirmationHandled) {
    return { ok: true, message, quote: null, unmatched: false };
  }

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: request.userId,
    eventType: "QUOTE_EXTRACTION_STARTED",
    metadata: { messageId: message.id, method: "deterministic" },
    createdAt: now,
  });

  let quote: CommercialQuote | null = null;
  try {
    const existingQuotes = await repos.quotes.listForRequest(request.id);
    const orgName =
      request.recipient?.organizationName ??
      message.fromName ??
      null;
    const contactId = request.recipient?.contactId ?? null;

    // Same organization + monetary offer → new version, preserve history
    const priorLatest =
      orgName
        ? existingQuotes
            .filter(
              (q) =>
                q.isLatest !== false &&
                (q.organizationName === orgName ||
                  q.contactId === contactId) &&
                (q.freightRate != null || q.totalPrice != null),
            )
            .at(-1)
        : undefined;

    let version = 1;
    let supersedesQuoteId: string | null = null;
    if (priorLatest && extraction.hasMonetaryQuote) {
      version = (priorLatest.version ?? 1) + 1;
      supersedesQuoteId = priorLatest.id;
      const superseded: CommercialQuote = {
        ...priorLatest,
        isLatest: false,
        quoteStatus: "SUPERSEDED",
        updatedAt: now,
      };
      await repos.quotes.update(superseded);
      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: request.id,
        userId: request.userId,
        eventType: "QUOTE_SUPERSEDED",
        metadata: {
          previousQuoteId: priorLatest.id,
          organization: orgName,
        },
        createdAt: now,
      });
    }

    quote = {
      id: newId("quote"),
      commercialRequestId: request.id,
      inboundMessageId: message.id,
      organizationName: orgName,
      contactId,
      ...extraction.quote,
      quoteStatus: "PARSED",
      version,
      supersedesQuoteId,
      isLatest: true,
      corrections: [],
      createdAt: now,
      updatedAt: now,
    };
    await repos.quotes.create(quote);
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: request.id,
      userId: request.userId,
      eventType: "QUOTE_EXTRACTED",
      metadata: {
        quoteId: quote.id,
        hasMonetaryQuote: extraction.hasMonetaryQuote,
        classification: quote.responseClassification,
        confidence: quote.extractionConfidence,
        version,
      },
      createdAt: now,
    });
  } catch {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: request.id,
      userId: request.userId,
      eventType: "QUOTE_EXTRACTION_FAILED",
      metadata: { messageId: message.id },
      createdAt: now,
    });
  }

  return { ok: true, message, quote, unmatched: false };
}
