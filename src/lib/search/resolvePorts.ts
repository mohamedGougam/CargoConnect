import type { Port } from "@/domain/models";
import type {
  LocationResolutionResult,
  PortResolution,
} from "@/domain/search/types";
import {
  CITY_SERVING_PORTS,
  COUNTRY_CODE_NAMES,
  COUNTRY_QUERY_CODES,
} from "@/lib/search/cityServingPorts";

/**
 * Deterministic port resolution against the searchable catalogue.
 *
 * Order:
 *  a. exact UN/LOCODE
 *  b. exact canonical name
 *  c. normalized alias
 *  d. exact city
 *  e. nearby/serving ports for city (explicit config only)
 *  f. country-level candidates (same country only)
 *  g. clarification
 */
export function resolveLocation(
  queryText: string | undefined,
  ports: Port[],
): LocationResolutionResult {
  if (!queryText?.trim()) {
    return { queryText: queryText ?? "", candidates: [], ambiguous: false };
  }

  const q = stripPortNoise(normalize(queryText));
  if (!q) {
    return { queryText, candidates: [], ambiguous: false };
  }

  // a. exact UN/LOCODE
  const byCode = ports.find(
    (p) => p.unlocode && normalize(p.unlocode) === q.replace(/\s+/g, ""),
  );
  if (byCode) {
    return single(queryText, byCode, 100, "exact_unlocode", "HIGH");
  }

  // Exact name / alias / city BEFORE country labels so "Singapore" can hit SGSIN
  const exactName: PortResolution[] = [];
  const aliasHits: PortResolution[] = [];
  const cityHits: PortResolution[] = [];

  for (const port of ports) {
    const name = normalize(port.name);
    const city = normalize(cityOf(port));
    const aliases = aliasesOf(port).map(normalize);

    if (name === q) {
      exactName.push(hit(port, 100, "exact_canonical_name", "HIGH"));
      continue;
    }
    if (aliases.includes(q)) {
      aliasHits.push(hit(port, 96, "normalized_alias", "HIGH"));
      continue;
    }
    if (city === q) {
      cityHits.push(hit(port, 94, "exact_city", "HIGH"));
    }
  }

  const exactResolved = resolveExactGroup(queryText, exactName);
  if (exactResolved) return exactResolved;

  const aliasResolved = resolveExactGroup(queryText, aliasHits);
  if (aliasResolved) return aliasResolved;

  const cityResolved = resolveExactGroup(queryText, cityHits);
  if (cityResolved) return cityResolved;

  // Country / region → same-country candidates only (after exact port names)
  const countryCode = COUNTRY_QUERY_CODES[q];
  if (countryCode) {
    return resolveCountry(queryText, ports, countryCode);
  }

  // e. nearby / serving ports for city (explicit config only, same country)
  const serving = CITY_SERVING_PORTS[q];
  if (serving) {
    const hits: PortResolution[] = [];
    for (const code of serving.servingUnlocodes) {
      const port = ports.find(
        (p) => p.unlocode?.toUpperCase() === code.toUpperCase(),
      );
      if (!port) continue;
      if (
        port.unlocode &&
        port.unlocode.slice(0, 2).toUpperCase() !== serving.countryCode
      ) {
        // Hard guard: never cross-country serving maps
        continue;
      }
      hits.push(hit(port, 88, "city_serving_port", "MEDIUM"));
    }
    if (hits.length === 1) return finish(queryText, hits);
    if (hits.length > 1) return ambiguousResult(queryText, hits);
  }

  // Light fuzzy / prefix within catalogue (same-token), still HIGH/MEDIUM only if strong
  const fuzzy: PortResolution[] = [];
  for (const port of ports) {
    const name = normalize(port.name);
    if (name.startsWith(q) && q.length >= 3) {
      fuzzy.push(hit(port, 85, "name_prefix", "HIGH"));
      continue;
    }
    if (q.length >= 5 && name.length >= 5) {
      const dist = levenshtein(q, name);
      if (dist === 1) fuzzy.push(hit(port, 84, "name_edit_distance_1", "HIGH"));
      else if (dist === 2 && q.length >= 6) {
        fuzzy.push(hit(port, 72, "name_edit_distance_2", "MEDIUM"));
      }
    }
  }
  // Also fuzzy-match aliases for misspellings like Algirs → Alger
  for (const port of ports) {
    for (const alias of aliasesOf(port)) {
      const a = normalize(alias);
      if (a.length < 5 || q.length < 5) continue;
      const dist = levenshtein(q, a);
      if (dist === 1) {
        fuzzy.push(hit(port, 83, "alias_edit_distance_1", "HIGH"));
      } else if (dist === 2 && q.length >= 6) {
        fuzzy.push(hit(port, 70, "alias_edit_distance_2", "MEDIUM"));
      }
    }
  }
  // Prefer higher scores; de-dupe by port id keeping best score
  const byId = new Map<string, PortResolution>();
  for (const f of fuzzy) {
    const prev = byId.get(f.port.id);
    if (!prev || f.score > prev.score) byId.set(f.port.id, f);
  }
  const fuzzyUnique = Array.from(byId.values());
  fuzzyUnique.sort(
    (a, b) =>
      b.score - a.score ||
      tierRank(a.port) - tierRank(b.port) ||
      sourceRank(a.port) - sourceRank(b.port),
  );
  if (fuzzyUnique.length === 1 && fuzzyUnique[0].score >= 80) {
    return finish(queryText, fuzzyUnique);
  }
  if (fuzzyUnique.length > 1 && fuzzyUnique[0].score >= 80) {
    const top = fuzzyUnique.filter((f) => f.score >= fuzzyUnique[0].score - 5);
    const preferred = preferDominantPorts(top);
    if (preferred.length === 1) return finish(queryText, preferred);
    return ambiguousResult(queryText, preferred.slice(0, 5));
  }

  // g. clarification
  return { queryText, candidates: [], ambiguous: true };
}

