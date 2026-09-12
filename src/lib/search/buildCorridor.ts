import type { GeoPoint, Port } from "@/domain/models";
import type { MaritimeCorridor } from "@/domain/search/types";

/**
 * Build a visual/search maritime corridor (NOT navigational routing).
 * Uses major passage waypoints so long-haul lines avoid absurd land shortcuts.
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

  if (isNwEurope(origin) && isEasternMed(destination)) {
    return [origin, ...GIBRALTAR_LANE, destination];
  }
  if (isEasternMed(origin) && isNwEurope(destination)) {
    return [origin, ...[...GIBRALTAR_LANE].reverse(), destination];
  }
  if (isMed(origin) && isMed(destination)) {
    return [origin, midpoint(origin, destination), destination];
  }

  // Asia ↔ NW Europe / Med via Suez / Malacca heuristics
  if (isAsia(origin) && (isNwEurope(destination) || isMed(destination))) {
    return [origin, ...ASIA_TO_EUROPE_LANE, destination];
  }
  if ((isNwEurope(origin) || isMed(origin)) && isAsia(destination)) {
    return [origin, ...[...ASIA_TO_EUROPE_LANE].reverse(), destination];
  }

  // Asia ↔ US West via Pacific (antimeridian-safe midpoints)
  if (isAsia(origin) && isUsWest(destination)) {
    return [origin, ...PACIFIC_ASIA_US_LANE, destination];
  }
  if (isUsWest(origin) && isAsia(destination)) {
    return [origin, ...[...PACIFIC_ASIA_US_LANE].reverse(), destination];
  }

  // Europe / Med ↔ US East
  if ((isNwEurope(origin) || isMed(origin)) && isUsEast(destination)) {
    return [origin, ...ATLANTIC_LANE, destination];
  }
  if (isUsEast(origin) && (isNwEurope(destination) || isMed(destination))) {
    return [origin, ...[...ATLANTIC_LANE].reverse(), destination];
  }

  // Gulf ↔ Europe via Suez / Bab el-Mandeb / Red Sea
  if (isArabianGulf(origin) && (isNwEurope(destination) || isMed(destination))) {
    return [origin, ...GULF_TO_EUROPE_LANE, destination];
  }
  if ((isNwEurope(origin) || isMed(origin)) && isArabianGulf(destination)) {
    return [origin, ...[...GULF_TO_EUROPE_LANE].reverse(), destination];
  }

  // Cape of Good Hope for extreme south Africa ↔ Asia/Europe when needed
  if (isSouthernAfrica(origin) || isSouthernAfrica(destination)) {
    const via = CAPE_LANE;
    if (haversineKm(origin, destination) > 4000) {
      return [origin, ...via, destination];
    }
  }

  // Long east-west with antimeridian: split midpoints along shorter arc
  if (Math.abs(shortestLonDelta(origin.longitude, destination.longitude)) > 40) {
    return [
      origin,
      ...longHaulMidpoints(origin, destination),
      destination,
    ];
  }

  if (Math.abs(origin.longitude - destination.longitude) > 8) {
    const mid = midpoint(origin, destination);
    const southBias = Math.min(origin.latitude, destination.latitude) - 2;
    return [
      origin,
      {
        longitude: mid.longitude - (destination.longitude - origin.longitude) * 0.15,
        latitude: Math.min(mid.latitude, southBias + 8),
      },
      mid,
      {
        longitude: mid.longitude + (destination.longitude - origin.longitude) * 0.15,
        latitude: Math.min(mid.latitude, southBias + 6),
      },
      destination,
    ];
  }

  return [origin, midpoint(origin, destination), destination];
}

function laneKey(a: GeoPoint, b: GeoPoint): string {
  if (near(a, 51.95, 4.48) && near(b, 31.2, 29.89)) return "rotterdam-alexandria";
  if (near(a, 31.2, 29.89) && near(b, 51.95, 4.48)) return "alexandria-rotterdam";
  if (near(a, 37.95, 23.64) && near(b, 41.0, 28.98)) return "piraeus-istanbul";
  if (near(a, 41.0, 28.98) && near(b, 37.95, 23.64)) return "istanbul-piraeus";
  if (near(a, 37.95, 23.64) && near(b, 31.2, 29.89)) return "piraeus-alexandria";
  return "";
}

const GIBRALTAR_LANE: GeoPoint[] = [
  { longitude: 1.5, latitude: 51.0 },
  { longitude: -5.0, latitude: 45.5 },
  { longitude: -9.5, latitude: 42.0 },
  { longitude: -8.5, latitude: 36.5 },
  { longitude: -5.35, latitude: 36.0 }, // Gibraltar
  { longitude: 3.0, latitude: 37.0 },
  { longitude: 12.0, latitude: 36.5 },
  { longitude: 20.0, latitude: 34.5 },
];

/** Visual only — Malacca → Indian Ocean → Bab el-Mandeb → Suez → Med → Gibraltar. */
const ASIA_TO_EUROPE_LANE: GeoPoint[] = [
  { longitude: 104.0, latitude: 1.5 }, // Malacca
  { longitude: 80.0, latitude: 5.0 },
  { longitude: 60.0, latitude: 12.0 },
  { longitude: 43.5, latitude: 12.5 }, // Bab el-Mandeb
  { longitude: 38.0, latitude: 20.0 }, // Red Sea
  { longitude: 32.5, latitude: 30.0 }, // Suez
  { longitude: 20.0, latitude: 34.0 },
  { longitude: -5.35, latitude: 36.0 }, // Gibraltar
  { longitude: -8.0, latitude: 42.0 },
];

