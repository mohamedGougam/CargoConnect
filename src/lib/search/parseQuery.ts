import type { VesselType } from "@/domain/models";
import type { ParsedMaritimeQuery, SearchCargoInfo } from "@/domain/search/types";

const VESSEL_TYPE_PATTERNS: Array<{ type: VesselType; pattern: RegExp }> = [
  { type: "container", pattern: /\bcontainers?\b|\bteu\b/i },
  { type: "bulk_carrier", pattern: /\bbulk\b|\bore\b|\bcoal\b|\bgrain\b/i },
  { type: "tanker", pattern: /\btanker\b|\bcrude\b|\boil\b|\blng\b|\blpg\b/i },
  { type: "ro_ro", pattern: /\bro[\s-]?ro\b|\bvehicles?\b|\bcars?\b/i },
  { type: "general_cargo", pattern: /\bgeneral\s+cargo\b|\bbreakbulk\b|\bsteel\b|\bstaal\b|\bacero\b|\bacier\b|\bstahl\b|\bcargo\b|\bφορτ[ίι]ο\b/i },
  { type: "multipurpose", pattern: /\bmultipurpose\b|\bmpp\b/i },
];

/** Multilingual route separators (to / naar / nach / a / à / προς / إلى …). */
const ROUTE_SEPARATORS =
  /\s+(?:to|→|->|—|–|towards|toward|into|for|naar|nach|vers|hacia|para|προς|στην|στον|εις|إلى|الى)\s+/i;

/**
 * Deterministic natural-language maritime query parser.
 * Multilingual OpenAI interpretation plugs in behind the same ParsedMaritimeQuery shape.
 */
