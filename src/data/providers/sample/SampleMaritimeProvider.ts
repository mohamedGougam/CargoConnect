import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import type { MaritimeDataProvider } from "../types";
import { SAMPLE_PORTS } from "./sample-ports";
import { SAMPLE_ROUTES, SAMPLE_VESSELS } from "./sample-vessels";
import { SAMPLE_STATUS_LABEL } from "../types";

/**
 * Temporary demonstration provider.
 * Swap out via `createMaritimeDataProvider()` without changing UI components.
 */
export class SampleMaritimeProvider implements MaritimeDataProvider {
  readonly id = "sample";
  readonly isDemonstrationData = true;
  readonly statusLabel = SAMPLE_STATUS_LABEL;

  async getVessels(): Promise<Vessel[]> {
    return structuredClone(SAMPLE_VESSELS);
  }

  async getPorts(): Promise<Port[]> {
    return structuredClone(SAMPLE_PORTS);
  }

  async getRoutes(): Promise<MaritimeRoute[]> {
    return structuredClone(SAMPLE_ROUTES);
  }

  async getVesselById(id: string): Promise<Vessel | null> {
    return structuredClone(SAMPLE_VESSELS.find((v) => v.id === id) ?? null);
  }

  async getPortById(id: string): Promise<Port | null> {
    return structuredClone(SAMPLE_PORTS.find((p) => p.id === id) ?? null);
  }
}
