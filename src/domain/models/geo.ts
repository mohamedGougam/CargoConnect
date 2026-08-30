/** Geographic coordinate in WGS84. */
export interface GeoPoint {
  longitude: number;
  latitude: number;
}

/** Lightweight route geometry between two maritime points. */
export interface MaritimeRoute {
  id: string;
  originPortId: string;
  destinationPortId: string;
  /** Ordered waypoints including origin and destination. */
  waypoints: GeoPoint[];
}
