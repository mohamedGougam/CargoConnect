import type { ShipmentObservation } from "@/domain/commercial/types";
import { haversineKm } from "@/lib/search/buildCorridor";
import type { VesselObservationInput } from "@/server/execution/observeVessel";
import { classifyAisFreshness } from "@/server/execution/freshness";

const MIN_DISTANCE_KM = 2;
const MIN_SPEED_DELTA = 1.5;

/**
 * Persist only meaningful AIS changes — avoid identical point spam.
 */
export function isMeaningfulObservationChange(input: {
  previous: ShipmentObservation | null | undefined;
  next: VesselObservationInput;
}): boolean {
  const { previous, next } = input;
  if (!previous) return true;

  const elapsedMs =
    new Date(next.observedAt).getTime() -
    new Date(previous.observedAt).getTime();
  const intervalMs =
    Number(process.env.SHIPMENT_OBSERVATION_INTERVAL_SECONDS ?? "300") * 1000;

  const dist = haversineKm(
    { latitude: previous.latitude, longitude: previous.longitude },
    { latitude: next.latitude, longitude: next.longitude },
  );
  if (dist >= MIN_DISTANCE_KM) return true;

  const speedDelta = Math.abs((next.sog ?? 0) - (previous.sog ?? 0));
  if (speedDelta >= MIN_SPEED_DELTA) return true;

  if ((next.navStatus ?? "") !== (previous.navStatus ?? "")) return true;
  if ((next.aisDestination ?? "") !== (previous.aisDestination ?? ""))
    return true;
  if ((next.aisEta ?? "") !== (previous.aisEta ?? "")) return true;

  const prevFresh = previous.freshnessLabel;
  const nextFresh = classifyAisFreshness(next.observedAt);
  if (prevFresh !== nextFresh) return true;

  // Enough time elapsed for a periodic track
  if (elapsedMs >= Math.max(intervalMs, 60_000)) return true;

  return false;
}
