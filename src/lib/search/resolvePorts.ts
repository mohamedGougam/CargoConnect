import type { Port } from "@/domain/models";
import type { LocationResolutionResult, PortResolution } from "@/domain/search/types";

const NAME_ALIASES: Record<string, string[]> = {
  rotterdam: ["rotterdam"],
  alexandria: ["alexandria"],
  piraeus: ["piraeus", "peiraeus", "pireaus"],
  istanbul: ["istanbul", "constantinople"],
  "port said": ["port said", "portsaid"],
  hamburg: ["hamburg"],
  antwerp: ["antwerp", "antwerpen"],
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
};

const REGION_ALIASES: Record<string, { country?: string; preferNames?: string[] }> = {
  greece: { country: "Greece", preferNames: ["Piraeus", "Thessaloniki"] },
  egypt: { country: "Egypt", preferNames: ["Alexandria", "Port Said", "Damietta"] },
  turkey: { country: "Turkey", preferNames: ["Istanbul", "Izmir", "Mersin"] },
  türkiye: { country: "Türkiye", preferNames: ["Istanbul"] },
  netherlands: { country: "Netherlands", preferNames: ["Rotterdam"] },
  holland: { country: "Netherlands", preferNames: ["Rotterdam"] },
  germany: { country: "Germany", preferNames: ["Hamburg"] },
  belgium: { country: "Belgium", preferNames: ["Antwerp"] },
  cyprus: { country: "Cyprus", preferNames: ["Limassol"] },
  israel: { country: "Israel", preferNames: ["Haifa", "Ashdod"] },
  italy: { country: "Italy", preferNames: ["Palermo", "Catania", "Augusta"] },
  malta: { country: "Malta", preferNames: ["Valletta"] },
  singapore: { country: "Singapore", preferNames: ["Singapore"] },
  china: { country: "China", preferNames: ["Shanghai", "Ningbo"] },
  "united arab emirates": { country: "United Arab Emirates", preferNames: ["Jebel Ali", "Dubai"] },
  uae: { country: "United Arab Emirates", preferNames: ["Jebel Ali", "Dubai"] },
  "united states": { country: "United States", preferNames: ["Los Angeles", "New York"] },
  usa: { country: "United States", preferNames: ["Los Angeles", "New York"] },
  malaysia: { country: "Malaysia", preferNames: ["Port Klang"] },
  japan: { country: "Japan", preferNames: ["Tokyo"] },
  australia: { country: "Australia", preferNames: ["Sydney"] },
};

export function resolveLocation(
  queryText: string | undefined,
  ports: Port[],
): LocationResolutionResult {
  if (!queryText?.trim()) {
    return { queryText: queryText ?? "", candidates: [], ambiguous: false };
  }

  const q = normalize(queryText);
  const region = REGION_ALIASES[q];
  if (region) {
    return resolveRegion(queryText, ports, region);
  }

  const scored: PortResolution[] = [];
  for (const port of ports) {
    const score = scorePortMatch(q, port);
    if (score <= 0) continue;
    scored.push({
      port,
      score,
      matchReason: score >= 90 ? "exact_name" : score >= 70 ? "alias_or_prefix" : "fuzzy",
    });
  }

  scored.sort((a, b) => b.score - a.score || a.port.name.localeCompare(b.port.name));
  const top = scored.slice(0, 5);
  const best = top[0];
  const ambiguous =
    top.length >= 2 && best && top[1].score >= best.score - 8 && top[1].score >= 60;

  return {
    queryText,
    best: ambiguous ? undefined : best?.score >= 55 ? best : undefined,
    candidates: top,
    ambiguous: Boolean(ambiguous || (!best && top.length > 0) || (best && best.score < 55)),
  };
}

function resolveRegion(
  queryText: string,
  ports: Port[],
  region: { country?: string; preferNames?: string[] },
): LocationResolutionResult {
  const countryPorts = ports.filter((p) =>
    region.country
      ? normalize(p.country) === normalize(region.country) ||
        normalize(p.country).includes(normalize(region.country!)) ||
        (region.country === "Turkey" && /t[uü]rkiye|turkey/i.test(p.country))
      : false,
  );

  const preferred: PortResolution[] = [];
  for (const name of region.preferNames ?? []) {
    const hit = countryPorts.find((p) => normalize(p.name) === normalize(name));
    if (hit) {
      preferred.push({ port: hit, score: 95, matchReason: "region_primary_port" });
    }
  }

  if (preferred.length === 0 && countryPorts.length > 0) {
    preferred.push({
      port: countryPorts[0],
      score: 80,
      matchReason: "region_fallback_port",
    });
  }

  // Region → single primary hub (not ambiguous list) for MVP corridor search
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

  if (name.startsWith(q) && q.length >= 3) return 85;
  if (q.startsWith(name) && name.length >= 3) return 82;
  if (name.includes(q) && q.length >= 4) return 72;
  if (label.includes(q) && q.length >= 4) return 60;
  if (country === q) return 50;

  // Token overlap
  const qTokens = q.split(" ").filter(Boolean);
  const nameTokens = name.split(" ").filter(Boolean);
  const overlap = qTokens.filter((t) => nameTokens.some((n) => n.startsWith(t) || t.startsWith(n)));
  if (overlap.length && overlap.length === qTokens.length) return 68;

  return 0;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
