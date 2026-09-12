import type { MaritimeRoute, Port, Vessel } from "@/domain/models";

/**
 * Abstraction over maritime data sources.
 * UI and map layers depend only on this interface — never on sample/API details.
 */
export interface MaritimeDataProvider {
  readonly id: string;
  /** True when data is temporary/demo and must not be presented as live AIS. */
  readonly isDemonstrationData: boolean;
  /**
   * User-facing provenance line for the map badge.
   * Must never claim commercial licensing for AISStream prototype feeds.
   */
  readonly statusLabel: string;
  getVessels(options?: MaritimeViewportQuery): Promise<Vessel[]>;
  getPorts(options?: MaritimeViewportQuery): Promise<Port[]>;
  getRoutes(): Promise<MaritimeRoute[]>;
  getVesselById(id: string): Promise<Vessel | null>;
  getPortById(id: string): Promise<Port | null>;
}

/** Optional viewport / zoom filters for global exploration. */
export interface MaritimeViewportQuery {
  minLat?: number;
  maxLat?: number;
  minLon?: number;
  maxLon?: number;
  zoom?: number;
}

export type DataProviderKind = "sample" | "live" | "composite";

export const SAMPLE_STATUS_LABEL = "Demonstration data · not live AIS";
export const LIVE_PROTOTYPE_STATUS_LABEL =
  "Global maritime view · development AIS feed";
export const COMPOSITE_STATUS_LABEL =
  "Global maritime view · development AIS feed";
