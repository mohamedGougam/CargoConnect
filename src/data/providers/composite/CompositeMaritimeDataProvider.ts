import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import type { MaritimeDataProvider, MaritimeViewportQuery } from "../types";
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

  async getVessels(options?: MaritimeViewportQuery): Promise<Vessel[]> {
    try {
      return await this.live.getVessels(options);
    } catch {
      return this.sample.getVessels(options);
    }
  }

  async getPorts(options?: MaritimeViewportQuery): Promise<Port[]> {
    try {
      const ports = await this.live.getPorts(options);
      if (ports.length > 0) return ports;
    } catch {
      /* use sample */
    }
    return this.sample.getPorts(options);
  }

  async getRoutes(): Promise<MaritimeRoute[]> {
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
