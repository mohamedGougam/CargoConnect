import type { Port, Vessel } from "@/domain/models";

/**
 * Deterministic AIS destination → port matching.
 * Does not use OpenAI. Does not imply commercial availability.
 */
export function aisDestinationMatchesPort(
  destinationRaw: string | undefined,
  port: Port,
): boolean {
  if (!destinationRaw?.trim()) return false;
  const raw = normalizeDest(destinationRaw);
  if (!raw || raw.length < 3) return false;

  const name = normalizeDest(port.name);
  const unlo = port.unlocode?.toUpperCase().replace(/\s+/g, "") ?? "";
  const aliases = (port.meta?.aliases ?? []).map(normalizeDest);

  if (unlo && (raw === unlo.toLowerCase() || raw.includes(unlo.toLowerCase()))) {
    return true;
  }
  if (name.length >= 4 && (raw === name || raw.includes(name))) {
    return true;
  }
  // Token: "OSLO NORWAY" / "PORT OF OSLO"
  const tokens = raw.split(" ").filter((t) => t.length >= 3);
  if (name.length >= 4 && tokens.includes(name)) return true;

  for (const alias of aliases) {
    if (alias.length >= 4 && (raw === alias || raw.includes(alias) || tokens.includes(alias))) {
      return true;
    }
  }
  return false;
}

/**
 * Count vessels with fresh AIS observations reporting this port as destination.
 * Excludes very_stale. Corridor relevance is irrelevant here.
 */
export function countAisDestinationVessels(
  vessels: Vessel[],
  port: Port,
): number {
  let n = 0;
  for (const v of vessels) {
    const freshness = v.meta?.freshness;
    if (freshness === "very_stale") continue;
    if (!aisDestinationMatchesPort(v.destinationRaw, port)) continue;
    n += 1;
  }
  return n;
}

function normalizeDest(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(port of|port|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
