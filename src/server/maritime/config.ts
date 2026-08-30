import type { AisFeedConnectionState } from "@/domain/models";
import { parseMaritimeMode, type MaritimeDataMode } from "@/lib/config/maritimeMode";

export type { MaritimeDataMode };

export interface BoundingBox {
  /** Southwest corner [lat, lon] then northeast [lat, lon] — AISStream corner pairs. */
  sw: [number, number];
  ne: [number, number];
}

/** Default: Eastern Mediterranean / Aegean focus (Greece–Egypt corridor). */
export const DEFAULT_AIS_BBOXES: BoundingBox[] = [
  {
    sw: [30.0, 22.0],
    ne: [41.5, 37.0],
  },
];

/**
 * Server-only maritime runtime config.
 * Never expose AISSTREAM_API_KEY to the client.
 */
export function getMaritimeServerConfig() {
  const mode = parseMaritimeMode(process.env.MARITIME_DATA_MODE);
  const publicMode = parseMaritimeMode(
    process.env.NEXT_PUBLIC_MARITIME_DATA_MODE ?? process.env.NEXT_PUBLIC_DATA_PROVIDER,
  );
  const aisstreamEnabled = parseBool(process.env.AISSTREAM_ENABLED, false);
  const apiKey = (process.env.AISSTREAM_API_KEY ?? "").trim();
  const bboxes = parseBboxes(process.env.AISSTREAM_BBOXES) ?? DEFAULT_AIS_BBOXES;
  const pollIntervalMs = clampInt(process.env.MARITIME_POLL_INTERVAL_MS, 10_000, 3_000, 60_000);
  const diagnosticsEnabled =
    process.env.NODE_ENV !== "production" ||
    parseBool(process.env.MARITIME_DIAGNOSTICS_ENABLED, false);

  const liveRequested =
    mode === "live" ||
    mode === "composite" ||
    publicMode === "live" ||
    publicMode === "composite";
  const canConnectAis = aisstreamEnabled && apiKey.length > 0 && liveRequested;

  const effectiveMode: MaritimeDataMode = !liveRequested
    ? "sample"
    : canConnectAis
      ? mode === "sample"
        ? publicMode === "sample"
          ? "composite"
          : publicMode
        : mode
      : "sample";

  return {
    mode,
    publicMode,
    aisstreamEnabled,
    apiKey,
    bboxes,
    pollIntervalMs,
    diagnosticsEnabled,
    liveRequested,
    canConnectAis,
    effectiveMode,
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * AISSTREAM_BBOXES format (JSON):
 * [[[swLat, swLon],[neLat, neLon]], ...]
 * Matching AISStream BoundingBoxes subscription shape.
 */
export function parseBboxes(raw: string | undefined): BoundingBox[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const boxes: BoundingBox[] = [];
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [a, b] = entry;
      if (!isLatLonPair(a) || !isLatLonPair(b)) continue;
      boxes.push({ sw: [a[0], a[1]], ne: [b[0], b[1]] });
    }
    return boxes.length > 0 ? boxes : null;
  } catch {
    return null;
  }
}

function isLatLonPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

export function bboxToAisStreamCorners(box: BoundingBox): [[number, number], [number, number]] {
  return [box.sw, box.ne];
}

export function connectionStateLabel(state: AisFeedConnectionState): string {
  return state;
}
