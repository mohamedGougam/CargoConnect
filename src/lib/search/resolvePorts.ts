import type { Port } from "@/domain/models";
import type { LocationResolutionResult, PortResolution } from "@/domain/search/types";

/** Canonical name keys → accepted aliases (normalized). */
const NAME_ALIASES: Record<string, string[]> = {
  rotterdam: ["rotterdam", "rdam", "r dam", "روتردام", "port of rotterdam"],
  alexandria: [
    "alexandria",
    "alexandrie",
    "αλεξανδρεια",
    "الإسكندرية",
    "الاسكندرية",
  ],
  piraeus: [
    "piraeus",
    "peiraeus",
    "pireaus",
    "pireas",
    "πειραιας",
    "πειραια",
    "πειραιάς",
  ],
  istanbul: ["istanbul", "constantinople"],
  "port said": ["port said", "portsaid"],
  hamburg: ["hamburg"],
  antwerp: ["antwerp", "antwerpen", "anvers"],
  thessaloniki: ["thessaloniki", "salonika"],
  heraklion: ["heraklion", "iraklion", "heraklio"],
  singapore: ["singapore"],
  shanghai: ["shanghai"],
  "los angeles": ["los angeles", "la", "long beach"],
  "new york": ["new york", "nyc", "new york / new jersey", "newark"],
  "jebel ali": ["jebel ali", "jebe ali"],
  dubai: ["dubai"],
  "port klang": ["port klang", "port kelang"],
  busan: ["busan", "pusan"],
  "cape town": ["cape town"],
  barcelona: ["barcelona", "barcelone", "barcalona"],
  algiers: [
    "algiers",
    "alger",
    "argel",
    "algirs",
    "algiers port",
    "port of algiers",
  ],
  tarragona: ["tarragona"],
  valencia: ["valencia", "valence"],
  amsterdam: ["amsterdam", "amesterdam"],
};

/** City / colloquial → catalogue port name (normalized). */
const CITY_TO_PORT: Record<string, string[]> = {
  athens: ["piraeus"],
  athina: ["piraeus"],
  athènes: ["piraeus"],
  athen: ["piraeus"],
  barcelona: ["barcelona"],
  algiers: ["algiers"],
  alger: ["algiers"],
  argel: ["algiers"],
  dubai: ["jebel ali", "dubai"],
  "new york": ["new york"],
  shanghai: ["shanghai"],
  amsterdam: ["amsterdam"],
  "r'dam": ["rotterdam"],
  rdam: ["rotterdam"],
};

const REGION_ALIASES: Record<
  string,
  {
    country?: string;
    preferNames?: string[];
    /** When true, return candidates instead of auto-picking a hub. */
    multiCandidate?: boolean;
  }
