import type { VesselType } from "@/domain/models";
import type { ParsedMaritimeQuery, SearchCargoInfo } from "@/domain/search/types";

const VESSEL_TYPE_PATTERNS: Array<{ type: VesselType; pattern: RegExp }> = [
  { type: "container", pattern: /\bcontainers?\b|\bteu\b/i },
  { type: "bulk_carrier", pattern: /\bbulk\b|\bore\b|\bcoal\b|\bgrain\b/i },
  { type: "tanker", pattern: /\btanker\b|\bcrude\b|\boil\b|\blng\b|\blpg\b/i },
  { type: "ro_ro", pattern: /\bro[\s-]?ro\b|\bvehicles?\b|\bcars?\b/i },
  { type: "general_cargo", pattern: /\bgeneral\s+cargo\b|\bbreakbulk\b|\bsteel\b|\bcargo\b/i },
  { type: "multipurpose", pattern: /\bmultipurpose\b|\bmpp\b/i },
];

const ROUTE_SEPARATORS =
  /\s+(?:to|→|->|—|–|towards|toward|into|for)\s+/i;

/**
 * Deterministic natural-language maritime query parser.
 * LLM can plug in later behind the same ParsedMaritimeQuery shape.
 */
export function parseMaritimeQueryDeterministic(rawQuery: string): ParsedMaritimeQuery {
  const raw = rawQuery.trim().replace(/\s+/g, " ");

  let originText: string | undefined;
  let destinationText: string | undefined;

  // "from X to Y" / "between X and Y" / "X to Y"
  const fromTo = raw.match(
    /(?:from|between)\s+(.+?)\s+(?:to|and|→|->)\s+(.+?)(?:\s+(?:for|with|carrying|of)\b|$)/i,
  );
  const shipsFrom = raw.match(
    /(?:ships?|vessels?|find|show|need).{0,40}?(?:from|between)\s+(.+?)\s+(?:to|and|→|->)\s+(.+?)(?:\s*$|\s+with|\s+for)/i,
  );
  const simpleTo = raw.match(
    /^(.+?)\s+(?:to|→|->)\s+(.+?)(?:\s*$|\s+with|\s+for)/i,
  );

  // Trailing "Place → Place" (handles chips like "2,000t steel · Greece → Egypt")
  const trailingRoute = raw.match(
    /\b([A-Za-z][A-Za-z .'’-]{1,40}?)\s*(?:→|->|to)\s*([A-Za-z][A-Za-z .'’-]{1,40}?)\s*$/i,
  );

  if (fromTo) {
    originText = cleanPlace(fromTo[1]);
    destinationText = cleanPlace(fromTo[2]);
  } else if (shipsFrom) {
    originText = cleanPlace(shipsFrom[1]);
    destinationText = cleanPlace(shipsFrom[2]);
  } else if (trailingRoute) {
    originText = cleanPlace(trailingRoute[1]);
    destinationText = cleanPlace(trailingRoute[2]);
  } else if (simpleTo) {
    originText = cleanPlace(simpleTo[1].replace(/^(find|show|need|transport|ships?|vessels?)\s+/i, ""));
    destinationText = cleanPlace(simpleTo[2]);
  } else if (ROUTE_SEPARATORS.test(raw)) {
    const parts = raw.split(ROUTE_SEPARATORS);
    if (parts.length >= 2) {
      originText = cleanPlace(parts[0].replace(/^(find|show|need|i need to transport|transport)\s+/i, ""));
      destinationText = cleanPlace(parts[1]);
    }
  }

  // Strip leading intent phrases from origin
  if (originText) {
    originText = cleanPlace(
      originText.replace(
        /^(i need to transport|transport|find(?: vessels?)?|show(?: ships?)?|ships?|vessels?|capacity)\s+/i,
        "",
      ),
    );
  }

  const vesselType = detectVesselType(raw);
  const cargo = detectCargo(raw, originText, destinationText);

  return {
    rawQuery: raw,
    originText,
    destinationText,
    cargo,
    vesselType,
    interpreter: "deterministic",
  };
}

function cleanPlace(value: string): string {
  return value
    .replace(/[“”"']/g, "")
    .replace(/\b(port of|port|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectVesselType(raw: string): VesselType | undefined {
  for (const entry of VESSEL_TYPE_PATTERNS) {
    if (entry.pattern.test(raw)) return entry.type;
  }
  return undefined;
}

function detectCargo(
  raw: string,
  originText?: string,
  destinationText?: string,
): SearchCargoInfo | undefined {
  const qty = raw.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(t|tons?|tonnes?|mt|teu)\b/i,
  );
  let description: string | undefined;

  const steel = raw.match(/\b(steel|containers?|grain|coal|ore|vehicles?|chemicals?)\b/i);
  if (steel) description = steel[1].toLowerCase();

  const transport = raw.match(
    /transport\s+(.+?)\s+from\s+/i,
  );
  if (transport) {
    description = transport[1].replace(qty?.[0] ?? "", "").trim() || description;
  }

  if (!qty && !description) return undefined;

  const info: SearchCargoInfo = {};
  if (description) info.description = description;
  if (qty) {
    info.quantityText = qty[0];
    const n = Number(qty[1].replace(/,/g, ""));
    if (Number.isFinite(n) && /t|ton|mt/i.test(qty[2])) {
      info.quantityTons = n;
    }
  }

  // Avoid treating place names as cargo
  if (
    description &&
    ((originText && description.toLowerCase() === originText.toLowerCase()) ||
      (destinationText && description.toLowerCase() === destinationText.toLowerCase()))
  ) {
    delete info.description;
  }

  return Object.keys(info).length ? info : undefined;
}
