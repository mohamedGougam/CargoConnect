import type { GeoPoint, Port } from "@/domain/models";
import type { MaritimeCorridor } from "@/domain/search/types";

/**
 * Build a visual/search maritime corridor (not optimized navigation routing).
 * Uses geographically sensible waypoints so the line does not cut across land.
 */
export function buildMaritimeCorridor(
  origin: Port,
  destination: Port,
): MaritimeCorridor {
  const a = origin.position;
  const b = destination.position;
  const waypoints = buildWaypoints(a, b);

  return {
    id: `corridor:${origin.id}->${destination.id}`,
    kind: "visual_search_corridor",
    originPortId: origin.id,
    destinationPortId: destination.id,
    waypoints,
    corridorWidthNm: estimateCorridorWidthNm(waypoints),
  };
}

function buildWaypoints(origin: GeoPoint, destination: GeoPoint): GeoPoint[] {
  const key = laneKey(origin, destination);
  const template = LANE_TEMPLATES[key];
  if (template) {
    return [origin, ...template, destination];
  }

  // Generic: if both in Med, gentle midpoints; if NW Europe → Med, via Gibraltar
  if (isNwEurope(origin) && isEasternMed(destination)) {
    return [origin, ...GIBRALTARE_LANE, destination];
  }
  if (isEasternMed(origin) && isNwEurope(destination)) {
    return [origin, ...[...GIBRALTARE_LANE].reverse(), destination];
  }
  if (isMed(origin) && isMed(destination)) {
    return [origin, midpoint(origin, destination), destination];
  }

  // Fallback: two midpoints with slight south bias if crossing Europe longitudinally
  if (Math.abs(origin.longitude - destination.longitude) > 8) {
    const mid = midpoint(origin, destination);
    const southBias = Math.min(origin.latitude, destination.latitude) - 2;
    return [
      origin,
      { longitude: mid.longitude - (destination.longitude - origin.longitude) * 0.15, latitude: Math.min(mid.latitude, southBias + 8) },
      mid,
      { longitude: mid.longitude + (destination.longitude - origin.longitude) * 0.15, latitude: Math.min(mid.latitude, southBias + 6) },
      destination,
    ];
  }

  return [origin, midpoint(origin, destination), destination];
}

function laneKey(a: GeoPoint, b: GeoPoint): string {
  // Coarse buckets for known demo lanes
  if (near(a, 51.95, 4.48) && near(b, 31.2, 29.89)) return "rotterdam-alexandria";
  if (near(a, 31.2, 29.89) && near(b, 51.95, 4.48)) return "alexandria-rotterdam";
  if (near(a, 37.95, 23.64) && near(b, 41.0, 28.98)) return "piraeus-istanbul";
  if (near(a, 41.0, 28.98) && near(b, 37.95, 23.64)) return "istanbul-piraeus";
  if (near(a, 37.95, 23.64) && near(b, 31.2, 29.89)) return "piraeus-alexandria";
  return "";
}

const GIBRALTARE_LANE: GeoPoint[] = [
  { longitude: 1.5, latitude: 51.0 }, // Channel approaches
  { longitude: -5.0, latitude: 45.5 }, // Biscay
  { longitude: -9.5, latitude: 42.0 }, // Finisterre
  { longitude: -8.5, latitude: 36.5 }, // approaches Gibraltar W
  { longitude: -5.35, latitude: 36.0 }, // Gibraltar
  { longitude: 3.0, latitude: 37.0 }, // W Med
  { longitude: 12.0, latitude: 36.5 }, // C Med
  { longitude: 20.0, latitude: 34.5 }, // approaches E Med
];

const LANE_TEMPLATES: Record<string, GeoPoint[]> = {
  "rotterdam-alexandria": GIBRALTARE_LANE,
  "alexandria-rotterdam": [...GIBRALTARE_LANE].reverse(),
  "piraeus-istanbul": [
    { longitude: 24.5, latitude: 38.5 },
    { longitude: 25.5, latitude: 39.5 },
    { longitude: 26.5, latitude: 40.2 },
  ],
  "istanbul-piraeus": [
    { longitude: 26.5, latitude: 40.2 },
    { longitude: 25.5, latitude: 39.5 },
    { longitude: 24.5, latitude: 38.5 },
  ],
  "piraeus-alexandria": [
    { longitude: 24.5, latitude: 35.5 },
    { longitude: 27.0, latitude: 33.5 },
  ],
};

function near(p: GeoPoint, lat: number, lon: number, tol = 1.2): boolean {
  return Math.abs(p.latitude - lat) < tol && Math.abs(p.longitude - lon) < tol;
}

function isNwEurope(p: GeoPoint): boolean {
  return p.latitude > 48 && p.longitude > -10 && p.longitude < 15;
}

function isEasternMed(p: GeoPoint): boolean {
  return p.latitude > 30 && p.latitude < 42 && p.longitude > 18 && p.longitude < 37;
}

function isMed(p: GeoPoint): boolean {
  return p.latitude > 30 && p.latitude < 46 && p.longitude > -6 && p.longitude < 37;
}

function midpoint(a: GeoPoint, b: GeoPoint): GeoPoint {
  return {
    longitude: (a.longitude + b.longitude) / 2,
    latitude: (a.latitude + b.latitude) / 2,
  };
}

function estimateCorridorWidthNm(waypoints: GeoPoint[]): number {
  // Wider for long-haul visual corridors
  if (waypoints.length >= 6) return 90;
  if (waypoints.length >= 4) return 60;
  return 45;
}

/** Distance from point to polyline in km (approx). */
export function distancePointToPolylineKm(
  point: GeoPoint,
  line: GeoPoint[],
): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return haversineKm(point, line[0]);

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    min = Math.min(min, distanceToSegmentKm(point, line[i], line[i + 1]));
  }
  return min;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distanceToSegmentKm(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  // Equirectangular local projection
  const x = p.longitude;
  const y = p.latitude;
  const x1 = a.longitude;
  const y1 = a.latitude;
  const x2 = b.longitude;
  const y2 = b.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return haversineKm(p, a);
  let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return haversineKm(p, { longitude: x1 + t * dx, latitude: y1 + t * dy });
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Bearing from a→b in degrees 0–360. */
export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toDeg(r: number): number {
  return (r * 180) / Math.PI;
}

export function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
