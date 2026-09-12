import type {
  CommercialResponseClassification,
  CommercialQuote,
} from "@/domain/commercial/types";

export interface QuoteExtractionResult {
  quote: Omit<
    CommercialQuote,
    "id" | "commercialRequestId" | "inboundMessageId" | "createdAt" | "updatedAt"
  >;
  hasMonetaryQuote: boolean;
}

/**
 * Deterministic maritime quote extraction — never invents missing terms.
 */
export function extractQuoteDeterministic(input: {
  subject: string;
  textBody: string;
  requestType?: "QUOTE" | "RESERVATION";
}): QuoteExtractionResult {
  const text = `${input.subject}\n${input.textBody}`;
  const lower = text.toLowerCase();

  const currency =
    matchFirst(text, /\b(USD|EUR|GBP|AED|SAR)\b/i) ??
    (/\$/.test(text) ? "USD" : null);

  const rateMatch =
    text.match(
      /(?:USD|EUR|GBP|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|\d+(?:\.\d+)?)\s*(?:\/|\s+per\s+)(MT|mt|ton(?:ne)?s?|W\/M|cbm|teu)/i,
    ) ??
    text.match(
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|\d+(?:\.\d+)?)\s*(USD|EUR|GBP)\s*(?:\/|\s+per\s+)(MT|mt|ton(?:ne)?s?)/i,
    );

  let freightRate: number | null = null;
  let rateUnit: string | null = null;
  if (rateMatch) {
    freightRate = parseNumber(rateMatch[1]);
    rateUnit = normalizeUnit(rateMatch[2] ?? rateMatch[3] ?? "MT");
  } else {
    const alt = text.match(
      /(?:offer|rate|freight)\s*(?:of|:)?\s*(?:USD|EUR|\$)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|per\s+)?(MT|mt|ton)/i,
    );
    if (alt) {
      freightRate = parseNumber(alt[1]);
      rateUnit = normalizeUnit(alt[2]);
    }
  }

  const quantityMatch = text.match(
    /\b([0-9]{1,3}(?:,[0-9]{3})*|\d+)\s*(?:MT|mt|tons?|tonnes?)\b/,
  );
  const quantityTons = quantityMatch ? parseNumber(quantityMatch[1]) : null;

  const transit =
    matchFirst(
      text,
      /transit\s*(?:time|approx\.?|approximately)?\s*(?:of|:)?\s*([0-9]+(?:\s*[–-]\s*[0-9]+)?\s*days?)/i,
    ) ??
    matchFirst(text, /\b([0-9]+\s*[–-]\s*[0-9]+\s*days?)\b/i);

  const validity =
    matchFirst(
      text,
      /(?:valid(?:ity)?(?:\s+until)?|rate valid until|offer valid until)\s*:?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    ) ?? null;

  const departure =
    matchFirst(
      text,
      /(?:laycan|ets|etd|estimated departure|departure)\s*:?\s*([0-9]{1,2}\s*[–-]?\s*[0-9]{0,2}\s*[A-Za-z]+(?:\s+[0-9]{4})?)/i,
    ) ?? null;

  const routeMatch = text.match(
    /([A-Za-z][A-Za-z\s-]{2,40}?)\s*(?:→|->|\/|to)\s*([A-Za-z][A-Za-z\s-]{2,40})/i,
  );

  const asksForInfo =
    /\b(please (provide|advise|confirm)|need (more )?details|dimensions|packing list|what is the)\b/i.test(
      text,
    ) && freightRate == null;

  const reservationLanguage =
    /\b(space (is )?held|reservation (is )?(confirmed|accepted)|we can reserve|hold subject)\b/i.test(
      text,
    );

  const availabilityLanguage =
    /\b(vessel available|tonnage available|can offer tonnage|open vessel)\b/i.test(
      text,
    );

  let responseClassification: CommercialResponseClassification = "UNKNOWN";
  if (freightRate != null) responseClassification = "QUOTE";
  else if (reservationLanguage) responseClassification = "RESERVATION_RESPONSE";
  else if (asksForInfo) responseClassification = "INFORMATION_REQUEST";
  else if (availabilityLanguage) responseClassification = "AVAILABILITY_RESPONSE";
  else if (lower.trim().length > 0) responseClassification = "GENERAL_REPLY";

  // Do not claim booking confirmation from soft language alone.
  if (
    responseClassification === "RESERVATION_RESPONSE" &&
    !/\b(confirmed|confirmation)\b/i.test(text)
  ) {
    // keep as reservation response but notes clarify non-binding
  }

  const filled = [
    currency,
    freightRate,
    rateUnit,
    quantityTons,
    transit,
    validity,
    departure,
  ].filter((v) => v != null && v !== "").length;

  const confidence =
    freightRate != null
      ? Math.min(0.95, 0.55 + filled * 0.06)
      : asksForInfo
        ? 0.7
        : 0.35;

  return {
    hasMonetaryQuote: freightRate != null,
    quote: {
      currency,
      totalPrice: null,
      priceBasis: freightRate != null ? "freight_rate" : null,
      freightRate,
      rateUnit,
      quantityTons,
      origin: routeMatch?.[1]?.trim() ?? null,
      destination: routeMatch?.[2]?.trim() ?? null,
      vesselName: matchFirst(text, /(?:m\/?v|vessel)\s+([A-Z][A-Za-z0-9 .'-]{2,40})/),
      vesselType: null,
      estimatedDeparture: departure,
      estimatedArrival: null,
      transitTime: transit,
      validityUntil: validity,
      freeTime: matchFirst(text, /free\s*time\s*:?\s*([^\n.;]+)/i),
      demurrage: matchFirst(text, /demurrage\s*:?\s*([^\n.;]+)/i),
      detention: matchFirst(text, /detention\s*:?\s*([^\n.;]+)/i),
      includedCharges: null,
      excludedCharges: null,
      paymentTerms: matchFirst(text, /payment\s*terms?\s*:?\s*([^\n.;]+)/i),
      commercialTerms: null,
      notes:
        responseClassification === "RESERVATION_RESPONSE"
          ? "Reservation-related language detected — not treated as a confirmed booking."
          : null,
      extractionConfidence: confidence,
      extractionMethod: "deterministic",
      responseClassification,
    },
  };
}

function matchFirst(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u.startsWith("ton") || u === "mt") return "MT";
  if (u === "w/m") return "W/M";
  return raw.toUpperCase();
}
