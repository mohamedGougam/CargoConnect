import type { FeatureCollection, LineString, Point } from "geojson";
import type { GeoPoint, MaritimeRoute, Port, Vessel, VesselType } from "@/domain/models";
import type { MaritimeCorridor } from "@/domain/search/types";
import { vesselIconId } from "@/lib/map/vesselIcons";

export function vesselsToGeoJSON(
  vessels: Vessel[],
  options?: { relevantIds?: Set<string>; searchActive?: boolean },
): FeatureCollection<
  Point,
  {
    id: string;
    name: string;
    course: number;
    status: string;
    type: VesselType;
    icon: string;
    relevant: number;
    muted: number;
  }
> {
  const relevantIds = options?.relevantIds;
  const searchActive = Boolean(options?.searchActive && relevantIds && relevantIds.size >= 0);

  return {
    type: "FeatureCollection",
    features: vessels.map((vessel) => {
      const relevant = searchActive && relevantIds?.has(vessel.id) ? 1 : 0;
      const muted = searchActive && !relevant ? 1 : 0;
      return {
        type: "Feature" as const,
        id: vessel.id,
        properties: {
          id: vessel.id,
          name: vessel.name,
          course: vessel.course ?? 0,
          status: vessel.status,
          type: vessel.type,
          icon: vesselIconId(vessel.type),
          relevant,
          muted,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [vessel.position.longitude, vessel.position.latitude],
        },
      };
    }),
  };
}

export function portsToGeoJSON(
  ports: Port[],
  options?: {
    originId?: string;
    destinationId?: string;
    /** Alternate destination candidates (subtle markers). */
    candidateIds?: string[];
    /** Candidate currently highlighted from the switcher hover. */
    highlightCandidateId?: string | null;
  },
): FeatureCollection<
  Point,
  { id: string; name: string; major: boolean; role: string }
> {
  const candidates = new Set(options?.candidateIds ?? []);
  return {
    type: "FeatureCollection",
    features: ports.map((port) => {
      let role = "normal";
      if (options?.originId && port.id === options.originId) role = "origin";
      else if (options?.destinationId && port.id === options.destinationId) {
        role = "destination";
      } else if (
        options?.highlightCandidateId &&
        port.id === options.highlightCandidateId
      ) {
        role = "candidate_hover";
      } else if (candidates.has(port.id)) {
        role = "candidate";
      }
      return {
        type: "Feature" as const,
        id: port.id,
        properties: {
          id: port.id,
          name: port.name,
          major: true,
          role,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [port.position.longitude, port.position.latitude],
        },
      };
    }),
  };
}

export function routesToGeoJSON(
  routes: MaritimeRoute[],
): FeatureCollection<LineString, { id: string }> {
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      id: route.id,
      properties: { id: route.id },
      geometry: {
        type: "LineString",
        coordinates: route.waypoints.map((p) => [p.longitude, p.latitude]),
      },
    })),
  };
}

export function corridorToGeoJSON(
  corridor: MaritimeCorridor | undefined,
): FeatureCollection<LineString, { id: string; kind: string }> {
  if (!corridor) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: corridor.id,
        properties: { id: corridor.id, kind: corridor.kind },
        geometry: {
          type: "LineString",
          coordinates: corridor.waypoints.map((p) => [p.longitude, p.latitude]),
        },
      },
    ],
  };
}

export function interpolateAlongRoute(
  waypoints: GeoPoint[],
  t: number,
): GeoPoint & { course: number } {
  if (waypoints.length === 0) {
    return { longitude: 0, latitude: 0, course: 0 };
  }
  if (waypoints.length === 1) {
    return { ...waypoints[0], course: 0 };
  }

  const clamped = Math.max(0, Math.min(1, t));
  const total = waypoints.length - 1;
  const scaled = clamped * total;
  const i = Math.min(total - 1, Math.floor(scaled));
  const localT = scaled - i;
  const a = waypoints[i];
  const b = waypoints[i + 1];
  const longitude = a.longitude + (b.longitude - a.longitude) * localT;
  const latitude = a.latitude + (b.latitude - a.latitude) * localT;
  const dLon = b.longitude - a.longitude;
  const dLat = b.latitude - a.latitude;
  const bearing = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;

  return { longitude, latitude, course: bearing };
}
