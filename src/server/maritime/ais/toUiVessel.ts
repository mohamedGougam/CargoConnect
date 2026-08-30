import type { Vessel } from "@/domain/models";
import { classifyFreshness } from "../normalize/freshness";
import { cargoCategoryForVesselType } from "../normalize/vesselType";
import type { VesselState } from "./vesselState";
import { navStatusLabel, navStatusToVesselStatus } from "./mergeVesselState";

/** Map internal vessel state → UI-facing Vessel. Requires a known position. */
export function vesselStateToUiVessel(
  state: VesselState,
  nowMs: number = Date.now(),
): Vessel | null {
  if (
    state.latitude === undefined ||
    state.longitude === undefined ||
    !state.lastPositionAt
  ) {
    return null;
  }

  const freshness = classifyFreshness(state.lastPositionAt, nowMs);
  const type = state.normalizedVesselType;
  const name = state.name?.trim() || `MMSI ${state.mmsi}`;

  const specs =
    state.lengthMeters || state.beamMeters || state.draughtMeters
      ? {
          lengthMeters: state.lengthMeters,
          beamMeters: state.beamMeters,
          draftMeters: state.draughtMeters,
        }
      : undefined;

  return {
    id: `mmsi:${state.mmsi}`,
    name,
    mmsi: state.mmsi,
    imo: state.imo,
    callsign: state.callsign,
    type,
    cargoCategory: cargoCategoryForVesselType(type),
    flag: state.flag,
    position: {
      latitude: state.latitude,
      longitude: state.longitude,
    },
    course: state.courseOverGround,
    heading: state.heading,
    speed: state.speedOverGround,
    navStatus: navStatusLabel(state.navStatusCode),
    destinationRaw: state.destinationRaw,
    eta: state.etaIso,
    status: navStatusToVesselStatus(state.navStatusCode),
    specifications: specs,
    meta: {
      source: state.source,
      sourceTimestamp: state.lastPositionAt,
      freshness,
      aisShipType: state.aisShipType,
      dataQuality:
        freshness === "live"
          ? state.name
            ? "live"
            : "partial"
          : freshness === "stale"
            ? "stale"
            : "stale",
    },
  };
}
