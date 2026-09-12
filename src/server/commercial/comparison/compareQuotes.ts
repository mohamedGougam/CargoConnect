import type {
  CommercialQuote,
  CommercialRequest,
  NormalizedCommercialQuote,
  QuoteComparisonPreference,
  QuoteComparisonWeights,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { normalizeCommercialQuote } from "./normalize";
import { rankQuotes, type RankingResult } from "./rank";

export interface CompareQuotesResult {
  request: CommercialRequest;
  quotes: CommercialQuote[];
  normalized: NormalizedCommercialQuote[];
  ranking: RankingResult;
  stats: {
    responses: number;
    quotes: number;
    comparablePrices: number;
    latestResponseAt: string | null;
  };
}

export async function compareQuotesForRequest(input: {
  requestId: string;
  userId: string;
  preference?: QuoteComparisonPreference;
  weights?: Partial<QuoteComparisonWeights>;
  recordViewAudit?: boolean;
}): Promise<CompareQuotesResult | { error: string; code: string }> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.userId) {
    return { error: "Not found", code: "not_found" };
  }

  const [quotes, messages] = await Promise.all([
    repos.quotes.listForRequest(request.id),
    repos.messages.listForRequest(request.id),
  ]);

  // Only include quote-classified commercial offers in price comparison.
  const quoteRows = quotes.filter(
    (q) =>
      q.responseClassification === "QUOTE" ||
      q.freightRate != null ||
      q.totalPrice != null,
  );

  const normalized = quoteRows.map((q) =>
    normalizeCommercialQuote({ quote: q, request }),
  );

  const preference = input.preference ?? "best_overall";
  const ranking = rankQuotes({
    quotes: normalized,
    preference,
    weights: input.weights,
  });

  const inbound = messages.filter((m) => m.direction === "INBOUND");
  const latestResponseAt =
    inbound
      .map((m) => m.receivedAt ?? m.createdAt)
      .sort()
      .at(-1) ?? null;

  if (input.recordViewAudit) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: request.id,
      userId: input.userId,
      eventType: "QUOTE_COMPARISON_VIEWED",
      metadata: {
        preference,
        quoteCount: quoteRows.length,
        comparablePrices: normalized.filter((n) => n.priceComparable).length,
      },
      createdAt: new Date().toISOString(),
    });
  }

  return {
    request,
    quotes: quoteRows,
    normalized,
    ranking,
    stats: {
      responses: inbound.length,
      quotes: quoteRows.length,
      comparablePrices: normalized.filter((n) => n.priceComparable).length,
      latestResponseAt,
    },
  };
}

export async function buildRequestQuoteSummary(input: {
  requestId: string;
  userId: string;
}): Promise<{
  responses: number;
  quotes: number;
  comparablePrices: number;
  latestResponseAt: string | null;
  bestOverall: { organization: string; quoteId: string } | null;
} | null> {
  const result = await compareQuotesForRequest({
    requestId: input.requestId,
    userId: input.userId,
    preference: "best_overall",
    recordViewAudit: false,
  });
  if ("error" in result) return null;
  return {
    responses: result.stats.responses,
    quotes: result.stats.quotes,
    comparablePrices: result.stats.comparablePrices,
    latestResponseAt: result.stats.latestResponseAt,
    bestOverall:
      result.stats.comparablePrices >= 2 && result.ranking.recommendation
        ? {
            organization: result.ranking.recommendation.organization,
            quoteId: result.ranking.recommendation.quoteId,
          }
        : null,
  };
}
