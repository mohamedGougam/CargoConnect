import type { AisFeedConnectionState, Vessel } from "@/domain/models";
import { getMaritimeServerConfig, type BoundingBox } from "../config";
import {
  pointInBounds,
  type LngLatBounds,
} from "../geo/bbox";
import { regionOverlapping } from "../geo/regions";
import { shouldIncludeInSnapshot } from "../normalize/freshness";
import { getVesselStateStore, type VesselStateStore } from "../store/VesselStateStore";
import { AISStreamClient } from "./AISStreamClient";
import { applyPositionUpdate, applyStaticUpdate } from "./mergeVesselState";
import { parseAisStreamMessage } from "./parseMessage";
import { vesselStateToUiVessel } from "./toUiVessel";
import {
  getViewportSubscriptionManager,
} from "./ViewportSubscriptionManager";

export interface AisIngestDiagnostics {
  connectionState: AisFeedConnectionState;
  enabled: boolean;
  vesselsInCache: number;
  vesselsWithPosition: number;
  vesselsWithName: number;
  uniqueMmsis: number;
  messagesReceived: number;
  positionMessages: number;
  staticMessages: number;
  ignoredMessages: number;
  lastMessageAt: string | null;
  lastError: string | null;
  startedAt: string | null;
  bboxes: BoundingBox[];
  regionNote: string;
  subscription: ReturnType<
    ReturnType<typeof getViewportSubscriptionManager>["getDiagnostics"]
  >;
  reconnectHint: string;
}

interface IngestRuntime {
  client: AISStreamClient | null;
  connectionState: AisFeedConnectionState;
  messagesReceived: number;
  positionMessages: number;
  staticMessages: number;
  ignoredMessages: number;
  lastMessageAt: string | null;
  lastError: string | null;
  startedAt: string | null;
  ensurePromise: Promise<void> | null;
}

const globalForIngest = globalThis as unknown as {
  __ccAisIngest?: IngestRuntime;
};

function getRuntime(): IngestRuntime {
  if (!globalForIngest.__ccAisIngest) {
    globalForIngest.__ccAisIngest = {
      client: null,
      connectionState: "idle",
      messagesReceived: 0,
      positionMessages: 0,
      staticMessages: 0,
      ignoredMessages: 0,
      lastMessageAt: null,
      lastError: null,
      startedAt: null,
      ensurePromise: null,
    };
  }
  return globalForIngest.__ccAisIngest;
}

/**
 * Start AISStream ingest once per process when configured.
 * Uses viewport subscription manager (seed regions + live viewports).
 */
export async function ensureAisIngestStarted(): Promise<void> {
  const runtime = getRuntime();
  if (runtime.ensurePromise) return runtime.ensurePromise;

  runtime.ensurePromise = Promise.resolve().then(() => {
    const config = getMaritimeServerConfig();
    if (!config.canConnectAis) {
      runtime.connectionState = "disabled";
      console.info(
        "[AISStream] ingest not started (need MARITIME_DATA_MODE=live|composite, AISSTREAM_ENABLED=true, AISSTREAM_API_KEY)",
      );
      return;
    }
    if (runtime.client) return;

    const store = getVesselStateStore();
    const mgr = getViewportSubscriptionManager();
    const initialBoxes = mgr.bootstrap();

    runtime.startedAt = new Date().toISOString();
    runtime.client = new AISStreamClient({
      apiKey: config.apiKey,
      bboxes: initialBoxes.length > 0 ? initialBoxes : config.bboxes,
      onStateChange: (state, detail) => {
        runtime.connectionState = state;
        if (state === "error" && detail) runtime.lastError = detail;
      },
      onMessage: (data) => {
        handleIncomingMessage(store, runtime, data);
      },
    });

    mgr.setApplyHandler((boxes) => {
      runtime.client?.updateSubscription(boxes);
    });

    runtime.client.start();
  });

  return runtime.ensurePromise;
}

/**
 * Register a map viewport so AIS subscription follows exploration.
 * Safe to call frequently — manager debounces.
 */
export function registerAisViewportInterest(input: {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}): void {
  getViewportSubscriptionManager().registerViewport(input);
}