/**
 * When multiple catalogue rows share a name, prefer a clear major hub rather than
 * treating every cross-country collision as user ambiguity.
 */
function resolveExactGroup(
  queryText: string,
  hits: PortResolution[],
): LocationResolutionResult | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return finish(queryText, hits);
  const preferred = preferDominantPorts(hits);
  if (preferred.length === 1) return finish(queryText, preferred);
  return ambiguousResult(queryText, preferred.slice(0, 5));
}

function preferDominantPorts(hits: PortResolution[]): PortResolution[] {
  if (hits.length <= 1) return hits;
  const ranked = [...hits].sort(
    (a, b) =>
      tierRank(a.port) - tierRank(b.port) ||
      sourceRank(a.port) - sourceRank(b.port) ||
      b.score - a.score ||
      a.port.name.localeCompare(b.port.name),
  );
  const bestTier = tierRank(ranked[0].port);
  const topTier = ranked.filter((h) => tierRank(h.port) === bestTier);
  const countries = new Set(topTier.map((h) => h.port.country));
  if (countries.size > 1) {
    const majors = ranked.filter((h) => tierRank(h.port) === 0);
    if (majors.length === 1) return majors;
    // Prefer WPI-backed major when UN/LOCODE-only namesakes collide
    const wpiBacked = ranked.filter(
      (h) =>
        tierRank(h.port) === bestTier &&
        (h.port.meta?.sources ?? []).includes("NGA_WPI"),
    );
    if (wpiBacked.length === 1) return wpiBacked;
    if (majors.length > 1) return majors.slice(0, 5);
  }
  if (countries.size === 1 && topTier.length > 1) {
    return [topTier[0]];
  }
  return topTier;
}

function sourceRank(port: Port): number {
  const s = port.meta?.sources ?? [];
  if (s.includes("NGA_WPI") && s.includes("UN_LOCODE")) return 0;
  if (s.includes("NGA_WPI")) return 1;
  if (s.includes("UN_LOCODE")) return 3;
  return 2;
}

function resolveCountry(
  queryText: string,
  ports: Port[],
  countryCode: string,
): LocationResolutionResult {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return { queryText, candidates: [], ambiguous: true };
  }

  const inCountry = ports.filter(
    (p) =>
      p.unlocode?.slice(0, 2).toUpperCase() === code ||
      normalize(p.country) === normalize(countryNameFromCode(code)),
  );

  if (!inCountry.length) {
    return { queryText, candidates: [], ambiguous: true };
  }

  const ranked = [...inCountry].sort((a, b) => {
    const ta = tierRank(a);
    const tb = tierRank(b);
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });

  const hits = ranked
    .slice(0, 5)
    .map((p) => hit(p, 80, "country_level_candidate", "LOW"));

  // Single port in country → auto HIGH
  if (hits.length === 1) {
    return {
      queryText,
      best: { ...hits[0], confidence: "HIGH", matchReason: "country_single_port" },
      candidates: hits,
      ambiguous: false,
    };
  }

  // Multiple → candidates only (LOW). Do not silently invent a hub.
  return {
    queryText,
    best: undefined,
    candidates: hits,
    ambiguous: true,
  };
}

/**
 * Catalogue lookup by ISO country code (e.g. from OpenAI amplify hints).
 * Never invents ports — only filters the existing index.
 */
export function resolveByCountryCode(
  queryText: string,
  ports: Port[],
  countryCode: string,
): LocationResolutionResult {
  return resolveCountry(queryText, ports, countryCode);
}

function countryNameFromCode(code: string): string {
  return COUNTRY_CODE_NAMES[code] ?? code;
}

function tierRank(port: Port): number {
  const t = port.meta?.tier;
  if (t === "major") return 0;
  if (t === "secondary") return 1;
  const size = port.specifications?.harborSize?.toLowerCase() ?? "";
  if (size.startsWith("l")) return 0;
  if (size.startsWith("m")) return 1;
  return 2;
}

function cityOf(port: Port): string {
  // Prefer explicit city from search-index enrichment on meta via locationLabel first token
  const fromLabel = port.locationLabel?.split(",")[0]?.trim();
  return fromLabel || port.name;
}

function aliasesOf(port: Port): string[] {
  return port.meta?.aliases ?? [];
}

function hit(
  port: Port,
  score: number,
  matchReason: string,
  confidence: PortResolution["confidence"],
): PortResolution {
  return { port, score, matchReason, confidence };
}

function single(
  queryText: string,
  port: Port,
  score: number,
  matchReason: string,
  confidence: PortResolution["confidence"],
): LocationResolutionResult {
  const h = hit(port, score, matchReason, confidence);
  return { queryText, best: h, candidates: [h], ambiguous: false };
}

function finish(
  queryText: string,
  hits: PortResolution[],
): LocationResolutionResult {
  return {
    queryText,
    best: hits[0],
    candidates: hits.slice(0, 5),
    ambiguous: false,
  };
}

function ambiguousResult(
  queryText: string,
  hits: PortResolution[],
): LocationResolutionResult {
  return {
    queryText,
    best: undefined,
    candidates: hits.slice(0, 5),
    ambiguous: true,
  };
}

function stripPortNoise(value: string): string {
  // Only strip "Port of X" / foreign equivalents — never bare "Port Klang" / "Port Said".
  return value
    .replace(
      /^(port of|haven van|hafen von|puerto de|porto di|λιμανι)\s+/i,
      "",
    )
    .trim();
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

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
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
