import { NextResponse } from "next/server";
import { SAMPLE_VESSELS } from "@/data/providers/sample/sample-vessels";
import { SAMPLE_STATUS_LABEL, LIVE_PROTOTYPE_STATUS_LABEL } from "@/data/providers/types";
import { getMaritimeServerConfig } from "@/server/maritime/config";
import {
  ensureAisIngestStarted,
  getVesselSnapshot,
} from "@/server/maritime/ais/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/maritime/vessels
 * Normalized vessel snapshot. Never returns raw AIS or secrets.
 */
export async function GET(request: Request) {
  const config = getMaritimeServerConfig();
  const url = new URL(request.url);

  const minLat = optionalNumber(url.searchParams.get("minLat"));
  const maxLat = optionalNumber(url.searchParams.get("maxLat"));
  const minLon = optionalNumber(url.searchParams.get("minLon"));
  const maxLon = optionalNumber(url.searchParams.get("maxLon"));
  const freshness = url.searchParams.get("freshness") as
    | "live"
    | "stale"
    | "very_stale"
    | "all"
    | null;

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

  const vessels = getVesselSnapshot({
    minLat: minLat ?? undefined,
    maxLat: maxLat ?? undefined,
    minLon: minLon ?? undefined,
    maxLon: maxLon ?? undefined,
    freshness: freshness ?? "all",
  });

  return NextResponse.json({
    mode: config.mode,
    fallback: false,
    statusLabel: LIVE_PROTOTYPE_STATUS_LABEL,
    vessels,
    count: vessels.length,
  });
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
