import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoPoint, MaritimeRoute, Port, Vessel, VesselType } from "@/domain/models";
import { vesselIconId } from "@/lib/map/vesselIcons";

export function vesselsToGeoJSON(vessels: Vessel[]): FeatureCollection<
  Point,
  {
    id: string;
    name: string;
    course: number;
    status: string;
    type: VesselType;
    icon: string;
  }
> {
  return {
    type: "FeatureCollection",
    features: vessels.map((vessel) => ({
      type: "Feature",
      id: vessel.id,
      properties: {
        id: vessel.id,
        name: vessel.name,
        course: vessel.course ?? 0,
        status: vessel.status,
        type: vessel.type,
        icon: vesselIconId(vessel.type),
      },
      geometry: {
        type: "Point",
        coordinates: [vessel.position.longitude, vessel.position.latitude],
      },
    })),
  };
}

export function portsToGeoJSON(
  ports: Port[],
): FeatureCollection<Point, { id: string; name: string; major: boolean }> {
  return {
    type: "FeatureCollection",
    features: ports.map((port) => ({
      type: "Feature",
      id: port.id,
      properties: {
        id: port.id,
        name: port.name,
        major: true,
      },
      geometry: {
        type: "Point",
        coordinates: [port.position.longitude, port.position.latitude],
      },
    })),
  };
}

export function routesToGeoJSON(
  routes: MaritimeRoute[],
): FeatureCollection<LineString, { id: string }> {
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      id: route.id,
      properties: { id: route.id },
      geometry: {
        type: "LineString",
        coordinates: route.waypoints.map((p) => [p.longitude, p.latitude]),
      },
    })),
  };
}

export function interpolateAlongRoute(
  waypoints: GeoPoint[],
  t: number,
): GeoPoint & { course: number } {
  if (waypoints.length === 0) {
    return { longitude: 0, latitude: 0, course: 0 };
  }
  if (waypoints.length === 1) {
    return { ...waypoints[0], course: 0 };
  }

  const clamped = Math.max(0, Math.min(1, t));
  const distances = segmentDistances(waypoints);
  const total = distances.reduce((sum, d) => sum + d, 0) || 1;
  let remaining = clamped * total;

  for (let i = 0; i < distances.length; i++) {
    const segment = distances[i];
    if (remaining <= segment || i === distances.length - 1) {
      const localT = segment === 0 ? 0 : remaining / segment;
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return {
        longitude: a.longitude + (b.longitude - a.longitude) * localT,
        latitude: a.latitude + (b.latitude - a.latitude) * localT,
        course: bearingDegrees(a, b),
      };
    }
    remaining -= segment;
  }

  const last = waypoints[waypoints.length - 1];
  return { ...last, course: 0 };
}

function segmentDistances(points: GeoPoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(haversineKm(points[i], points[i + 1]));
  }
  return out;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const φ1 = toRad(from.latitude);
  const φ2 = toRad(to.latitude);
  const Δλ = toRad(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export type VesselFeature = Feature<
  Point,
  {
    id: string;
    name: string;
    course: number;
    status: string;
    type: VesselType;
    icon: string;
  }
>;
