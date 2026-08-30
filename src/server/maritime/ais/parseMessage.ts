import {
  isUsableAisPosition,
  isValidCourseDegrees,
  isValidHeadingDegrees,
  isValidSpeedKnots,
  sanitizeMmsi,
  sanitizeShipName,
} from "../normalize/position";
import type { PositionUpdate, StaticUpdate } from "./mergeVesselState";

export type ParsedAisMessage =
  | { kind: "position"; update: PositionUpdate }
  | { kind: "static"; update: StaticUpdate }
  | { kind: "ignore"; reason: string };

interface AisEnvelope {
  MessageType?: string;
  MetaData?: {
    MMSI?: number | string;
    ShipName?: string;
    Latitude?: number;
    Longitude?: number;
    time_utc?: string;
  };
  Message?: Record<string, unknown>;
}

/**
 * Parse one AISStream JSON envelope into a position or static update.
 * Never throws — invalid payloads return ignore.
 */
export function parseAisStreamMessage(
  raw: unknown,
  receivedAt: string = new Date().toISOString(),
): ParsedAisMessage {
  if (!raw || typeof raw !== "object") {
    return { kind: "ignore", reason: "non-object" };
  }

  const envelope = raw as AisEnvelope;
  const messageType = envelope.MessageType;
  if (!messageType || messageType === "SubscriptionConfirmation") {
    return { kind: "ignore", reason: "control" };
  }

  const message = envelope.Message ?? {};
  const meta = envelope.MetaData ?? {};

  if (
    messageType === "PositionReport" ||
    messageType === "StandardClassBPositionReport" ||
    messageType === "ExtendedClassBPositionReport" ||
    messageType === "LongRangeAisBroadcastMessage"
  ) {
    return parsePosition(messageType, message, meta, receivedAt);
  }

  if (messageType === "ShipStaticData" || messageType === "StaticDataReport") {
    return parseStatic(messageType, message, meta, receivedAt);
  }

  return { kind: "ignore", reason: `unsupported:${messageType}` };
}

function parsePosition(
  messageType: string,
  message: Record<string, unknown>,
  meta: AisEnvelope["MetaData"],
  receivedAt: string,
): ParsedAisMessage {
  const body = (message[messageType] ?? message.PositionReport ?? Object.values(message)[0]) as
    | Record<string, unknown>
    | undefined;
  if (!body || typeof body !== "object") {
    return { kind: "ignore", reason: "missing-position-body" };
  }

  const mmsi = sanitizeMmsi(body.UserID ?? meta?.MMSI);
  if (!mmsi) return { kind: "ignore", reason: "bad-mmsi" };

  const lat = numberOr(body.Latitude, meta?.Latitude);
  const lon = numberOr(body.Longitude, meta?.Longitude);
  if (lat === undefined || lon === undefined || !isUsableAisPosition(lat, lon)) {
    return { kind: "ignore", reason: "bad-position" };
  }

  const sog = numberOr(body.Sog);
  const cog = numberOr(body.Cog);
  const heading = numberOr(body.TrueHeading ?? body.Heading);
  const navStatus = numberOr(body.NavigationalStatus);

  const update: PositionUpdate = {
    mmsi,
    latitude: lat,
    longitude: lon,
    receivedAt,
    shipNameHint: sanitizeShipName(meta?.ShipName),
  };

  if (sog !== undefined && isValidSpeedKnots(sog)) update.sog = sog;
  if (cog !== undefined && isValidCourseDegrees(cog)) update.cog = cog;
  if (heading !== undefined && isValidHeadingDegrees(heading)) update.heading = heading;
  if (navStatus !== undefined) update.navStatus = navStatus;

  return { kind: "position", update };
}

function parseStatic(
  messageType: string,
  message: Record<string, unknown>,
  meta: AisEnvelope["MetaData"],
  receivedAt: string,
): ParsedAisMessage {
  const body = (message[messageType] ?? message.ShipStaticData ?? Object.values(message)[0]) as
    | Record<string, unknown>
    | undefined;
  if (!body || typeof body !== "object") {
    return { kind: "ignore", reason: "missing-static-body" };
  }

  const mmsi = sanitizeMmsi(body.UserID ?? meta?.MMSI);
  if (!mmsi) return { kind: "ignore", reason: "bad-mmsi" };

  const dim = body.Dimension as Record<string, number> | undefined;
  const eta = body.Eta as Record<string, number> | undefined;

  const update: StaticUpdate = {
    mmsi,
    receivedAt,
    name: typeof body.Name === "string" ? body.Name : undefined,
    imo: numberOr(body.ImoNumber),
    callsign: typeof body.CallSign === "string" ? body.CallSign : undefined,
    aisShipType: numberOr(body.Type ?? body.ShipType),
    destination: typeof body.Destination === "string" ? body.Destination : undefined,
    draught: numberOr(body.MaximumStaticDraught),
  };

  if (dim && typeof dim === "object") {
    update.dimension = {
      a: Number(dim.A) || 0,
      b: Number(dim.B) || 0,
      c: Number(dim.C) || 0,
      d: Number(dim.D) || 0,
    };
  }

  if (eta && typeof eta === "object") {
    update.eta = {
      month: Number(eta.Month) || 0,
      day: Number(eta.Day) || 0,
      hour: Number(eta.Hour) || 0,
      minute: Number(eta.Minute) || 0,
    };
  }

  return { kind: "static", update };
}

function numberOr(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}
