import type { Port } from "@/domain/models";
import type { MaritimeSearchIntent } from "@/domain/search/intent";
import type { LocationResolutionResult } from "@/domain/search/types";
import { classifyLocationResolution } from "@/lib/search/resolutionConfidence";
import { resolveLocation } from "@/lib/search/resolvePorts";

/**
 * Try multiple place fields from LLM intent against the catalogue.
 * Prefer auto-resolve hits; never invent ports.
 */
export function resolvePlaceIntent(
  place: MaritimeSearchIntent["origin"],
  ports: Port[],
): LocationResolutionResult {
  const attempts = [
    place.city,
    stripLabel(place.portHint),
    stripLabel(place.interpretedName),
    place.country,
    place.region,
    place.rawText,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  const seen = new Set<string>();
  let best: LocationResolutionResult = {
    queryText: place.rawText ?? place.portHint ?? "",
    candidates: [],
    ambiguous: false,
  };

  for (const text of attempts) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const res = resolveLocation(text, ports);
    const outcome = classifyLocationResolution(res);
    if (outcome === "auto" && res.best) return res;
    if (
      (res.best?.score ?? 0) > (best.best?.score ?? 0) ||
      (res.candidates.length > best.candidates.length && !best.best)
    ) {
      best = res;
    }
  }
  return best;
}

function stripLabel(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value
    .trim()
    .replace(/^(port of|port|haven|hafen|puerto|porto)\s+/i, "")
    .replace(/\s+(port|haven|hafen)$/i, "")
    .trim();
}
