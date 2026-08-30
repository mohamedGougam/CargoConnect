import { NextResponse } from "next/server";
import { SAMPLE_PORTS } from "@/data/providers/sample/sample-ports";
import { getMaritimeServerConfig } from "@/server/maritime/config";
import { listCatalogPorts } from "@/server/maritime/ports/PortCatalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/maritime/ports
 * Static catalog (WPI + UN/LOCODE) for live/composite; sample ports otherwise.
 */
export async function GET(request: Request) {
  const config = getMaritimeServerConfig();
  const url = new URL(request.url);
  const minLat = optionalNumber(url.searchParams.get("minLat"));
  const maxLat = optionalNumber(url.searchParams.get("maxLat"));
  const minLon = optionalNumber(url.searchParams.get("minLon"));
  const maxLon = optionalNumber(url.searchParams.get("maxLon"));

  const useCatalog =
    config.mode === "live" ||
    config.mode === "composite" ||
    config.publicMode === "live" ||
    config.publicMode === "composite";

  if (!useCatalog) {
    return NextResponse.json({
      mode: "sample",
      ports: structuredClone(SAMPLE_PORTS),
      source: "SAMPLE",
    });
  }

  const ports = listCatalogPorts({
    minLat,
    maxLat,
    minLon,
    maxLon,
  });

  return NextResponse.json({
    mode: config.mode,
    ports,
    count: ports.length,
    source: "NGA_WPI+UN_LOCODE",
    disclaimer:
      "Not for navigation. Port data from NGA World Port Index and UN/LOCODE.",
  });
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
