import type { LocationResolutionResult } from "@/domain/search/types";
import type { PortResolutionOutcome } from "@/domain/search/intent";

/**
 * Deterministic resolution confidence AFTER catalogue matching.
 * OpenAI confidence alone must not decide auto-resolve vs candidates.
 *
 * HIGH  = exact port / city / UNLOCODE
 * MEDIUM = nearby/serving-port mapping
 * LOW   = country/region ambiguity
 */
export function classifyLocationResolution(
  res: LocationResolutionResult,
): PortResolutionOutcome {
  if (!res.candidates.length && !res.best) {
    return "clarification";
  }

  if (res.ambiguous) {
    return res.candidates.length > 0 ? "candidates" : "clarification";
  }

  const best = res.best;
  if (!best) {
    return res.candidates.length > 0 ? "candidates" : "clarification";
  }

  if (best.confidence === "LOW") {
    return res.candidates.length > 1 ? "candidates" : "auto";
  }
  if (best.confidence === "MEDIUM") {
    return "auto";
  }
  // HIGH
  return "auto";
}

export function mergeResolutionOutcomes(
  origin: PortResolutionOutcome,
  destination: PortResolutionOutcome,
): PortResolutionOutcome {
  if (origin === "clarification" || destination === "clarification") {
    return "clarification";
  }
  if (origin === "candidates" || destination === "candidates") {
    return "candidates";
  }
  return "auto";
}
