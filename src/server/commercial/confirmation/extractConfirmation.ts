import type { ProceedSnapshot } from "@/domain/commercial/types";

export interface ExtractedConfirmationFields {
  bookingReference: string | null;
  carrierReference: string | null;
  brokerReference: string | null;
  vesselName: string | null;
  vesselImo: string | null;
  vesselMmsi: string | null;
  confirmedRate: number | null;
  currency: string | null;
  rateUnit: string | null;
  confirmedFreightAmount: number | null;
  departureText: string | null;
  laycanStart: string | null;
  laycanEnd: string | null;
  origin: string | null;
  destination: string | null;
  cargoDescription: string | null;
  cargoQuantity: number | null;
  includedCharges: string[];
  excludedCharges: string[];
  paymentTerms: string | null;
  requiredDocuments: string[];
  nextSteps: string[];
  extractionConfidence: number;
  confidenceLabel: "High" | "Medium" | "Low";
}

/**
 * Deterministic confirmation field extraction — never invents missing values.
 */
export function extractConfirmationFields(input: {
  subject: string;
  textBody: string;
  snapshot?: ProceedSnapshot | null;
}): ExtractedConfirmationFields {
  const text = `${input.subject}\n${input.textBody}`;

  const currency =
    matchFirst(text, /\b(USD|EUR|GBP|AED|SAR)\b/i) ??
    (/\$/.test(text) ? "USD" : null);

  const rateMatch =
    text.match(
      /(?:USD|EUR|GBP|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|\d+(?:\.\d+)?)\s*(?:\/|\s+per\s+)(MT|mt|ton(?:ne)?s?|W\/M|cbm|teu)/i,
    ) ??
    text.match(
      /(?:at|rate(?:\s+is)?(?:\s+now)?|final rate(?:\s+is)?)\s*(?:USD|EUR|GBP|\$)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|\s*per\s*)?(MT|mt|ton)?/i,
    );

  let confirmedRate: number | null = null;
  let rateUnit: string | null = null;
  if (rateMatch) {
    confirmedRate = parseNumber(rateMatch[1]);
    rateUnit = normalizeUnit(rateMatch[2] ?? "MT");
  }

  const freightMatch = text.match(
    /(?:estimated\s+)?(?:freight|total)\s*(?:of|:)?\s*(?:USD|EUR|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/i,
  );
  const confirmedFreightAmount = freightMatch
    ? parseNumber(freightMatch[1])
    : null;

  const bookingReference =
    matchFirst(
      text,
      /(?:booking\s*(?:reference|ref|no\.?|number)|reference)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,20})/i,
    ) ?? null;

  const vesselName =
    matchFirst(
      text,
      /(?:vessel|mv|m\/v)\s+([A-Z][A-Za-z0-9\s'-]{1,40}?)(?:\s+nominated|\s+confirmed|[.,\n]|$)/i,
    ) ??
    matchFirst(text, /\bMV\s+([A-Z][A-Za-z0-9'-]+)/i) ??
    null;

  const vesselImo = matchFirst(text, /\bIMO\s*[:#]?\s*(\d{7})\b/i);
  const vesselMmsi = matchFirst(text, /\bMMSI\s*[:#]?\s*(\d{9})\b/i);

  const departureText =
    matchFirst(
      text,
      /(?:laycan|ets|etd|estimated departure|departure)\s*:?\s*([0-9]{1,2}\s*[–-]?\s*[0-9]{0,2}\s*[A-Za-z]+(?:\s+[0-9]{4})?)/i,
    ) ?? null;

  let laycanStart: string | null = null;
  let laycanEnd: string | null = null;
  if (departureText) {
    const range = departureText.match(
      /([0-9]{1,2})\s*[–-]\s*([0-9]{1,2})\s*([A-Za-z]+(?:\s+[0-9]{4})?)/i,
    );
    if (range) {
      laycanStart = `${range[1]} ${range[3]}`.trim();
      laycanEnd = `${range[2]} ${range[3]}`.trim();
    }
  }

  const routeMatch =
    input.textBody.match(
      /\b([A-Z][a-zA-Z][a-zA-Z\s-]{1,40}?)\s*(?:→|->|\/)\s*([A-Z][a-zA-Z][a-zA-Z\s-]{1,40})\b/,
    ) ??
    input.textBody.match(
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
    );
  const originCandidate = routeMatch?.[1]?.trim() ?? null;
  const destinationCandidate = routeMatch?.[2]?.trim() ?? null;
  const origin = isPlausiblePortName(originCandidate) ? originCandidate : null;
  const destination = isPlausiblePortName(destinationCandidate)
    ? destinationCandidate
    : null;

  const quantityMatch = text.match(
    /\b([0-9]{1,3}(?:,[0-9]{3})*|\d+)\s*(?:MT|mt|tons?|tonnes?)\b/,
  );
  const cargoQuantity = quantityMatch ? parseNumber(quantityMatch[1]) : null;

  const cargoDescription =
    matchFirst(text, /\b(?:of|for)\s+([0-9,]+\s*MT\s+)?([a-z][a-z\s]{2,30}steel[a-z\s]*)/i) ??
    matchFirst(text, /\b(steel|grain|containers?|project cargo)\b/i);

  const paymentTerms =
    matchFirst(text, /payment\s*terms?\s*:?\s*([^\n.]{5,80})/i) ?? null;

  const includedCharges = collectChargeLines(text, "included");
  const excludedCharges = collectChargeLines(text, "excluded");

  const requiredDocuments: string[] = [];
  if (/\b(dimensions|packing list|msds|imo class|commercial invoice)\b/i.test(text)) {
    const docs = text.match(
      /\b(package dimensions|packing list|msds|imo class|commercial invoice)\b/gi,
    );
    if (docs) requiredDocuments.push(...Array.from(new Set(docs.map((d) => d.toLowerCase()))));
  }

  const nextSteps: string[] = [];
  if (/\bnominated\b/i.test(text)) nextSteps.push("Vessel nominated");
  if (bookingReference) nextSteps.push("External booking reference provided");

  let hits = 0;
  if (confirmedRate != null) hits += 2;
  if (departureText) hits += 2;
  if (vesselName) hits += 1;
  if (bookingReference) hits += 2;
  if (cargoQuantity != null) hits += 1;
  if (currency) hits += 1;
  const extractionConfidence = Math.min(0.95, 0.35 + hits * 0.08);
  const confidenceLabel =
    extractionConfidence >= 0.75
      ? "High"
      : extractionConfidence >= 0.55
        ? "Medium"
        : "Low";

  return {
    bookingReference,
    carrierReference: null,
    brokerReference: bookingReference,
    vesselName: vesselName ? cleanVessel(vesselName) : null,
    vesselImo,
    vesselMmsi,
    confirmedRate,
    currency,
    rateUnit,
    confirmedFreightAmount,
    departureText,
    laycanStart,
    laycanEnd,
    origin,
    destination,
    cargoDescription,
    cargoQuantity,
    includedCharges,
    excludedCharges,
    paymentTerms,
    requiredDocuments,
    nextSteps,
    extractionConfidence,
    confidenceLabel,
  };
}

function collectChargeLines(text: string, kind: "included" | "excluded"): string[] {
  const re =
    kind === "included"
      ? /(?:included|includes)\s*:?\s*([^\n.]{3,100})/gi
      : /(?:excluded|excludes|excluding|port charges excluded)\s*:?\s*([^\n.]{0,100})/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = (m[1] || m[0]).trim();
    if (v) out.push(v);
  }
  if (kind === "excluded" && /port charges excluded/i.test(text)) {
    out.push("Port charges excluded");
  }
  return Array.from(new Set(out));
}

function cleanVessel(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
}

const NON_PORT_TOKENS = new Set([
  "request",
  "proceed",
  "confirm",
  "confirmed",
  "dear",
  "regards",
  "hello",
  "thanks",
  "booking",
  "reference",
  "vessel",
  "please",
  "final",
  "rate",
]);

function isPlausiblePortName(value: string | null): boolean {
  if (!value?.trim()) return false;
  if (value.includes("\n")) return false;
  const first = value.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (NON_PORT_TOKENS.has(first)) return false;
  return value.trim().length >= 3 && value.trim().length <= 40;
}

function matchFirst(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(raw?: string | null): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u.startsWith("TON") || u === "MT") return "MT";
  return u;
}
