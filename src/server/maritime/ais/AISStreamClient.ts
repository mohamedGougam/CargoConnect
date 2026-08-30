import WebSocket from "ws";
import type { AisFeedConnectionState } from "@/domain/models";
import type { BoundingBox } from "../config";
import { bboxToAisStreamCorners } from "../config";

export interface AISStreamClientOptions {
  apiKey: string;
  bboxes: BoundingBox[];
  filterMessageTypes?: string[];
  onMessage: (data: unknown) => void;
  onStateChange?: (state: AisFeedConnectionState, detail?: string) => void;
  /** Cap reconnect attempts before entering error idle (0 = unlimited with backoff ceiling). */
  maxReconnectAttempts?: number;
}

const WS_URL = "wss://stream.aisstream.io/v0/stream";
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Server-only AISStream WebSocket client.
 * Never instantiate from browser / React code.
 */
export class AISStreamClient {
  private socket: WebSocket | null = null;
  private state: AisFeedConnectionState = "idle";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly maxReconnectAttempts: number;

  constructor(private readonly options: AISStreamClientOptions) {
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 0;
  }

  getConnectionState(): AisFeedConnectionState {
    return this.state;
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.setState("disconnected", "stopped");
  }

  private open(): void {
    if (this.stopped) return;
    this.clearReconnect();
    this.setState(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      this.socket = new WebSocket(WS_URL, {
        perMessageDeflate: true,
      });
    } catch (err) {
      this.setState("error", err instanceof Error ? err.message : "socket-create-failed");
      this.scheduleReconnect();
      return;
    }

    const socket = this.socket;

    socket.on("open", () => {
      if (this.stopped) return;
      try {
        const subscription = {
          APIKey: this.options.apiKey,
          BoundingBoxes: this.options.bboxes.map(bboxToAisStreamCorners),
          FilterMessageTypes: this.options.filterMessageTypes ?? [
            "PositionReport",
            "ShipStaticData",
            "StandardClassBPositionReport",
            "ExtendedClassBPositionReport",
            "StaticDataReport",
          ],
        };
        socket.send(JSON.stringify(subscription));
        this.reconnectAttempts = 0;
        this.setState("connected");
      } catch (err) {
        this.setState("error", err instanceof Error ? err.message : "subscribe-failed");
        socket.close();
      }
    });

    socket.on("message", (data) => {
      if (this.stopped) return;
      try {
        const text =
          typeof data === "string"
            ? data
            : Buffer.isBuffer(data)
              ? data.toString("utf8")
              : Array.isArray(data)
                ? Buffer.concat(data).toString("utf8")
                : Buffer.from(data as ArrayBuffer).toString("utf8");
        const parsed: unknown = JSON.parse(text);
        this.options.onMessage(parsed);
      } catch (err) {
        console.warn(
          "[AISStream] failed to parse message",
          err instanceof Error ? err.message : err,
        );
      }
    });

    socket.on("close", () => {
      this.socket = null;
      if (this.stopped) return;
      this.setState("disconnected", "closed");
      this.scheduleReconnect();
    });

    socket.on("error", (err) => {
      console.warn("[AISStream] socket error", err.message);
      this.setState("error", err.message);
      // close handler will reconnect
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.reconnectAttempts += 1;
    if (
      this.maxReconnectAttempts > 0 &&
      this.reconnectAttempts > this.maxReconnectAttempts
    ) {
      this.setState("error", "max-reconnect-exceeded");
      return;
    }

    const exp = Math.min(
      MAX_BACKOFF_MS,
      MIN_BACKOFF_MS * 2 ** Math.min(this.reconnectAttempts - 1, 6),
    );
    const jitter = Math.floor(Math.random() * 400);
    const delay = exp + jitter;
    this.setState("reconnecting", `attempt=${this.reconnectAttempts} delayMs=${delay}`);
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: AisFeedConnectionState, detail?: string): void {
    this.state = state;
    if (detail) {
      console.info(`[AISStream] ${state}: ${detail}`);
    } else {
      console.info(`[AISStream] ${state}`);
    }
    this.options.onStateChange?.(state, detail);
  }
}
