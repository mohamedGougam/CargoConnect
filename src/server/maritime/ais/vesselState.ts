import type { DataSourceKind, VesselType } from "@/domain/models";

/** Internal MMSI-keyed vessel state (before UI mapping). */
export interface VesselState {
  mmsi: string;
  imo?: string;
  name?: string;
  callsign?: string;
  flag?: string;
  aisShipType?: number;
  normalizedVesselType: VesselType;
  latitude?: number;
  longitude?: number;
  speedOverGround?: number;
  courseOverGround?: number;
  heading?: number;
  navStatusCode?: number;
  destinationRaw?: string;
  destinationNormalized?: string;
  etaIso?: string;
  draughtMeters?: number;
  lengthMeters?: number;
  beamMeters?: number;
  source: DataSourceKind;
  lastPositionAt?: string;
  lastStaticAt?: string;
  lastUpdated: string;
  positionMessageCount: number;
  staticMessageCount: number;
}

export function createEmptyVesselState(mmsi: string): VesselState {
  const now = new Date().toISOString();
  return {
    mmsi,
    normalizedVesselType: "unknown",
    source: "AISSTREAM",
    lastUpdated: now,
    positionMessageCount: 0,
    staticMessageCount: 0,
  };
}