> = {
  greece: { country: "Greece", preferNames: ["Piraeus", "Thessaloniki"] },
  egypt: {
    country: "Egypt",
    preferNames: ["Alexandria", "Port Said", "Damietta"],
  },
  turkey: { country: "Turkey", preferNames: ["Istanbul", "Izmir", "Mersin"] },
  türkiye: { country: "Türkiye", preferNames: ["Istanbul"] },
  netherlands: {
    country: "Netherlands",
    preferNames: ["Rotterdam", "Amsterdam"],
  },
  holland: { country: "Netherlands", preferNames: ["Rotterdam", "Amsterdam"] },
  nederland: {
    country: "Netherlands",
    preferNames: ["Rotterdam", "Amsterdam"],
  },
  germany: { country: "Germany", preferNames: ["Hamburg"] },
  deutschland: { country: "Germany", preferNames: ["Hamburg"] },
  "northern germany": {
    country: "Germany",
    preferNames: ["Hamburg"],
  },
  norddeutschland: { country: "Germany", preferNames: ["Hamburg"] },
  belgium: { country: "Belgium", preferNames: ["Antwerp"] },
  belgie: { country: "Belgium", preferNames: ["Antwerp"] },
  belgië: { country: "Belgium", preferNames: ["Antwerp"] },
  cyprus: { country: "Cyprus", preferNames: ["Limassol"] },
  israel: { country: "Israel", preferNames: ["Haifa", "Ashdod"] },
  italy: { country: "Italy", preferNames: ["Palermo", "Catania", "Augusta"] },
  malta: { country: "Malta", preferNames: ["Valletta"] },
  singapore: { country: "Singapore", preferNames: ["Singapore"] },
  china: { country: "China", preferNames: ["Shanghai", "Ningbo"] },
  "united arab emirates": {
    country: "United Arab Emirates",
    preferNames: ["Jebel Ali", "Dubai"],
  },
  uae: {
    country: "United Arab Emirates",
    preferNames: ["Jebel Ali", "Dubai"],
  },
  "united states": {
    country: "United States",
    preferNames: ["Los Angeles", "New York"],
  },
  usa: {
    country: "United States",
    preferNames: ["Los Angeles", "New York"],
  },
  malaysia: { country: "Malaysia", preferNames: ["Port Klang"] },
  japan: { country: "Japan", preferNames: ["Tokyo"] },
  australia: { country: "Australia", preferNames: ["Sydney"] },
  spain: {
    country: "Spain",
    preferNames: ["Barcelona", "Algeciras", "Valencia"],
    multiCandidate: true,
  },
  espana: {
    country: "Spain",
    preferNames: ["Barcelona", "Algeciras", "Valencia"],
    multiCandidate: true,
  },
  españa: {
    country: "Spain",
    preferNames: ["Barcelona", "Algeciras", "Valencia"],
    multiCandidate: true,
  },
  algeria: { country: "Algeria", preferNames: ["Algiers"] },
  algerie: { country: "Algeria", preferNames: ["Algiers"] },
  algérie: { country: "Algeria", preferNames: ["Algiers"] },
  norway: { country: "Norway", preferNames: ["Oslo", "Bergen", "Stavanger"] },
  norge: { country: "Norway", preferNames: ["Oslo", "Bergen", "Stavanger"] },
  egypte: { country: "Egypt", preferNames: ["Alexandria", "Port Said"] },
  ägypten: { country: "Egypt", preferNames: ["Alexandria", "Port Said"] },
  aegypten: { country: "Egypt", preferNames: ["Alexandria", "Port Said"] },
  "northern europe": { multiCandidate: true, preferNames: [] },
};

export function resolveLocation(
  queryText: string | undefined,
  ports: Port[],
): LocationResolutionResult {
  if (!queryText?.trim()) {
    return { queryText: queryText ?? "", candidates: [], ambiguous: false };
  }

  const q = stripPortNoise(normalize(queryText));
  const region = REGION_ALIASES[q];
  if (region) {
    return resolveRegion(queryText, ports, region);
  }

  // City → serving port(s)
  const cityPorts = CITY_TO_PORT[q];
  if (cityPorts?.length) {
    const preferred: PortResolution[] = [];
    for (const name of cityPorts) {
      const hit = ports.find((p) => normalize(p.name) === normalize(name));
      if (hit) {
        preferred.push({
          port: hit,
          score: 94,
          matchReason: "city_to_port",
        });
      }
    }
    if (preferred.length === 1) {
      return {
        queryText,
        best: preferred[0],
        candidates: preferred,
        ambiguous: false,
      };
    }
    if (preferred.length > 1) {
      return {
        queryText,
        best: preferred[0].score >= preferred[1].score + 10 ? preferred[0] : undefined,
        candidates: preferred.slice(0, 5),
        ambiguous: preferred[0].score < preferred[1].score + 10,
      };
    }
  }

  const scored: PortResolution[] = [];
  for (const port of ports) {
    const score = scorePortMatch(q, port);
    if (score <= 0) continue;
    scored.push({
      port,
      score,
      matchReason:
        score >= 90 ? "exact_name" : score >= 70 ? "alias_or_prefix" : "fuzzy",
    });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.port.name.localeCompare(b.port.name),
  );
  const top = scored.slice(0, 5);
  const best = top[0];
  const ambiguous =
    top.length >= 2 &&
    best &&
    top[1].score >= best.score - 8 &&
    top[1].score >= 60;

  return {
    queryText,
    best: ambiguous ? undefined : best?.score >= 55 ? best : undefined,
    candidates: top,
    ambiguous: Boolean(
      ambiguous || (!best && top.length > 0) || (best && best.score < 55),
    ),
  };
}

