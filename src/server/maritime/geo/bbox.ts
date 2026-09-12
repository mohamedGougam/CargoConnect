/**
 * Geographic bounding-box helpers for viewport-driven AIS.
 * Coordinates use longitude/latitude (MapLibre order) unless noted.
 */

export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** AISStream corner pair: SW [lat,lon], NE [lat,lon]. */
export interface AisBoundingBox {
  sw: [number, number];
  ne: [number, number];
}

/** Maximum span (degrees) for a single subscription box. */
export const MAX_BBOX_SPAN_DEG = 45;

/** Reject boxes larger than this area (deg²) unless split. */
export const MAX_BBOX_AREA_DEG2 = 1_600;

/** Pad viewport so vessels near edges stay subscribed. */
export const VIEWPORT_PAD_RATIO = 0.2;

export function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

export function normalizeLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

export function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Parse and validate a viewport bbox.
 * Supports antimeridian: west > east means wrap across ±180.
 */
export function parseLngLatBounds(input: {
  west: number;
  south: number;
  east: number;
  north: number;
}): LngLatBounds | null {
  const south = clampLat(input.south);
  const north = clampLat(input.north);
  const west = normalizeLon(input.west);
  const east = normalizeLon(input.east);
  if (north <= south) return null;
  if (!isValidLatLon(south, west) || !isValidLatLon(north, east)) return null;
  return { west, south, east, north };
}

export function boundsAreaDeg2(b: LngLatBounds): number {
  const latSpan = b.north - b.south;
  const lonSpan = lonSpanDegrees(b.west, b.east);
  return latSpan * lonSpan;
}

export function lonSpanDegrees(west: number, east: number): number {
  if (west <= east) return east - west;
  return 360 - west + east;
}

export function crossesAntimeridian(b: LngLatBounds): boolean {
  return b.west > b.east;
}

/** Expand bounds by ratio (each side). Caps at world limits. */
function padBounds(b: LngLatBounds, ratio = VIEWPORT_PAD_RATIO): LngLatBounds {
  const latPad = (b.north - b.south) * ratio;
  const lonPad = lonSpanDegrees(b.west, b.east) * ratio;
  const south = clampLat(b.south - latPad);
  const north = clampLat(b.north + latPad);
  const west = normalizeLon(b.west - lonPad);
  const east = normalizeLon(b.east + lonPad);
  if (north - south < 0.01) {
    return {
      west,
      south: clampLat(south - 0.05),
      east,
      north: clampLat(north + 0.05),
    };
  }
  return { west, south, east, north };
}

/**
 * Split antimeridian-crossing bounds into non-wrapping AIS boxes.
 * Also split oversized spans into tiles ≤ MAX_BBOX_SPAN_DEG.
 */
export function boundsToAisBoxes(b: LngLatBounds): AisBoundingBox[] {
  const pieces: LngLatBounds[] = [];
  if (crossesAntimeridian(b)) {
    pieces.push({ west: b.west, south: b.south, east: 180, north: b.north });
    pieces.push({ west: -180, south: b.south, east: b.east, north: b.north });
  } else {
    pieces.push(b);
  }

  const out: AisBoundingBox[] = [];
  for (const piece of pieces) {
    out.push(...tileBounds(piece));
  }
  return out;
}

function tileBounds(b: LngLatBounds): AisBoundingBox[] {
  const latSpan = b.north - b.south;
  const lonSpan = b.east - b.west;
  if (latSpan <= 0 || lonSpan <= 0) return [];

  const latSteps = Math.max(1, Math.ceil(latSpan / MAX_BBOX_SPAN_DEG));
  const lonSteps = Math.max(1, Math.ceil(lonSpan / MAX_BBOX_SPAN_DEG));
  const dLat = latSpan / latSteps;
  const dLon = lonSpan / lonSteps;
  const boxes: AisBoundingBox[] = [];

  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      const south = b.south + i * dLat;
      const north = i === latSteps - 1 ? b.north : south + dLat;
      const west = b.west + j * dLon;
      const east = j === lonSteps - 1 ? b.east : west + dLon;
      if (north - south < 0.001 || east - west < 0.001) continue;
      boxes.push({
        sw: [south, west],
        ne: [north, east],
      });
    }
  }
  return boxes;
}

export function aisBoxFromCorners(
  swLat: number,
  swLon: number,
  neLat: number,
  neLon: number,
): AisBoundingBox {
  return { sw: [swLat, swLon], ne: [neLat, neLon] };
}

export function aisBoxesEqual(a: AisBoundingBox[], b: AisBoundingBox[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].sw[0] !== b[i].sw[0] ||
      a[i].sw[1] !== b[i].sw[1] ||
      a[i].ne[0] !== b[i].ne[0] ||
      a[i].ne[1] !== b[i].ne[1]
    ) {
      return false;
    }
  }
  return true;
}

/** Quantize bounds so tiny pans do not trigger resubscribe. */
export function quantizeBounds(b: LngLatBounds, step = 0.25): LngLatBounds {
  const q = (n: number) => Math.round(n / step) * step;
  return {
    west: normalizeLon(q(b.west)),
    south: clampLat(q(b.south)),
    east: normalizeLon(q(b.east)),
    north: clampLat(q(b.north)),
  };
}

export function pointInBounds(
  lat: number,
  lon: number,
  b: LngLatBounds,
): boolean {
  if (lat < b.south || lat > b.north) return false;
  if (!crossesAntimeridian(b)) {
    return lon >= b.west && lon <= b.east;
  }
  return lon >= b.west || lon <= b.east;
}

/**
 * Cap an oversized viewport to its center tile for AIS subscription.
 * Still returns filter bounds for API response filtering.
 */
export function subscriptionBoundsForZoom(
  viewport: LngLatBounds,
  zoom: number,
): LngLatBounds {
  const padded = padBounds(viewport);
  // World / continental view — do not subscribe to entire globe.
  if (zoom < 3.5 || boundsAreaDeg2(padded) > MAX_BBOX_AREA_DEG2) {
    const midLat = (padded.south + padded.north) / 2;
    const midLon = antimeridianSafeMidLon(padded);
    const half = zoom < 2.5 ? 12 : 18;
    return {
      west: normalizeLon(midLon - half),
      south: clampLat(midLat - half * 0.7),
      east: normalizeLon(midLon + half),
      north: clampLat(midLat + half * 0.7),
    };
  }
  return padded;
}

function antimeridianSafeMidLon(b: LngLatBounds): number {
  if (!crossesAntimeridian(b)) return (b.west + b.east) / 2;
  const span = lonSpanDegrees(b.west, b.east);
  return normalizeLon(b.west + span / 2);
}
