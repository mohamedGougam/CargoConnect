import type { CommercialQuote } from "@/domain/commercial/types";

/**
 * Completeness is about extracted field coverage — not broker trustworthiness.
 * Returns 0–1.
 */
export function computeCompletenessScore(quote: CommercialQuote): number {
  const checks: boolean[] = [
    quote.freightRate != null || quote.totalPrice != null,
    Boolean(quote.currency),
    Boolean(quote.rateUnit) || quote.priceBasis === "lump_sum" || quote.totalPrice != null,
    Boolean(quote.estimatedDeparture),
    Boolean(quote.transitTime),
    Boolean(quote.validityUntil),
    Boolean(quote.vesselName) || Boolean(quote.vesselType),
    Boolean(quote.includedCharges) || Boolean(quote.excludedCharges),
    Boolean(quote.paymentTerms),
  ];
  const hit = checks.filter(Boolean).length;
  return Math.round((hit / checks.length) * 100) / 100;
}

export function confidenceLabel(
  score: number,
): "High" | "Medium" | "Low" {
  if (score >= 0.7) return "High";
  if (score >= 0.4) return "Medium";
  return "Low";
}
