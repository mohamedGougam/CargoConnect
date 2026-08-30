import type { GeoPoint } from "@/domain/models";

/**
 * Build a gentle maritime-looking arc between two points.
 * Prefer ocean-side midpoints rather than straight chords across land.
 */
export function maritimeArc(
  from: GeoPoint,
  to: GeoPoint,
  options?: { segments?: number; bulge?: number; preferSouth?: boolean },
): GeoPoint[] {
  const segments = options?.segments ?? 8;
  const bulge = options?.bulge ?? 0.18;
  const midLon = (from.longitude + to.longitude) / 2;
  let midLat = (from.latitude + to.latitude) / 2;

  const dLon = Math.abs(to.longitude - from.longitude);
  const dLat = Math.abs(to.latitude - from.latitude);
  const dist = Math.sqrt(dLon * dLon + dLat * dLat);

  // Nudge midpoint toward open water (usually lower latitude in N hemisphere corridors)
  const southBias = options?.preferSouth === false ? 1 : -1;
  midLat += southBias * dist * bulge;
  // Keep midpoints from drifting into polar absurdity
  midLat = Math.max(-55, Math.min(65, midLat));

  const points: GeoPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Quadratic Bezier
    const lon =
      (1 - t) * (1 - t) * from.longitude +
      2 * (1 - t) * t * midLon +
      t * t * to.longitude;
    const lat =
      (1 - t) * (1 - t) * from.latitude + 2 * (1 - t) * t * midLat + t * t * to.latitude;
    points.push({ longitude: lon, latitude: lat });
  }
  return points;
}

/** Chain multiple port positions into a multi-leg maritime path. */
export function chainMaritimeWaypoints(
  ports: GeoPoint[],
  options?: { segmentsPerLeg?: number; bulge?: number },
): GeoPoint[] {
  if (ports.length === 0) return [];
  if (ports.length === 1) return [...ports];

  const out: GeoPoint[] = [];
  for (let i = 0; i < ports.length - 1; i++) {
    const arc = maritimeArc(ports[i], ports[i + 1], {
      segments: options?.segmentsPerLeg ?? 6,
      bulge: options?.bulge ?? 0.16,
    });
    if (i > 0) arc.shift();
    out.push(...arc);
  }
  return out;
}
