import type { Port } from "@/domain/models";
import {
  buildMaritimeCorridor,
  haversineKm,
} from "@/lib/search/buildCorridor";

export interface MaritimeDistanceEstimate {
  distanceNm: number;
  method: "corridor_polyline_nm";
  estimated: true;
}

const distanceCache = new Map<string, MaritimeDistanceEstimate>();

/**
 * Lightweight estimated maritime distance along CargoConnect visual corridor
 * waypoints (not navigational routing / not great-circle through land).
 */
export function estimateMaritimeDistanceNm(
  origin: Port,
  destination: Port,
): MaritimeDistanceEstimate {
  const key = cacheKey(origin, destination);
  const cached = distanceCache.get(key);
  if (cached) return cached;

  const corridor = buildMaritimeCorridor(origin, destination);
  let km = 0;
  for (let i = 1; i < corridor.waypoints.length; i++) {
    km += haversineKm(corridor.waypoints[i - 1], corridor.waypoints[i]);
  }
  const distanceNm = Math.round(km / 1.852);
  const estimate: MaritimeDistanceEstimate = {
    distanceNm,
    method: "corridor_polyline_nm",
    estimated: true,
  };
  distanceCache.set(key, estimate);
  return estimate;
}

export function clearMaritimeDistanceCacheForTests(): void {
  distanceCache.clear();
}

function cacheKey(origin: Port, destination: Port): string {
  const a = origin.unlocode?.toUpperCase() || origin.id;
  const b = destination.unlocode?.toUpperCase() || destination.id;
  return `${a}->${b}`;
}
