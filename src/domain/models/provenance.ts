/** Provenance tags for licensing, attribution, and debugging. */
export type DataSourceKind =
  | "SAMPLE"
  | "AISSTREAM"
  | "NGA_WPI"
  | "UN_LOCODE"
  | "CURATED_MAJOR"
  | "COMPOSITE";

export type VesselFreshness = "live" | "stale" | "very_stale";

export type AisFeedConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error"
  | "disabled";
