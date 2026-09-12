import type {
  CommercialQuote,
  CommercialRequest,
  SelectedCommercialQuote,
} from "@/domain/commercial/types";
import {
  effectiveQuote,
  expiryState,
} from "@/server/commercial/comparison/normalize";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const SELECTABLE_REQUEST_STATUSES = new Set([
  "RESPONSE_RECEIVED",
  "QUOTE_SELECTED",
  "PROCEED_READY_TO_SEND",
  "PROCEED_SEND_FAILED",
]);

export type SelectQuoteResult =
  | { ok: true; selection: SelectedCommercialQuote; request: CommercialRequest; quote: CommercialQuote }
  | { ok: false; error: string; code: string };

export async function selectCommercialQuote(input: {
  requestId: string;
  quoteId: string;
  userId: string;
  preferenceSnapshot?: string | null;
  selectionReason?: string | null;
}): Promise<SelectQuoteResult> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.userId) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  if (
    request.status === "AWAITING_CONFIRMATION" ||
    request.status === "PROCEED_SENDING"
  ) {
    return {
      ok: false,
      error: "Cannot change quote selection after a proceed request was sent",
      code: "selection_locked",
    };
  }

  if (!SELECTABLE_REQUEST_STATUSES.has(request.status)) {
    return {
      ok: false,
      error: "Quotes can only be selected after responses are received",
      code: "invalid_status",
    };
  }

  const quote = await repos.quotes.get(input.quoteId);
  if (!quote || quote.commercialRequestId !== request.id) {
    return { ok: false, error: "Quote not found", code: "not_found" };
  }

  if (quote.isLatest === false || quote.quoteStatus === "SUPERSEDED") {
    return {
      ok: false,
      error: "A newer version of this quote is available. Please review it before selecting.",
      code: "quote_superseded",
    };
  }

  const effective = effectiveQuote(quote);
  if (expiryState(effective.validityUntil) === "expired") {
    return { ok: false, error: "Quote expired", code: "quote_expired" };
  }

  const existing = await repos.selections.getActiveForRequest(request.id);
  const now = new Date().toISOString();
  await repos.selections.deactivateAllForRequest(request.id);

  const selection: SelectedCommercialQuote = {
    id: newId("sel"),
    commercialRequestId: request.id,
    commercialQuoteId: quote.id,
    userId: input.userId,
    selectedAt: now,
    selectionReason: input.selectionReason ?? null,
    preferenceSnapshot: input.preferenceSnapshot ?? null,
    active: true,
    lockedAt: null,
  };
  await repos.selections.create(selection);

  const updated: CommercialRequest = {
    ...request,
    status: "QUOTE_SELECTED",
    selectedQuoteSelectionId: selection.id,
    updatedAt: now,
  };
  await repos.requests.save(updated);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: existing ? "QUOTE_SELECTION_CHANGED" : "QUOTE_SELECTED",
    metadata: {
      selectionId: selection.id,
      quoteId: quote.id,
      previousQuoteId: existing?.commercialQuoteId,
      organization: quote.organizationName,
    },
    createdAt: now,
  });

  return { ok: true, selection, request: updated, quote };
}

export async function deselectCommercialQuote(input: {
  requestId: string;
  userId: string;
}): Promise<SelectQuoteResult | { ok: true; deselected: true; request: CommercialRequest }> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.userId) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }
  if (
    request.status === "AWAITING_CONFIRMATION" ||
    request.status === "PROCEED_SENDING"
  ) {
    return {
      ok: false,
      error: "Cannot change quote selection after a proceed request was sent",
      code: "selection_locked",
    };
  }

  await repos.selections.deactivateAllForRequest(request.id);
  const now = new Date().toISOString();
  const updated: CommercialRequest = {
    ...request,
    status: "RESPONSE_RECEIVED",
    selectedQuoteSelectionId: null,
    updatedAt: now,
  };
  await repos.requests.save(updated);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "QUOTE_DESELECTED",
    metadata: {},
    createdAt: now,
  });
  return { ok: true, deselected: true, request: updated };
}
