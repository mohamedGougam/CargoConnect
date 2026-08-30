import type { AisFeedConnectionState, Vessel } from "@/domain/models";
import { getMaritimeServerConfig, type BoundingBox } from "../config";
import {
  shouldIncludeInSnapshot,
} from "../normalize/freshness";
import { getVesselStateStore, type VesselStateStore } from "../store/VesselStateStore";
import { AISStreamClient } from "./AISStreamClient";
import { applyPositionUpdate, applyStaticUpdate } from "./mergeVesselState";
import { parseAisStreamMessage } from "./parseMessage";
import { vesselStateToUiVessel } from "./toUiVessel";

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
 * Safe no-op when disabled / missing key / sample mode.
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
    runtime.startedAt = new Date().toISOString();
    runtime.client = new AISStreamClient({
      apiKey: config.apiKey,
      bboxes: config.bboxes,
      onStateChange: (state, detail) => {
        runtime.connectionState = state;
        if (state === "error" && detail) runtime.lastError = detail;
      },
      onMessage: (data) => {
        handleIncomingMessage(store, runtime, data);
      },
    });
    runtime.client.start();
  });

  return runtime.ensurePromise;
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
  const list = getVesselStateStore().list();
  const withPosition = list.filter(
    (v) => v.latitude !== undefined && v.longitude !== undefined && v.lastPositionAt,
  );
  const withName = list.filter((v) => Boolean(v.name?.trim()));
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
    bboxes: config.bboxes,
    regionNote:
      "Default bbox ≈ Eastern Mediterranean: Greece, Aegean, Crete, western Turkey, Cyprus approaches (lat 30–41.5, lon 22–37).",
  };
}

export interface VesselSnapshotQuery {
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  freshness?: "live" | "stale" | "very_stale" | "all";
  includeVeryStale?: boolean;
}

export function getVesselSnapshot(query: VesselSnapshotQuery = {}): Vessel[] {
  const now = Date.now();
  const store = getVesselStateStore();
  const vessels: Vessel[] = [];

  for (const state of store.list()) {
    if (!query.includeVeryStale && !shouldIncludeInSnapshot(state.lastPositionAt, now)) {
      continue;
    }
    const ui = vesselStateToUiVessel(state, now);
    if (!ui) continue;

    if (query.freshness && query.freshness !== "all") {
      if (ui.meta?.freshness !== query.freshness) continue;
    }

    if (
      query.minLat !== undefined &&
      query.maxLat !== undefined &&
      query.minLon !== undefined &&
      query.maxLon !== undefined
    ) {
      const { latitude, longitude } = ui.position;
      if (
        latitude < query.minLat ||
        latitude > query.maxLat ||
        longitude < query.minLon ||
        longitude > query.maxLon
      ) {
        continue;
      }
    }

    vessels.push(ui);
  }

  return vessels;
}
