/**
 * AIS freshness labels for shipment tracking.
 * Never call delayed/stale positions "live".
 */
export type AisFreshnessLabel = "live" | "recent" | "delayed" | "stale";

export function aisFreshnessThresholdsMs() {
  const recent = Number(process.env.AIS_FRESHNESS_RECENT_MS ?? String(15 * 60_000));
  const delayed = Number(
    process.env.AIS_FRESHNESS_DELAYED_MS ?? String(60 * 60_000),
  );
  return {
    recentMs: Number.isFinite(recent) && recent > 0 ? recent : 15 * 60_000,
    delayedMs: Number.isFinite(delayed) && delayed > 0 ? delayed : 60 * 60_000,
  };
}

export function classifyAisFreshness(
  observedAtIso: string,
  nowMs = Date.now(),
): AisFreshnessLabel {
  const age = nowMs - new Date(observedAtIso).getTime();
  if (!Number.isFinite(age) || age < 0) return "stale";
  const { recentMs, delayedMs } = aisFreshnessThresholdsMs();
  if (age <= recentMs / 3) return "live";
  if (age <= recentMs) return "recent";
  if (age <= delayedMs) return "delayed";
  return "stale";
}

export function maxShipmentObservations(): number {
  const n = Number(process.env.SHIPMENT_OBSERVATION_MAX_PER_EXECUTION ?? "200");
  return Number.isFinite(n) && n > 10 ? Math.min(n, 2000) : 200;
}

export function periodicObservationMinIntervalMs(): number {
  const n = Number(
    process.env.SHIPMENT_OBSERVATION_PERIODIC_MS ?? String(30 * 60_000),
  );
  return Number.isFinite(n) && n >= 60_000 ? n : 30 * 60_000;
}
