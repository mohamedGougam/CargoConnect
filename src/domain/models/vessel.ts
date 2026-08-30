import type { GeoPoint } from "./geo";
import type { DataSourceKind, VesselFreshness } from "./provenance";

/**
 * CargoConnect vessel categories.
 * AIS ship-type codes are coarse — unknown stays unknown; do not invent precision.
 */
export type VesselType =
  | "general_cargo"
  | "bulk_carrier"
  | "container"
  | "tanker"
  | "ro_ro"
  | "multipurpose"
  | "passenger"
  | "tug_service"
  | "fishing"
  | "pleasure"
  | "other"
  | "unknown";

export type VesselStatus = "underway" | "at_anchor" | "moored" | "unknown";

/**
 * Canonical vessel domain model.
 * UI consumes this shape; live AIS maps into it after normalization.
 */
export interface Vessel {
  id: string;
  name: string;
  imo?: string;
  mmsi?: string;
  callsign?: string;
  type: VesselType;
  /** Coarse label for UI; never invent commercial capacity from AIS. */
  cargoCategory: string;
  flag?: string;
  position: GeoPoint;
  /** Degrees true north, 0–360. */
  course?: number;
  heading?: number;
  /** Knots. */
  speed?: number;
  navStatus?: string;
  originPortId?: string;
  destinationPortId?: string;
  /** Raw AIS destination after light cleanup. */
  destinationRaw?: string;
  eta?: string;
  status: VesselStatus;
  specifications?: VesselSpecifications;
  cargo?: VesselCargoInfo;
  /** Optional live-feed metadata (UI may ignore until styled). */
  meta?: VesselMeta;
}

export interface VesselMeta {
  source: DataSourceKind;
  sourceTimestamp: string;
  freshness: VesselFreshness;
  aisShipType?: number;
  dataQuality?: "live" | "partial" | "stale" | "demo";
}

export interface VesselSpecifications {
  lengthMeters?: number;
  beamMeters?: number;
  draftMeters?: number;
  grossTonnage?: number;
  deadweightTons?: number;
  yearBuilt?: number;
}

export interface VesselCargoInfo {
  capacityTons?: number;
  capacityTeu?: number;
  currentCargoDescription?: string;
  availableCapacityTons?: number;
}

/** Fields safe to show in a hover preview. */
export interface VesselPreview {
  id: string;
  name: string;
  type: VesselType;
  cargoCategory: string;
  originLabel?: string;
  destinationLabel?: string;
  eta?: string;
  status: VesselStatus;
}
