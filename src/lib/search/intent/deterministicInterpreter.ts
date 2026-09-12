import type { VesselType } from "@/domain/models";
import type { MaritimeSearchIntent } from "@/domain/search/intent";
import type {
  ParsedMaritimeQuery,
  SearchCargoInfo,
} from "@/domain/search/types";
import { parseMaritimeQueryDeterministic } from "@/lib/search/parseQuery";
import { emptyPlaceIntent } from "./schema";
import type {
  InterpretQueryInput,
  InterpretQueryResult,
  MaritimeIntentInterpreter,
} from "./MaritimeIntentInterpreter";

/**
 * Deterministic interpreter — wraps the existing NL parser into MaritimeSearchIntent.
 */
export class DeterministicInterpreter implements MaritimeIntentInterpreter {
  async interpret(input: InterpretQueryInput): Promise<InterpretQueryResult> {
    const started = Date.now();
    const parsed = parseMaritimeQueryDeterministic(input.query);
    const intent = parsedQueryToIntent(parsed);
    return {
      intent,
      source: "deterministic",
      latencyMs: Date.now() - started,
    };
  }
}

export function parsedQueryToIntent(
  parsed: ParsedMaritimeQuery,
): MaritimeSearchIntent {
  const hasRoute = Boolean(parsed.originText && parsed.destinationText);
  return {
    detectedLanguage: "en",
    intent: hasRoute ? "ROUTE_SEARCH" : "UNKNOWN",
    origin: placeFromText(parsed.originText),
    destination: placeFromText(parsed.destinationText),
    cargo: {
      description: parsed.cargo?.description ?? null,
      normalizedType: parsed.cargo?.description ?? null,
    },
    quantity: {
      value: parsed.cargo?.quantityTons ?? null,
      unit: parsed.cargo?.quantityTons != null ? "MT" : null,
    },
    vesselTypeHint: parsed.vesselType ?? null,
    dateHint: null,
    interpretationConfidence: hasRoute ? "HIGH" : "LOW",
    clarificationNeeded: !hasRoute,
    clarificationReason: hasRoute
      ? null
      : "Could not identify both origin and destination.",
  };
}

function placeFromText(text: string | undefined) {
  if (!text) return emptyPlaceIntent();
  return {
    rawText: text,
    interpretedName: text,
    city: null,
    country: null,
    region: null,
    portHint: text,
  };
}

export function intentToParsedQuery(
  intent: MaritimeSearchIntent,
  rawQuery: string,
  interpreter: "deterministic" | "llm",
): ParsedMaritimeQuery {
  const originText = placeToResolverText(intent.origin);
  const destinationText = placeToResolverText(intent.destination);
  const cargo = intentToCargo(intent);
  const vesselType = mapVesselHint(intent.vesselTypeHint);

  return {
    rawQuery,
    originText: originText || undefined,
    destinationText: destinationText || undefined,
    cargo,
    vesselType,
    interpreter,
    detectedLanguage: intent.detectedLanguage || undefined,
    interpretationSummary: buildInterpretationSummary(intent),
  };
}

/** Prefer port hint → city → interpreted name → country → region for catalogue lookup. */
export function placeToResolverText(
  place: MaritimeSearchIntent["origin"],
): string | undefined {
  const parts = [
    place.portHint,
    place.city,
    place.interpretedName,
    place.country,
    place.region,
    place.rawText,
  ]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  if (!parts.length) return undefined;
  // Prefer the most specific single token for resolution
  return (
    place.portHint?.trim() ||
    place.city?.trim() ||
    place.interpretedName?.trim() ||
    place.country?.trim() ||
    place.region?.trim() ||
    place.rawText?.trim() ||
    undefined
  );
}

function intentToCargo(intent: MaritimeSearchIntent): SearchCargoInfo | undefined {
  const description =
    intent.cargo.description?.trim() ||
    intent.cargo.normalizedType?.trim() ||
    undefined;
  const value = intent.quantity.value;
  const unit = intent.quantity.unit?.trim();
  if (!description && value == null) return undefined;

  const info: SearchCargoInfo = {};
  if (description) info.description = description;
  if (value != null && Number.isFinite(value)) {
    info.quantityTons = value;
    info.quantityText = unit
      ? `${formatQty(value)} ${unit}`
      : `${formatQty(value)} MT`;
  }
  return info;
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : String(n);
}

function mapVesselHint(hint: string | null): VesselType | undefined {
  if (!hint) return undefined;
  const h = hint.toLowerCase();
  if (/container|teu/.test(h)) return "container";
  if (/bulk|ore|coal|grain/.test(h)) return "bulk_carrier";
  if (/tanker|crude|oil|lng|lpg/.test(h)) return "tanker";
  if (/ro[\s-]?ro|vehicle|car/.test(h)) return "ro_ro";
  if (/multipurpose|mpp/.test(h)) return "multipurpose";
  if (/general|steel|cargo|breakbulk/.test(h)) return "general_cargo";
  return undefined;
}

export function buildInterpretationSummary(
  intent: MaritimeSearchIntent,
): string | undefined {
  const o =
    intent.origin.portHint ||
    intent.origin.city ||
    intent.origin.interpretedName ||
    intent.origin.country ||
    intent.origin.region;
  const d =
    intent.destination.portHint ||
    intent.destination.city ||
    intent.destination.interpretedName ||
    intent.destination.country ||
    intent.destination.region;
  if (!o || !d) return undefined;
  const bits: string[] = [`${o} → ${d}`];
  if (intent.quantity.value != null) {
    bits.push(
      `${formatQty(intent.quantity.value)} ${intent.quantity.unit ?? "MT"}`,
    );
  }
  if (intent.cargo.description || intent.cargo.normalizedType) {
    bits.push(
      (intent.cargo.description || intent.cargo.normalizedType) as string,
    );
  }
  return bits.join(" · ");
}
