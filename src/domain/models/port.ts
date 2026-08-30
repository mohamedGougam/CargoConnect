import type { GeoPoint } from "./geo";
import type { DataSourceKind } from "./provenance";

export type PortType =
  | "seaport"
  | "container_terminal"
  | "bulk_terminal"
  | "multipurpose"
  | "oil_terminal";

/**
 * Canonical port domain model.
 * UI and map layers consume this shape; data sources map into it.
 */
export interface Port {
  id: string;
  name: string;
  country: string;
  locationLabel: string;
  type: PortType;
  position: GeoPoint;
  unlocode?: string;
  wpiNumber?: string;
  specifications?: PortSpecifications;
  capabilities?: PortCapabilities;
  contacts?: PortContact[];
  meta?: PortMeta;
}

export interface PortMeta {
  sources: DataSourceKind[];
  importedAt?: string;
}

export interface PortSpecifications {
  maxDraftMeters?: number;
  berthCount?: number;
  channelDepthMeters?: number;
  anchorageDepthMeters?: number;
  cargoPierDepthMeters?: number;
  harborSize?: string;
  harborType?: string;
  totalAreaHectares?: number;
}

export interface PortCapabilities {
  cargoTypes?: string[];
  loadingEquipment?: string[];
  shippingLines?: string[];
  canLoad?: boolean;
  canUnload?: boolean;
}

export interface PortContact {
  role: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface PortPreview {
  id: string;
  name: string;
  country: string;
  locationLabel: string;
  type: PortType;
}
