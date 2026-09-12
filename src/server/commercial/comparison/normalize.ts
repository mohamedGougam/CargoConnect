import type {
  CommercialQuote,
  CommercialRequest,
  NormalizedCommercialQuote,
  NormalizedRateUnit,
  QuoteExpiryState,
} from "@/domain/commercial/types";
import { computeCompletenessScore, confidenceLabel } from "./completeness";
import { convertToUsd, isFxEnabled } from "./fx";

const CORRECTABLE = new Set([
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

/** Apply manual corrections for comparison without losing originals in corrections[]. */
export function effectiveQuote(quote: CommercialQuote): CommercialQuote {
  if (!quote.corrections?.length) return quote;
  const next: CommercialQuote = { ...quote };
  for (const c of quote.corrections) {
    if (!CORRECTABLE.has(c.field)) continue;
    (next as unknown as Record<string, unknown>)[c.field] = c.correctedValue;
  }
  return next;
}

export function normalizeRateUnit(raw?: string | null, priceBasis?: string | null): NormalizedRateUnit {
  if (priceBasis === "lump_sum" || /lump\s*sum/i.test(raw ?? "")) return "LUMP_SUM";
  const u = (raw ?? "").trim().toUpperCase();
  if (!u) return "UNKNOWN";
  if (u === "MT" || u.startsWith("TON")) return "MT";
  if (u === "M3" || u === "CBM" || u === "M³") return "M3";
  if (u === "TEU") return "TEU";
  if (u === "W/M") return "OTHER";
  return "OTHER";
}

export function parseTransitDays(
  transitTime?: string | null,
): { min: number | null; max: number | null } {
  if (!transitTime) return { min: null, max: null };
  const range = transitTime.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const single = transitTime.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  return { min: null, max: null };
}

export function parseDepartureWindow(raw?: string | null): {
  label: string | null;
  start: string | null;
  end: string | null;
  sortKey: number | null;
} {
  if (!raw?.trim()) {
    return { label: null, start: null, end: null, sortKey: null };
  }
  const label = raw.trim();
  // Prefer ISO dates
  const iso = label.match(/(\d{4}-\d{2}-\d{2})/g);
  if (iso?.length) {
    const start = iso[0];
    const end = iso[1] ?? iso[0];
    return {
      label,
      start,
      end,
      sortKey: Date.parse(start),
    };
  }
  // "18–20 September" or "18 September"
  const window = label.match(
    /(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/,
  );
  if (window) {
    const year = window[4] ? Number(window[4]) : guessYear();
    const month = monthIndex(window[3]);
    if (month >= 0) {
      const startDate = new Date(Date.UTC(year, month, Number(window[1])));
      const endDate = new Date(Date.UTC(year, month, Number(window[2])));
      return {
        label,
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10),
        sortKey: startDate.getTime(),
      };
    }
  }
  const single = label.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
  if (single) {
    const year = single[3] ? Number(single[3]) : guessYear();
    const month = monthIndex(single[2]);
    if (month >= 0) {
      const d = new Date(Date.UTC(year, month, Number(single[1])));
      return {
        label,
        start: d.toISOString().slice(0, 10),
        end: d.toISOString().slice(0, 10),
        sortKey: d.getTime(),
      };
    }
  }
  return { label, start: null, end: null, sortKey: null };
}

export function expiryState(
  validityUntil?: string | null,
  now = new Date(),
): QuoteExpiryState {
  if (!validityUntil?.trim()) return "unknown";
  const parsed = parseLooseDate(validityUntil);
  if (!parsed) return "unknown";
  const ms = parsed.getTime() - now.getTime();
  if (ms < 0) return "expired";
  if (ms <= 3 * 24 * 60 * 60 * 1000) return "expiring_soon";
  return "valid";
}

export function estimateFreightAmount(input: {
  quote: CommercialQuote;
  shipmentQuantityTons?: number | null;
}): {
  amount: number | null;
  label: string;
  warnings: string[];
} {
  const q = input.quote;
  const warnings: string[] = [];

  if (q.totalPrice != null && Number.isFinite(q.totalPrice)) {
    return {
      amount: q.totalPrice,
      label: "Estimated freight amount (lump sum)",
      warnings,
    };
  }

  if (q.freightRate == null || !Number.isFinite(q.freightRate)) {
    return {
      amount: null,
      label: "Estimated freight amount unavailable",
      warnings: ["No freight rate or lump sum present"],
    };
  }

  const unit = normalizeRateUnit(q.rateUnit, q.priceBasis);
  if (unit === "LUMP_SUM") {
    return {
      amount: q.freightRate,
      label: "Estimated freight amount (lump sum)",
      warnings,
    };
  }

  if (unit !== "MT") {
    warnings.push(
      `Rate unit ${q.rateUnit ?? "unknown"} is not safely convertible from shipment tonnage`,
    );
    return {
      amount: null,
      label: "Estimated freight amount unavailable",
      warnings,
    };
  }

  const qty = q.quantityTons ?? input.shipmentQuantityTons ?? null;
  if (qty == null || !Number.isFinite(qty) || qty <= 0) {
    warnings.push("Shipment quantity unknown — cannot calculate unit-rate total");
    return {
      amount: null,
      label: "Estimated freight amount unavailable",
      warnings,
    };
  }

  return {
    amount: Math.round(q.freightRate * qty * 100) / 100,
    label: "Estimated freight amount",
    warnings,
  };
}

export function splitCharges(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;|]|(?:\s*,\s*)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeCommercialQuote(input: {
  quote: CommercialQuote;
  request: CommercialRequest;
  now?: Date;
}): NormalizedCommercialQuote {
  const base = effectiveQuote(input.quote);
  const warnings: string[] = [];
  const rateUnit = normalizeRateUnit(base.rateUnit, base.priceBasis);
  const freight = estimateFreightAmount({
    quote: base,
    shipmentQuantityTons: input.request.cargo.weightTons,
  });
  warnings.push(...freight.warnings);

  if (base.excludedCharges) {
    warnings.push("Excluded charges are listed — estimated freight is not a final total cost");
  }

  const currency = base.currency?.toUpperCase() ?? null;
  let normalizedTotal: number | null = null;
  let normalizedCurrency: string | null = null;
  let fxApplied = false;
  let fxRate: number | null = null;
  let fxSource: string | null = null;
  let fxTimestamp: string | null = null;
  let priceComparable = false;

  if (freight.amount != null && currency) {
    if (currency === "USD") {
      normalizedTotal = freight.amount;
      normalizedCurrency = "USD";
      priceComparable = true;
    } else if (isFxEnabled()) {
      const fx = convertToUsd(freight.amount, currency);
      if (fx.ok) {
        normalizedTotal = Math.round(fx.amountUsd * 100) / 100;
        normalizedCurrency = "USD";
        fxApplied = true;
        fxRate = fx.rate;
        fxSource = fx.source;
        fxTimestamp = fx.timestamp;
        priceComparable = true;
      } else {
        warnings.push(
          `Currency ${currency} — FX normalization unavailable (${fx.reason}); not directly price-comparable`,
        );
        priceComparable = false;
      }
    } else if (currency === "USD") {
      priceComparable = true;
    } else {
      warnings.push(
        `Quote uses ${currency} while FX normalization is unavailable — not directly price-comparable`,
      );
    }
  } else if (freight.amount != null && !currency) {
    warnings.push("Currency missing — amount not comparable");
  }

  const transit = parseTransitDays(base.transitTime);
  const dep = parseDepartureWindow(base.estimatedDeparture);
  const completeness = computeCompletenessScore(base);
  const conf = base.extractionConfidence ?? 0;
  const expiry = expiryState(base.validityUntil, input.now);

  if (expiry === "expired") {
    warnings.push("Quote validity appears expired");
  }

  return {
    quoteId: input.quote.id,
    requestId: input.quote.commercialRequestId,
    inboundMessageId: input.quote.inboundMessageId,
    organization:
      base.organizationName ??
      input.request.recipient?.organizationName ??
      "Unknown organization",
    contactId: base.contactId ?? input.request.recipient?.contactId ?? null,
    currency,
    quotedAmount: freight.amount,
    rate: base.freightRate ?? null,
    rateUnit,
    estimatedFreightAmount: freight.amount,
    estimatedFreightLabel: freight.label,
    normalizedTotal,
    normalizedCurrency,
    fxApplied,
    fxRate,
    fxSource,
    fxTimestamp,
    estimatedDeparture: dep.label,
    departureWindowStart: dep.start,
    departureWindowEnd: dep.end,
    departureSortKey: dep.sortKey,
    transitDaysMin: transit.min,
    transitDaysMax: transit.max,
    estimatedArrival: base.estimatedArrival ?? null,
    validityUntil: base.validityUntil ?? null,
    expiryState: expiry,
    vesselName: base.vesselName ?? null,
    vesselType: base.vesselType ?? null,
    includedCharges: splitCharges(base.includedCharges),
    excludedCharges: splitCharges(base.excludedCharges),
    paymentTerms: base.paymentTerms ?? null,
    commercialTerms: splitCharges(base.commercialTerms),
    completenessScore: completeness,
    extractionConfidence: conf,
    confidenceLabel: confidenceLabel(conf),
    priceComparable,
    isLatest: base.isLatest !== false,
    version: base.version ?? 1,
    supersedesQuoteId: base.supersedesQuoteId ?? null,
    quoteStatus: base.quoteStatus ?? "PARSED",
    warnings,
    hasManualCorrections: Boolean(input.quote.corrections?.length),
  };
}

function monthIndex(name: string): number {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const i = months.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3)));
  return i;
}

function guessYear(): number {
  return new Date().getUTCFullYear();
}

function parseLooseDate(raw: string): Date | null {
  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) return new Date(iso);
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
  if (!m) return null;
  const month = monthIndex(m[2]);
  if (month < 0) return null;
  const year = m[3] ? Number(m[3]) : guessYear();
  return new Date(Date.UTC(year, month, Number(m[1])));
}