export function parseMaritimeQueryDeterministic(rawQuery: string): ParsedMaritimeQuery {
  const raw = rawQuery.trim().replace(/\s+/g, " ");

  let originText: string | undefined;
  let destinationText: string | undefined;

  // Dutch: "Van X naar Y"
  const dutchVanNaar = raw.match(
    /(?:^|\b)van\s+(.+?)\s+naar\s+(.+?)(?:\s+(?:met|voor|van|met)\b|$)/i,
  );
  // German: "Von X nach Y"
  const germanVonNach = raw.match(
    /(?:^|\b)von\s+(.+?)\s+nach\s+(.+?)(?:\s+(?:mit|für)\b|$)/i,
  );
  // Spanish/French: "De X a/à Y" or "d'Anvers à Alexandrie"
  const romanceDeA = raw.match(
    /(?:^|\b)(?:de|d')\s*(.+?)\s+(?:a|à|hacia|vers)\s+(.+?)(?:\s+(?:con|avec|para|pour)\b|$)/i,
  );
  // Greek: "Από … στην/στον …"
  const greekApo = raw.match(
    /από\s+(?:τον\s+|την\s+|το\s+)?(.+?)\s+(?:στην|στον|στο|προς)\s+(.+?)(?:\s*$|\s+με)/i,
  );
  // Arabic: من … إلى …
  const arabicMinIla = raw.match(
    /من\s+(.+?)\s+(?:إلى|الى)\s+(.+?)(?:\s*$|\s+مع)/,
  );

  // "from X to Y" / "between X and Y" / "X to Y"
  const fromTo = raw.match(
    /(?:from|between)\s+(.+?)\s+(?:to|and|→|->)\s+(.+?)(?:\s+(?:for|with|carrying|of)\b|$)/i,
  );
  const shipsFrom = raw.match(
    /(?:ships?|vessels?|find|show|need).{0,40}?(?:from|between)\s+(.+?)\s+(?:to|and|→|->)\s+(.+?)(?:\s*$|\s+with|\s+for)/i,
  );
  const simpleTo = raw.match(
    /^(.+?)\s+(?:to|→|->|naar|nach)\s+(.+?)(?:\s*$|\s+with|\s+for|\s+met|\s+mit)/i,
  );

  // Trailing "Place → Place" (handles chips like "2,000t steel · Greece → Egypt")
  const trailingRoute = raw.match(
    /\b([A-Za-z\u00C0-\u024F\u0370-\u03FF][A-Za-z\u00C0-\u024F\u0370-\u03FF .'’-]{1,40}?)\s*(?:→|->|to|naar|nach)\s*([A-Za-z\u00C0-\u024F\u0370-\u03FF][A-Za-z\u00C0-\u024F\u0370-\u03FF .'’-]{1,40}?)\s*$/i,
  );

  if (dutchVanNaar) {
    originText = cleanPlace(dutchVanNaar[1]);
    destinationText = cleanPlace(dutchVanNaar[2]);
  } else if (germanVonNach) {
    originText = cleanPlace(germanVonNach[1]);
    destinationText = cleanPlace(germanVonNach[2]);
  } else if (romanceDeA) {
    originText = cleanPlace(romanceDeA[1]);
    destinationText = cleanPlace(romanceDeA[2]);
  } else if (greekApo) {
    originText = cleanPlace(greekApo[1]);
    destinationText = cleanPlace(greekApo[2]);
  } else if (arabicMinIla) {
    originText = cleanPlace(arabicMinIla[1]);
    destinationText = cleanPlace(arabicMinIla[2]);
  } else if (fromTo) {
    originText = cleanPlace(fromTo[1]);
    destinationText = cleanPlace(fromTo[2]);
  } else if (shipsFrom) {
    originText = cleanPlace(shipsFrom[1]);
    destinationText = cleanPlace(shipsFrom[2]);
  } else if (trailingRoute) {
    originText = cleanPlace(trailingRoute[1]);
    destinationText = cleanPlace(trailingRoute[2]);
  } else if (simpleTo) {
    originText = cleanPlace(
      simpleTo[1].replace(
        /^(find|show|need|transport|ships?|vessels?|je veux|quiero|ik wil|ich möchte)\s+/i,
        "",
      ),
    );
    destinationText = cleanPlace(simpleTo[2]);
  } else if (ROUTE_SEPARATORS.test(raw)) {
    const parts = raw.split(ROUTE_SEPARATORS);
    if (parts.length >= 2) {
      originText = cleanPlace(
        parts[0].replace(
          /^(find|show|need|i need to transport|transport|ik wil|je veux|quiero|ich möchte)\s+/i,
          "",
        ),
      );
      destinationText = cleanPlace(parts[1]);
    }
  }

  // Strip leading intent phrases from origin
  if (originText) {
    originText = cleanPlace(
      originText.replace(
        /^(i need to transport|transport|find(?: vessels?)?|show(?: ships?)?|ships?|vessels?|capacity|ik wil|je veux|quiero|ich möchte)\s+/i,
        "",
      ),
    );
  }

  // Complex Dutch: "... van Nederland naar Egypte ..."
  if ((!originText || !destinationText) && /\bvan\b.+\bnaar\b/i.test(raw)) {
    const m = raw.match(/\bvan\s+(.+?)\s+naar\s+(.+?)(?:\s+vervoeren|\s+met|\s*$)/i);
    if (m) {
      originText = cleanPlace(m[1]);
      destinationText = cleanPlace(m[2]);
    }
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
    .replace(/\b(port of|port|the|haven|hafen|puerto|port de|λιμάνι|τον|την|το)\b/gi, " ")
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
    /(\d[\d,]*(?:\.\d+)?)\s*(t|tons?|tonnes?|mt|teu|ton)\b/i,
  );
  // Arabic-Indic digits ٠-٩ → handled loosely via western digits in mocks
  let description: string | undefined;

  const steel = raw.match(
    /\b(steel|staal|stahl|acero|acier|containers?|grain|coal|ore|vehicles?|chemicals?|φορτίο)\b/i,
  );
  if (steel) description = normalizeCargoWord(steel[1]);

  const transport = raw.match(/transport\s+(.+?)\s+from\s+/i);
  if (transport) {
    description =
      transport[1].replace(qty?.[0] ?? "", "").trim() || description;
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

  if (
    description &&
    ((originText && description.toLowerCase() === originText.toLowerCase()) ||
      (destinationText &&
        description.toLowerCase() === destinationText.toLowerCase()))
  ) {
    delete info.description;
  }

  return Object.keys(info).length ? info : undefined;
}

function normalizeCargoWord(word: string): string {
  const w = word.toLowerCase();
  if (/staal|stahl|acero|acier/.test(w)) return "steel";
  return w;
}