const GULF_TO_EUROPE_LANE: GeoPoint[] = [
  { longitude: 56.5, latitude: 25.0 },
  { longitude: 57.5, latitude: 20.0 },
  { longitude: 43.5, latitude: 12.5 },
  { longitude: 38.0, latitude: 20.0 },
  { longitude: 32.5, latitude: 30.0 },
  { longitude: 20.0, latitude: 34.0 },
  { longitude: -5.35, latitude: 36.0 },
];

/** Pacific lane uses lon values that MapLibre can draw without wrapping wrongly when split. */
const PACIFIC_ASIA_US_LANE: GeoPoint[] = [
  { longitude: 140.0, latitude: 30.0 },
  { longitude: 160.0, latitude: 28.0 },
  { longitude: 180.0, latitude: 30.0 },
  { longitude: -160.0, latitude: 32.0 },
  { longitude: -140.0, latitude: 34.0 },
  { longitude: -125.0, latitude: 35.0 },
];

const ATLANTIC_LANE: GeoPoint[] = [
  { longitude: -10.0, latitude: 45.0 },
  { longitude: -30.0, latitude: 40.0 },
  { longitude: -50.0, latitude: 38.0 },
  { longitude: -65.0, latitude: 38.0 },
];

const CAPE_LANE: GeoPoint[] = [
  { longitude: 18.5, latitude: -34.5 },
  { longitude: 25.0, latitude: -35.0 },
];

const LANE_TEMPLATES: Record<string, GeoPoint[]> = {
  "rotterdam-alexandria": GIBRALTAR_LANE,
  "alexandria-rotterdam": [...GIBRALTAR_LANE].reverse(),
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

function isAsia(p: GeoPoint): boolean {
  return p.latitude > -10 && p.latitude < 45 && p.longitude > 90 && p.longitude < 150;
}

function isUsWest(p: GeoPoint): boolean {
  return p.latitude > 30 && p.latitude < 50 && p.longitude > -130 && p.longitude < -115;
}

function isUsEast(p: GeoPoint): boolean {
  return p.latitude > 24 && p.latitude < 45 && p.longitude > -82 && p.longitude < -65;
}

function isArabianGulf(p: GeoPoint): boolean {
  return p.latitude > 23 && p.latitude < 31 && p.longitude > 48 && p.longitude < 58;
}

function isSouthernAfrica(p: GeoPoint): boolean {
  return p.latitude > -36 && p.latitude < -22 && p.longitude > 14 && p.longitude < 40;
}

function shortestLonDelta(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function midpoint(a: GeoPoint, b: GeoPoint): GeoPoint {
  const dLon = shortestLonDelta(a.longitude, b.longitude);
  return {
    longitude: normalizeLon(a.longitude + dLon / 2),
    latitude: (a.latitude + b.latitude) / 2,
  };
}

function longHaulMidpoints(a: GeoPoint, b: GeoPoint): GeoPoint[] {
  const dLon = shortestLonDelta(a.longitude, b.longitude);
  const t = [0.25, 0.5, 0.75];
  return t.map((f) => ({
    longitude: normalizeLon(a.longitude + dLon * f),
    latitude: a.latitude + (b.latitude - a.latitude) * f,
  }));
}

function normalizeLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function estimateCorridorWidthNm(waypoints: GeoPoint[]): number {
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
  const dLon = toRad(shortestLonDelta(a.longitude, b.longitude));
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distanceToSegmentKm(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const x = p.longitude;
  const y = p.latitude;
  const x1 = a.longitude;
  const y1 = a.latitude;
  const x2 = a.longitude + shortestLonDelta(a.longitude, b.longitude);
  const y2 = b.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return haversineKm(p, a);
  let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return haversineKm(p, {
    longitude: normalizeLon(x1 + t * dx),
    latitude: y1 + t * dy,
  });
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(shortestLonDelta(a.longitude, b.longitude));
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
