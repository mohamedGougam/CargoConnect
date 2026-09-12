import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { compareQuotesForRequest } from "@/server/commercial/comparison/compareQuotes";
import type {
  QuoteComparisonPreference,
  QuoteComparisonWeights,
} from "@/domain/commercial/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/commercial/requests/:id/compare
 * Query: preference=best_overall|lowest_cost|fastest_transit|earliest_departure|custom
 * Optional custom weights: cost,departure,transit,completeness (0–1)
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const preference = (url.searchParams.get("preference") ??
    "best_overall") as QuoteComparisonPreference;

  const allowed: QuoteComparisonPreference[] = [
    "best_overall",
    "lowest_cost",
    "fastest_transit",
    "earliest_departure",
    "custom",
  ];
  if (!allowed.includes(preference)) {
    return NextResponse.json({ error: "Invalid preference" }, { status: 400 });
  }

  let weights: Partial<QuoteComparisonWeights> | undefined;
  if (preference === "custom") {
    weights = {
      cost: numParam(url, "cost"),
      departure: numParam(url, "departure"),
      transit: numParam(url, "transit"),
      completeness: numParam(url, "completeness"),
    };
  }

  const result = await compareQuotesForRequest({
    requestId: id,
    userId: user.id,
    preference,
    weights,
    recordViewAudit: true,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "not_found" ? 404 : 400 },
    );
  }

  const { getRepositories } = await import("@/server/commercial/repos");
  const selection = await getRepositories().selections.getActiveForRequest(id);
  const proceed = await getRepositories().proceedRequests.getLatestForRequest(id);
  const selectionLocked =
    result.request.status === "AWAITING_CONFIRMATION" ||
    result.request.status === "PROCEED_SENDING" ||
    Boolean(selection?.lockedAt) ||
    proceed?.status === "SENT" ||
    proceed?.status === "DELIVERY_SIMULATED";

  return NextResponse.json({
    request: {
      id: result.request.id,
      type: result.request.type,
      status: result.request.status,
      origin: result.request.origin?.name,
      destination: result.request.destination?.name,
      cargo: result.request.cargo,
    },
    selection: selection
      ? {
          id: selection.id,
          quoteId: selection.commercialQuoteId,
          selectedAt: selection.selectedAt,
          locked: selectionLocked,
        }
      : null,
    stats: result.stats,
    preference: result.ranking.preference,
    weights: result.ranking.weights,
    summaryNotes: result.ranking.summaryNotes,
    recommendation: result.ranking.recommendation,
    quotes: result.ranking.ranked.map((r) => ({
      ...r.normalized,
      score: r.score,
      rank: r.rank,
      dimensionNotes: r.dimensionNotes,
      incomparableReason: r.incomparableReason,
      // provenance
      sourceMessageId: r.normalized.inboundMessageId,
      storedQuoteId: r.normalized.quoteId,
      selected: selection?.commercialQuoteId === r.normalized.quoteId,
    })),
  });
}

function numParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
