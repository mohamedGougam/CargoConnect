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

  // Country / region → same-country candidates only
  const countryCode = COUNTRY_QUERY_CODES[q];
  if (countryCode) {
    return resolveCountry(queryText, ports, countryCode);
  }

  // e. explicit city → serving ports (before fuzzy name, after exact checks below)
  // First try exact name / alias / city on catalogue rows

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

  if (exactName.length === 1) {
    return finish(queryText, exactName);
  }
  if (exactName.length > 1) {
    return ambiguousResult(queryText, exactName);
  }

  if (aliasHits.length === 1) {
    return finish(queryText, aliasHits);
  }
  if (aliasHits.length > 1) {
    // Same-country aliases only keep; cross-country → ambiguous for CI guard
    const countries = new Set(aliasHits.map((h) => h.port.country));
    if (countries.size === 1) return ambiguousResult(queryText, aliasHits);
    return ambiguousResult(queryText, aliasHits);
  }

  if (cityHits.length === 1) {
    return finish(queryText, cityHits);
  }
  if (cityHits.length > 1) {
    const countries = new Set(cityHits.map((h) => h.port.country));
    if (countries.size > 1) {
      return ambiguousResult(queryText, cityHits);
    }
    return ambiguousResult(queryText, cityHits);
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
  fuzzy.sort((a, b) => b.score - a.score);
  if (fuzzy.length === 1 && fuzzy[0].score >= 80) {
    return finish(queryText, fuzzy);
  }
  if (fuzzy.length > 1 && fuzzy[0].score >= 80) {
    const top = fuzzy.filter((f) => f.score >= fuzzy[0].score - 5);
    if (top.length === 1) return finish(queryText, top);
    return ambiguousResult(queryText, top.slice(0, 5));
  }

  // g. clarification
  return { queryText, candidates: [], ambiguous: true };
}

function resolveCountry(
  queryText: string,
  ports: Port[],
  countryCode: string,
): LocationResolutionResult {
  const inCountry = ports.filter(
    (p) =>
      p.unlocode?.slice(0, 2).toUpperCase() === countryCode ||
      normalize(p.country) === normalize(countryNameFromCode(countryCode)),
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
  return value
    .replace(/^(port of|port|haven|hafen|puerto|porto|λιμανι)\s+/i, "")
    .replace(/\s+(port|haven|hafen)$/i, "")
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
