import type { GeoPoint, Port } from "@/domain/models";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { haversineKm } from "@/lib/search/buildCorridor";

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
  const q = hint.trim().toLowerCase();
  const ports = getSearchPortIndex();
  return (
    ports.find((p) => p.id === hint) ??
    ports.find((p) => p.name.toLowerCase() === q) ??
    ports.find((p) => p.name.toLowerCase().includes(q)) ??
    ports.find((p) => p.unlocode?.toLowerCase() === q)
  );
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
