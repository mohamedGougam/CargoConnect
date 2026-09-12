import type {
  CommercialQuote,
  QuoteFieldCorrection,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const ALLOWED_FIELDS = new Set([
  "currency",
  "totalPrice",
  "priceBasis",
  "freightRate",
  "rateUnit",
  "quantityTons",
  "estimatedDeparture",
  "estimatedArrival",
  "transitTime",
  "validityUntil",
  "vesselName",
  "vesselType",
  "includedCharges",
  "excludedCharges",
  "paymentTerms",
  "commercialTerms",
  "notes",
  "organizationName",
]);

export type CorrectQuoteResult =
  | { ok: true; quote: CommercialQuote }
  | { ok: false; error: string; code: string };

/**
 * Manual correction of extracted fields. Broker email remains immutable.
 * Originals preserved in corrections[]; live fields updated for comparison.
 */
export async function correctCommercialQuote(input: {
  quoteId: string;
  userId: string;
  patch: Record<string, unknown>;
}): Promise<CorrectQuoteResult> {
  const repos = getRepositories();
  const quote = await repos.quotes.get(input.quoteId);
  if (!quote) return { ok: false, error: "Quote not found", code: "not_found" };

  const request = await repos.requests.get(quote.commercialRequestId);
  if (!request || request.userId !== input.userId) {
    return { ok: false, error: "Quote not found", code: "not_found" };
  }

  const now = new Date().toISOString();
  const corrections: QuoteFieldCorrection[] = [...(quote.corrections ?? [])];
  const next: CommercialQuote = { ...quote };
  let changed = 0;

  for (const [field, value] of Object.entries(input.patch)) {
    if (!ALLOWED_FIELDS.has(field)) continue;
    const originalValue = (quote as unknown as Record<string, unknown>)[field];
    if (JSON.stringify(originalValue) === JSON.stringify(value)) continue;

    // If already corrected, original stays the first extracted value.
    const prior = corrections.find((c) => c.field === field);
    corrections.push({
      field,
      originalValue: prior ? prior.originalValue : originalValue,
      correctedValue: value,
      correctedByUserId: input.userId,
      correctedAt: now,
    });
    (next as unknown as Record<string, unknown>)[field] = value;
    changed += 1;
  }

  if (changed === 0) {
    return { ok: false, error: "No valid corrections provided", code: "validation" };
  }

  next.corrections = corrections;
  next.quoteStatus = "REVIEWED";
  next.extractionMethod =
    quote.extractionMethod === "manual" ? "manual" : quote.extractionMethod;
  next.updatedAt = now;

  await repos.quotes.update(next);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "QUOTE_CORRECTED",
    metadata: {
      quoteId: quote.id,
      fields: corrections.slice(-changed).map((c) => c.field),
    },
    createdAt: now,
  });

  return { ok: true, quote: next };
}
