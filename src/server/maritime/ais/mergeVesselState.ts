import type { VesselStatus } from "@/domain/models";
import {
  normalizeDestinationDisplay,
  normalizeDestinationRaw,
} from "../normalize/destination";
import {
  isUsableAisPosition,
  isValidCourseDegrees,
  isValidHeadingDegrees,
  isValidSpeedKnots,
  sanitizeCallsign,
  sanitizeImo,
  sanitizeShipName,
} from "../normalize/position";
import {
  cargoCategoryForVesselType,
  flagFromMmsi,
  normalizeAisShipType,
} from "../normalize/vesselType";
import type { VesselState } from "./vesselState";
import { createEmptyVesselState } from "./vesselState";

export interface PositionUpdate {
  mmsi: string;
  latitude: number;
  longitude: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: number;
  shipNameHint?: string;
  receivedAt: string;
}

export interface StaticUpdate {
  mmsi: string;
  name?: string;
  imo?: string | number;
  callsign?: string;
  aisShipType?: number;
  destination?: string;
  eta?: { month: number; day: number; hour: number; minute: number };
  draught?: number;
  dimension?: { a: number; b: number; c: number; d: number };
  receivedAt: string;
}

export function applyPositionUpdate(
  existing: VesselState | undefined,
  update: PositionUpdate,
): VesselState | null {
  if (!isUsableAisPosition(update.latitude, update.longitude)) return null;

  const state = existing ?? createEmptyVesselState(update.mmsi);
  state.latitude = update.latitude;
  state.longitude = update.longitude;
  state.lastPositionAt = update.receivedAt;
  state.lastUpdated = update.receivedAt;
  state.positionMessageCount += 1;
  state.source = "AISSTREAM";
  state.flag = state.flag ?? flagFromMmsi(update.mmsi);

  if (update.sog !== undefined && isValidSpeedKnots(update.sog)) {
    state.speedOverGround = update.sog;
  }
  if (update.cog !== undefined && isValidCourseDegrees(update.cog)) {
    state.courseOverGround = update.cog;
  }
  if (update.heading !== undefined && isValidHeadingDegrees(update.heading)) {
    state.heading = update.heading;
  }
  if (update.navStatus !== undefined && Number.isFinite(update.navStatus)) {
    state.navStatusCode = Math.trunc(update.navStatus);
  }

  const hint = sanitizeShipName(update.shipNameHint);
  if (hint && !state.name) state.name = hint;

  return state;
}

export function applyStaticUpdate(
  existing: VesselState | undefined,
  update: StaticUpdate,
): VesselState {
  const state = existing ?? createEmptyVesselState(update.mmsi);
  state.lastStaticAt = update.receivedAt;
  state.lastUpdated = update.receivedAt;
  state.staticMessageCount += 1;
  state.source = "AISSTREAM";
  state.flag = state.flag ?? flagFromMmsi(update.mmsi);

  const name = sanitizeShipName(update.name);
  if (name) state.name = name;

  const imo = sanitizeImo(update.imo);
  if (imo) state.imo = imo;

  const callsign = sanitizeCallsign(update.callsign);
  if (callsign) state.callsign = callsign;

  if (update.aisShipType !== undefined && Number.isFinite(update.aisShipType)) {
    state.aisShipType = Math.trunc(update.aisShipType);
    state.normalizedVesselType = normalizeAisShipType(state.aisShipType);
  }

  const dest = normalizeDestinationRaw(update.destination);
  if (dest) {
    state.destinationRaw = dest;
    state.destinationNormalized = normalizeDestinationDisplay(dest);
  }

  const etaIso = parseAisEta(update.eta, update.receivedAt);
  if (etaIso) state.etaIso = etaIso;

  if (
    update.draught !== undefined &&
    Number.isFinite(update.draught) &&
    update.draught > 0 &&
    update.draught < 50
  ) {
    state.draughtMeters = update.draught;
  }

  if (update.dimension) {
    const { a, b, c, d } = update.dimension;
    if ([a, b, c, d].every((v) => Number.isFinite(v) && v >= 0)) {
      const length = a + b;
      const beam = c + d;
      if (length > 0 && length < 500) state.lengthMeters = length;
      if (beam > 0 && beam < 100) state.beamMeters = beam;
    }
  }

  return state;
}

/**
 * AIS ETA has no year. Use receivedAt's year; if month/day already passed by > ~30d
 * relative to a simple calendar check, bump year. Invalid components → undefined.
 */
export function parseAisEta(
  eta: StaticUpdate["eta"] | undefined,
  receivedAtIso: string,
): string | undefined {
  if (!eta) return undefined;
  const { month, day, hour, minute } = eta;
  if (
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return undefined;
  }
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  if (hour < 0 || hour > 23) return undefined;
  if (minute < 0 || minute > 59) return undefined;
  // AIS sentinels often use 0 / 24
  if (hour === 24) return undefined;

  const received = new Date(receivedAtIso);
  if (!Number.isFinite(received.getTime())) return undefined;

  let year = received.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (!Number.isFinite(candidate.getTime())) return undefined;

  // If ETA is more than ~1 day in the past, assume next year
  if (candidate.getTime() < received.getTime() - 24 * 60 * 60 * 1000) {
    year += 1;
    candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (!Number.isFinite(candidate.getTime())) return undefined;
  }

  // Reject absurd ETAs > 1 year ahead
  if (candidate.getTime() - received.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return undefined;
  }

  return candidate.toISOString();
}

export function navStatusToVesselStatus(code: number | undefined): VesselStatus {
  if (code === undefined) return "unknown";
  switch (code) {
    case 0:
      return "underway";
    case 1:
      return "at_anchor";
    case 5:
      return "moored";
    case 2:
    case 3:
    case 4:
    case 6:
    case 7:
    case 8:
      return "underway";
    default:
      return "unknown";
  }
}

export function navStatusLabel(code: number | undefined): string | undefined {
  if (code === undefined) return undefined;
  const labels: Record<number, string> = {
    0: "Under way using engine",
    1: "At anchor",
    2: "Not under command",
    3: "Restricted manoeuvrability",
    4: "Constrained by draught",
    5: "Moored",
    6: "Aground",
    7: "Engaged in fishing",
    8: "Under way sailing",
    15: "Not defined",
  };
  return labels[code] ?? `Nav status ${code}`;
}

export { cargoCategoryForVesselType };
