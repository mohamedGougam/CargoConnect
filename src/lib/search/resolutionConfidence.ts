import type { LocationResolutionResult } from "@/domain/search/types";
import type { PortResolutionOutcome } from "@/domain/search/intent";

/**
 * Deterministic resolution confidence AFTER model interpretation.
 * OpenAI confidence alone must not decide auto-resolve vs candidates.
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

  if (best.score >= 90) return "auto";
  if (best.score >= 70) return "auto";
  if (best.score >= 55 && !res.ambiguous) return "auto";
  if (res.candidates.length > 1) return "candidates";
  return "clarification";
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
