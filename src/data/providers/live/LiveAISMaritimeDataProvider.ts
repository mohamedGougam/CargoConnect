import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import type { MaritimeDataProvider, MaritimeViewportQuery } from "../types";
import { LIVE_PROTOTYPE_STATUS_LABEL } from "../types";

interface VesselsApiResponse {
  vessels: Vessel[];
  mode?: string;
  fallback?: boolean;
  statusLabel?: string;
}

interface PortsApiResponse {
  ports: Port[];
}

/**
 * Client provider that polls CargoConnect internal maritime APIs.
 * Does NOT connect to AISStream — ingestion is server-side only.
 * Passes viewport bbox so the server can drive AIS subscriptions.
 */
export class LiveAISMaritimeDataProvider implements MaritimeDataProvider {
  readonly id = "live_ais";
  readonly isDemonstrationData = false;
  readonly statusLabel = LIVE_PROTOTYPE_STATUS_LABEL;

  constructor(private readonly baseUrl = "") {}

  async getVessels(options?: MaritimeViewportQuery): Promise<Vessel[]> {
    const qs = buildViewportQuery(options);
    const res = await fetch(`${this.baseUrl}/api/maritime/vessels${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to load vessels (${res.status})`);
    }
    const data = (await res.json()) as VesselsApiResponse;
    if (data.fallback) {
      throw new Error("LIVE_FALLBACK_TO_SAMPLE");
    }
    return data.vessels ?? [];
  }

  async getPorts(options?: MaritimeViewportQuery): Promise<Port[]> {
    const qs = buildViewportQuery(options);
    const res = await fetch(`${this.baseUrl}/api/maritime/ports${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to load ports (${res.status})`);
    }
    const data = (await res.json()) as PortsApiResponse;
    return data.ports ?? [];
  }

  async getRoutes(): Promise<MaritimeRoute[]> {
    return [];
  }

  async getVesselById(id: string): Promise<Vessel | null> {
    const vessels = await this.getVessels();
    return vessels.find((v) => v.id === id) ?? null;
  }

  async getPortById(id: string): Promise<Port | null> {
    const ports = await this.getPorts();
    return ports.find((p) => p.id === id) ?? null;
  }
}

function buildViewportQuery(options?: MaritimeViewportQuery): string {
  if (!options) return "";
  const params = new URLSearchParams();
  if (
    options.minLon !== undefined &&
    options.minLat !== undefined &&
    options.maxLon !== undefined &&
    options.maxLat !== undefined
  ) {
    params.set(
      "bbox",
      `${options.minLon},${options.minLat},${options.maxLon},${options.maxLat}`,
    );
  }
  if (options.zoom !== undefined) params.set("zoom", String(options.zoom));
  const s = params.toString();
  return s ? `?${s}` : "";
}