function handleIncomingMessage(
  store: VesselStateStore,
  runtime: IngestRuntime,
  data: unknown,
): void {
  runtime.messagesReceived += 1;
  const receivedAt = new Date().toISOString();
  runtime.lastMessageAt = receivedAt;

  const parsed = parseAisStreamMessage(data, receivedAt);
  if (parsed.kind === "ignore") {
    runtime.ignoredMessages += 1;
    return;
  }

  if (parsed.kind === "position") {
    const next = applyPositionUpdate(store.get(parsed.update.mmsi), parsed.update);
    if (!next) {
      runtime.ignoredMessages += 1;
      return;
    }
    store.upsert(next);
    runtime.positionMessages += 1;
    return;
  }

  if (parsed.kind === "static") {
    const next = applyStaticUpdate(store.get(parsed.update.mmsi), parsed.update);
    store.upsert(next);
    runtime.staticMessages += 1;
  }
}

export function getAisIngestDiagnostics(): AisIngestDiagnostics {
  const runtime = getRuntime();
  const config = getMaritimeServerConfig();
  const store = getVesselStateStore();
  store.prune?.();
  const list = store.list();
  const withPosition = list.filter(
    (v) => v.latitude !== undefined && v.longitude !== undefined && v.lastPositionAt,
  );
  const withName = list.filter((v) => Boolean(v.name?.trim()));
  const mgr = getViewportSubscriptionManager();
  const sub = mgr.getDiagnostics();
  const active = mgr.getActiveBoxes();
  const regionLabels = active
    .flatMap((b) => regionOverlapping(b).map((r) => r.label))
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    connectionState: runtime.connectionState,
    enabled: config.canConnectAis,
    vesselsInCache: list.length,
    vesselsWithPosition: withPosition.length,
    vesselsWithName: withName.length,
    uniqueMmsis: list.length,
    messagesReceived: runtime.messagesReceived,
    positionMessages: runtime.positionMessages,
    staticMessages: runtime.staticMessages,
    ignoredMessages: runtime.ignoredMessages,
    lastMessageAt: runtime.lastMessageAt,
    lastError: runtime.lastError,
    startedAt: runtime.startedAt,
    bboxes: active,
    regionNote:
      regionLabels.length > 0
        ? `Active coverage regions (development AIS): ${regionLabels.join(", ")}. Viewport-driven — not complete global AIS.`
        : "Viewport-driven development AIS. Seed: Eastern Med + North Sea + Mediterranean. Not complete worldwide coverage.",
    subscription: sub,
    reconnectHint: "Exponential backoff on disconnect; subscription updates reuse the open socket.",
  };
}

export interface VesselSnapshotQuery {
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  zoom?: number;
  freshness?: "live" | "stale" | "very_stale" | "all";
  includeVeryStale?: boolean;
  /** Hard cap for browser payloads. */
  limit?: number;
}

const DEFAULT_VESSEL_LIMIT = 1_200;
const WORLD_VIEW_LIMIT = 400;

export function getVesselSnapshot(query: VesselSnapshotQuery = {}): Vessel[] {
  const now = Date.now();
  const store = getVesselStateStore();
  const vessels: Vessel[] = [];

  const hasBbox =
    query.minLat !== undefined &&
    query.maxLat !== undefined &&
    query.minLon !== undefined &&
    query.maxLon !== undefined;

  const bounds: LngLatBounds | null = hasBbox
    ? {
        west: query.minLon!,
        south: query.minLat!,
        east: query.maxLon!,
        north: query.maxLat!,
      }
    : null;

  const zoom = query.zoom ?? 5;
  const limit =
    query.limit ??
    (zoom < 3.5 ? WORLD_VIEW_LIMIT : DEFAULT_VESSEL_LIMIT);

  for (const state of store.list()) {
    if (!query.includeVeryStale && !shouldIncludeInSnapshot(state.lastPositionAt, now)) {
      continue;
    }
    const ui = vesselStateToUiVessel(state, now);
    if (!ui) continue;

    if (query.freshness && query.freshness !== "all") {
      if (ui.meta?.freshness !== query.freshness) continue;
    }

    if (bounds) {
      const { latitude, longitude } = ui.position;
      if (!pointInBounds(latitude, longitude, bounds)) continue;
    }

    vessels.push(ui);
    if (vessels.length >= limit) break;
  }

  return vessels;
}
