import type { GeoPoint, Port } from "@/domain/models";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { haversineKm } from "@/lib/search/buildCorridor";
import { resolveLocation } from "@/lib/search/resolvePorts";

/** Approximate operational geofence — not a port-authority boundary. */
export interface PortGeofence {
  portId: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  label: string;
}

export function defaultGeofenceRadiusKm(): number {
  const n = Number(process.env.SHIPMENT_GEOFENCE_RADIUS_KM ?? "40");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 150) : 40;
}

export function resolvePortByNameOrId(
  hint?: string | null,
): Port | undefined {
  if (!hint?.trim()) return undefined;
  const q = hint.trim();
  const ports = getSearchPortIndex();
  const byId = ports.find((p) => p.id === q);
  if (byId) return byId;
  const byUnlo = ports.find(
    (p) => p.unlocode?.toUpperCase() === q.toUpperCase(),
  );
  if (byUnlo) return byUnlo;
  // Use catalogue resolver so cross-country namesakes prefer major hubs
  const resolved = resolveLocation(q, ports);
  return resolved.best?.port ?? resolved.candidates[0]?.port;
}

export function buildPortGeofence(port: Port, radiusKm?: number): PortGeofence {
  return {
    portId: port.id,
    centerLat: port.position.latitude,
    centerLon: port.position.longitude,
    radiusKm: radiusKm ?? defaultGeofenceRadiusKm(),
    label: `Approximate operational geofence for ${port.name}`,
  };
}

export function distanceToGeofenceKm(
  point: GeoPoint,
  fence: PortGeofence,
): number {
  return haversineKm(point, {
    latitude: fence.centerLat,
    longitude: fence.centerLon,
  });
}

export function isInsideGeofence(
  point: GeoPoint,
  fence: PortGeofence,
): boolean {
  return distanceToGeofenceKm(point, fence) <= fence.radiusKm;
}
