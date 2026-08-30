import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import type { MaritimeDataProvider } from "../types";
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
 */
export class LiveAISMaritimeDataProvider implements MaritimeDataProvider {
  readonly id = "live_ais";
  readonly isDemonstrationData = false;
  readonly statusLabel = LIVE_PROTOTYPE_STATUS_LABEL;

  constructor(private readonly baseUrl = "") {}

  async getVessels(): Promise<Vessel[]> {
    const res = await fetch(`${this.baseUrl}/api/maritime/vessels`, {
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

  async getPorts(): Promise<Port[]> {
    const res = await fetch(`${this.baseUrl}/api/maritime/ports`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to load ports (${res.status})`);
    }
    const data = (await res.json()) as PortsApiResponse;
    return data.ports ?? [];
  }

  async getRoutes(): Promise<MaritimeRoute[]> {
    // Live prototype does not invent commercial routes from AIS.
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
