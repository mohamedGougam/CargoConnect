import { NextResponse } from "next/server";
import { SAMPLE_PORTS } from "@/data/providers/sample/sample-ports";
import { getMaritimeServerConfig } from "@/server/maritime/config";
import { listCatalogPorts } from "@/server/maritime/ports/PortCatalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/maritime/ports
 * Global catalog (WPI/UNLOCODE eastern-med + curated majors) for live/composite.
 * Supports bbox + zoom density filtering.
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

  if (bboxParam) {
    const parts = bboxParam.split(",").map((p) => Number(p.trim()));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      minLon = parts[0];
      minLat = parts[1];
      maxLon = parts[2];
      maxLat = parts[3];
    }
  }

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
    zoom: zoom ?? undefined,
  });

  return NextResponse.json({
    mode: config.mode,
    ports,
    count: ports.length,
    source: "NGA_WPI+UN_LOCODE+CURATED_MAJOR",
    disclaimer:
      "Not for navigation. Port data from NGA World Port Index, UN/LOCODE, and curated major hubs. Not commercial marketplace coverage.",
  });
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
