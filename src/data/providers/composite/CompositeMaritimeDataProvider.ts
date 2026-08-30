import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import type { MaritimeDataProvider } from "../types";
import { COMPOSITE_STATUS_LABEL } from "../types";
import { LiveAISMaritimeDataProvider } from "../live/LiveAISMaritimeDataProvider";
import { SampleMaritimeProvider } from "../sample/SampleMaritimeProvider";

/**
 * Live AIS vessels + static port catalog (via API).
 * Falls back to sample vessels if the live API signals fallback / fails hard.
 */
export class CompositeMaritimeDataProvider implements MaritimeDataProvider {
  readonly id = "composite";
  readonly isDemonstrationData = false;
  readonly statusLabel = COMPOSITE_STATUS_LABEL;

  private readonly live = new LiveAISMaritimeDataProvider();
  private readonly sample = new SampleMaritimeProvider();

  async getVessels(): Promise<Vessel[]> {
    try {
      return await this.live.getVessels();
    } catch {
      return this.sample.getVessels();
    }
  }

  async getPorts(): Promise<Port[]> {
    try {
      const ports = await this.live.getPorts();
      if (ports.length > 0) return ports;
    } catch {
      /* use sample */
    }
    return this.sample.getPorts();
  }

  async getRoutes(): Promise<MaritimeRoute[]> {
    // Prefer empty live routes; sample routes only when vessels fell back.
    try {
      const vessels = await this.live.getVessels();
      if (vessels.length > 0) return [];
    } catch {
      return this.sample.getRoutes();
    }
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
