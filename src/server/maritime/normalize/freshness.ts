import type { VesselFreshness } from "@/domain/models";

/** Age thresholds from last position timestamp (documented in strategy docs). */
export const FRESHNESS_LIVE_MAX_MS = 15 * 60 * 1000; // ≤ 15 min → live
export const FRESHNESS_STALE_MAX_MS = 2 * 60 * 60 * 1000; // ≤ 2 h → stale; else very_stale

export function classifyFreshness(
  sourceTimestampIso: string | undefined,
  nowMs: number = Date.now(),
): VesselFreshness {
  if (!sourceTimestampIso) return "very_stale";
  const t = Date.parse(sourceTimestampIso);
  if (!Number.isFinite(t)) return "very_stale";
  const age = nowMs - t;
  if (age < 0) return "live";
  if (age <= FRESHNESS_LIVE_MAX_MS) return "live";
  if (age <= FRESHNESS_STALE_MAX_MS) return "stale";
  return "very_stale";
}

/** Drop vessels older than this from API snapshots (default 6h). */
export const VERY_STALE_HIDE_MS = 6 * 60 * 60 * 1000;

export function shouldIncludeInSnapshot(
  sourceTimestampIso: string | undefined,
  nowMs: number = Date.now(),
  hideAfterMs: number = VERY_STALE_HIDE_MS,
): boolean {
  if (!sourceTimestampIso) return false;
  const t = Date.parse(sourceTimestampIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= hideAfterMs;
}
