import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { prepareProceedRequest } from "@/server/commercial/proceed/prepareProceed";
import { updateProceedDraft } from "@/server/commercial/proceed/updateProceedDraft";
import { getRepositories } from "@/server/commercial/repos";
import {
  effectiveQuote,
  expiryState,
  normalizeCommercialQuote,
} from "@/server/commercial/comparison/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/commercial/requests/:id/proceed
 * Prepares (or returns) the proceed review payload for the active selection.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const repos = getRepositories();
  const existing = await repos.requests.get(id);
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If already sent, return read-only snapshot
  const latestProceed = await repos.proceedRequests.getLatestForRequest(id);
  if (
    latestProceed &&
    (latestProceed.status === "SENT" ||
      latestProceed.status === "DELIVERY_SIMULATED")
  ) {
    return NextResponse.json({
      locked: true,
      proceed: latestProceed,
      request: existing,
      warnings: [],
      draft: { subject: latestProceed.subject, body: latestProceed.body },
      sourceMessageId: latestProceed.snapshot.inboundMessageId,
    });
  }

  const result = await prepareProceedRequest({ requestId: id, user });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "quote_expired" ||
            result.code === "quote_superseded" ||
            result.code === "already_sent"
          ? 409
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  const quote = await repos.quotes.get(result.proceed.commercialQuoteId);
  const normalized = quote
    ? normalizeCommercialQuote({ quote, request: result.request })
    : null;

  return NextResponse.json({
    locked: false,
    proceed: result.proceed,
    request: result.request,
    warnings: result.warnings,
    draft: result.draft,
    sourceMessageId: result.sourceMessageId,
    quote: quote
      ? {
          id: quote.id,
          organizationName: quote.organizationName,
          version: quote.version,
          currency: effectiveQuote(quote).currency,
          freightRate: effectiveQuote(quote).freightRate,
          rateUnit: effectiveQuote(quote).rateUnit,
          estimatedDeparture: effectiveQuote(quote).estimatedDeparture,
          transitTime: effectiveQuote(quote).transitTime,
          validityUntil: effectiveQuote(quote).validityUntil,
          vesselName: effectiveQuote(quote).vesselName,
          includedCharges: effectiveQuote(quote).includedCharges,
          excludedCharges: effectiveQuote(quote).excludedCharges,
          paymentTerms: effectiveQuote(quote).paymentTerms,
          expiryState: expiryState(effectiveQuote(quote).validityUntil),
          confidenceLabel: normalized?.confidenceLabel,
          hasManualCorrections: Boolean(quote.corrections?.length),
        }
      : null,
  });
}

/** PATCH — edit subject/body before send */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    proceedId?: string;
    subject?: string;
    body?: string;
  };

  if (!body.proceedId) {
    return NextResponse.json({ error: "proceedId required" }, { status: 400 });
  }

  const result = await updateProceedDraft({
    requestId: id,
    proceedId: body.proceedId,
    userId: user.id,
    subject: body.subject,
    body: body.body,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      {
        status:
          result.code === "not_found" ? 404 : result.code === "locked" ? 409 : 400,
      },
    );
  }

  return NextResponse.json({
    proceed: result.proceed,
    request: result.request,
  });
}