function resolveRegion(
  queryText: string,
  ports: Port[],
  region: {
    country?: string;
    preferNames?: string[];
    multiCandidate?: boolean;
  },
): LocationResolutionResult {
  if (!region.country && !(region.preferNames?.length)) {
    return {
      queryText,
      candidates: [],
      ambiguous: true,
    };
  }

  const countryPorts = region.country
    ? ports.filter((p) =>
        normalize(p.country) === normalize(region.country!) ||
        normalize(p.country).includes(normalize(region.country!)) ||
        (region.country === "Turkey" && /t[uü]rkiye|turkey/i.test(p.country)),
      )
    : [];

  const preferred: PortResolution[] = [];
  for (const name of region.preferNames ?? []) {
    const hit = countryPorts.find((p) => normalize(p.name) === normalize(name));
    if (hit) {
      preferred.push({
        port: hit,
        score: 95,
        matchReason: "region_primary_port",
      });
    }
  }

  if (preferred.length === 0 && countryPorts.length > 0) {
    preferred.push({
      port: countryPorts[0],
      score: 80,
      matchReason: "region_fallback_port",
    });
  }

  if (region.multiCandidate && preferred.length >= 2) {
    return {
      queryText,
      best: undefined,
      candidates: preferred.slice(0, 5),
      ambiguous: true,
    };
  }

  // Single primary hub for MVP corridor search (Greece → Piraeus, etc.)
  return {
    queryText,
    best: preferred[0],
    candidates: preferred.slice(0, 3),
    ambiguous: false,
  };
}

function scorePortMatch(q: string, port: Port): number {
  const name = normalize(port.name);
  const country = normalize(port.country);
  const unlo = normalize(port.unlocode ?? "");
  const label = normalize(port.locationLabel);

  if (q === name) return 100;
  if (unlo && q === unlo) return 98;

  for (const [canonical, aliases] of Object.entries(NAME_ALIASES)) {
    if (aliases.includes(q) && (name === canonical || aliases.includes(name))) {
      return 96;
    }
    if (aliases.includes(q) && name.includes(canonical)) return 92;
  }

  // Multilingual Alexandria / Piraeus via includes after normalize
  if (
    (q.includes("alexandr") || q === "alexandrie") &&
    name.includes("alexandria")
  ) {
    return 94;
  }
  if ((q.includes("peirai") || q.includes("pire")) && name.includes("piraeus")) {
    return 90;
  }

  if (name.startsWith(q) && q.length >= 3) return 85;
  if (q.startsWith(name) && name.length >= 3) return 82;
  if (name.includes(q) && q.length >= 4) return 72;
  if (label.includes(q) && q.length >= 4) return 60;
  if (country === q) return 50;

  const qTokens = q.split(" ").filter(Boolean);
  const nameTokens = name.split(" ").filter(Boolean);
  const overlap = qTokens.filter((t) =>
    nameTokens.some((n) => n.startsWith(t) || t.startsWith(n)),
  );
  if (overlap.length && overlap.length === qTokens.length) return 68;

  // Light edit-distance for short misspellings (e.g. Algirs / Barcalona)
  if (q.length >= 5 && name.length >= 5) {
    const dist = levenshtein(q, name);
    if (dist === 1) return 88;
    if (dist === 2 && q.length >= 6) return 78;
  }

  return 0;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s\u0600-\u06FF\u0370-\u03FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip "port of / port / haven …" noise OpenAI often adds to portHint. */
function stripPortNoise(value: string): string {
  return value
    .replace(
      /^(port of|port|haven|hafen|puerto|porto|λιμανι)\s+/i,
      "",
    )
    .replace(/\s+(port|haven|hafen)$/i, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}
