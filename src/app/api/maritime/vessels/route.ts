import { NextResponse } from "next/server";
import { SAMPLE_VESSELS } from "@/data/providers/sample/sample-vessels";
import { SAMPLE_STATUS_LABEL, LIVE_PROTOTYPE_STATUS_LABEL } from "@/data/providers/types";
import { getMaritimeServerConfig } from "@/server/maritime/config";
import {
  ensureAisIngestStarted,
  getVesselSnapshot,
  registerAisViewportInterest,
} from "@/server/maritime/ais/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/maritime/vessels
 * Normalized vessel snapshot. Never returns raw AIS or secrets.
 *
 * Query:
 * - bbox=minLon,minLat,maxLon,maxLat  (preferred)
 * - or minLat,maxLat,minLon,maxLon
 * - zoom (optional) — caps payload / world-view density
 * - freshness=live|stale|very_stale|all
 */
export async function GET(request: Request) {
  const config = getMaritimeServerConfig();
  const url = new URL(request.url);

  const bboxParam = url.searchParams.get("bbox");
  let minLat = optionalNumber(url.searchParams.get("minLat"));
  let maxLat = optionalNumber(url.searchParams.get("maxLat"));
  let minLon = optionalNumber(url.searchParams.get("minLon"));
  let maxLon = optionalNumber(url.searchParams.get("maxLon"));
  const zoom = optionalNumber(url.searchParams.get("zoom"));
  const freshness = url.searchParams.get("freshness") as
    | "live"
    | "stale"
    | "very_stale"
    | "all"
    | null;

  if (bboxParam) {
    const parts = bboxParam.split(",").map((p) => Number(p.trim()));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      minLon = parts[0];
      minLat = parts[1];
      maxLon = parts[2];
      maxLat = parts[3];
    } else {
      return NextResponse.json(
        { error: "Invalid bbox. Expected minLon,minLat,maxLon,maxLat" },
        { status: 400 },
      );
    }
  }

  if (
    minLat !== undefined ||
    maxLat !== undefined ||
    minLon !== undefined ||
    maxLon !== undefined
  ) {
    if (
      minLat === undefined ||
      maxLat === undefined ||
      minLon === undefined ||
      maxLon === undefined
    ) {
      return NextResponse.json(
        { error: "Incomplete bbox — provide all of minLat,maxLat,minLon,maxLon or bbox=" },
        { status: 400 },
      );
    }
    if (minLat < -90 || maxLat > 90 || minLat >= maxLat) {
      return NextResponse.json({ error: "Invalid latitude range" }, { status: 400 });
    }
    if (minLon < -180 || maxLon > 180 || minLon < -180 || maxLon > 180) {
      return NextResponse.json({ error: "Invalid longitude range" }, { status: 400 });
    }
    // Huge bbox (near-global): allow query but register clipped subscription interest.
    const latSpan = maxLat - minLat;
    const lonSpan = minLon <= maxLon ? maxLon - minLon : 360 - minLon + maxLon;
    if (latSpan * lonSpan > 12_000) {
      return NextResponse.json(
        {
          error:
            "Viewport too large for vessel listing. Zoom in or use a smaller bbox.",
          code: "BBOX_TOO_LARGE",
        },
        { status: 400 },
      );
    }
  }

  if (!config.canConnectAis) {
    return NextResponse.json({
      mode: "sample",
      fallback: true,
      statusLabel: SAMPLE_STATUS_LABEL,
      vessels: structuredClone(SAMPLE_VESSELS),
      reason: "aisstream_not_configured",
    });
  }

  await ensureAisIngestStarted();

  if (
    minLat !== undefined &&
    maxLat !== undefined &&
    minLon !== undefined &&
    maxLon !== undefined
  ) {
    registerAisViewportInterest({
      west: minLon,
      south: minLat,
      east: maxLon,
      north: maxLat,
      zoom: zoom ?? 5,
    });
  }

  const vessels = getVesselSnapshot({
    minLat: minLat ?? undefined,
    maxLat: maxLat ?? undefined,
    minLon: minLon ?? undefined,
    maxLon: maxLon ?? undefined,
    zoom: zoom ?? undefined,
    freshness: freshness ?? "all",
  });

  return NextResponse.json({
    mode: config.mode,
    fallback: false,
    statusLabel: LIVE_PROTOTYPE_STATUS_LABEL,
    vessels,
    count: vessels.length,
    viewport: {
      minLat: minLat ?? null,
      maxLat: maxLat ?? null,
      minLon: minLon ?? null,
      maxLon: maxLon ?? null,
      zoom: zoom ?? null,
    },
  });
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
