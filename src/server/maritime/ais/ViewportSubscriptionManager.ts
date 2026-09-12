/**
 * Server-side viewport → AISStream subscription manager.
 * Debounces map viewports, merges with seed regions, updates one WebSocket.
 */

import type { BoundingBox } from "../config";
import {
  aisBoxesEqual,
  boundsToAisBoxes,
  parseLngLatBounds,
  quantizeBounds,
  subscriptionBoundsForZoom,
  type AisBoundingBox,
  type LngLatBounds,
} from "../geo/bbox";
import { seedAisBoxes } from "../geo/regions";

const DEBOUNCE_MS = 750;
const MAX_ACTIVE_BOXES = 12;

export interface ViewportInterest {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

export interface SubscriptionManagerDiagnostics {
  activeBoxes: AisBoundingBox[];
  seedBoxes: number;
  viewportBoxes: number;
  lastViewport: LngLatBounds | null;
  lastZoom: number | null;
  subscriptionUpdates: number;
  lastUpdateAt: string | null;
  pending: boolean;
}

type ApplyBoxesFn = (boxes: BoundingBox[]) => void;

export class ViewportSubscriptionManager {
  private seedBoxes: AisBoundingBox[];
  private viewportBoxes: AisBoundingBox[] = [];
  private activeBoxes: AisBoundingBox[] = [];
  private lastViewport: LngLatBounds | null = null;
  private lastZoom: number | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInterest: ViewportInterest | null = null;
  private subscriptionUpdates = 0;
  private lastUpdateAt: string | null = null;
  private applyBoxes: ApplyBoxesFn | null = null;

  constructor(seed: AisBoundingBox[] = seedAisBoxes()) {
    this.seedBoxes = seed.length > 0 ? seed : seedAisBoxes();
    this.activeBoxes = dedupeBoxes([...this.seedBoxes]);
  }

  setApplyHandler(fn: ApplyBoxesFn): void {
    this.applyBoxes = fn;
  }

  getActiveBoxes(): BoundingBox[] {
    return this.activeBoxes;
  }

  /** Immediate seed subscription (process start). */
  bootstrap(): BoundingBox[] {
    this.flush(true);
    return this.activeBoxes;
  }

  /**
   * Register a browser viewport interest. Debounced; tiny pans ignored via quantize.
   */
  registerViewport(interest: ViewportInterest): void {
    const parsed = parseLngLatBounds(interest);
    if (!parsed) return;
    const zoom = Number.isFinite(interest.zoom) ? interest.zoom : 5;
    this.pendingInterest = {
      west: parsed.west,
      south: parsed.south,
      east: parsed.east,
      north: parsed.north,
      zoom,
    };
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flush(false);
    }, DEBOUNCE_MS);
  }

  /** Test helper — apply pending immediately. */
  flushNow(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flush(false);
  }

  getDiagnostics(): SubscriptionManagerDiagnostics {
    return {
      activeBoxes: this.activeBoxes,
      seedBoxes: this.seedBoxes.length,
      viewportBoxes: this.viewportBoxes.length,
      lastViewport: this.lastViewport,
      lastZoom: this.lastZoom,
      subscriptionUpdates: this.subscriptionUpdates,
      lastUpdateAt: this.lastUpdateAt,
      pending: Boolean(this.pendingInterest || this.debounceTimer),
    };
  }

  private flush(force: boolean): void {
    if (this.pendingInterest) {
      const q = quantizeBounds(
        {
          west: this.pendingInterest.west,
          south: this.pendingInterest.south,
          east: this.pendingInterest.east,
          north: this.pendingInterest.north,
        },
        0.25,
      );
      const zoom = this.pendingInterest.zoom;
      this.pendingInterest = null;

      const sameViewport =
        this.lastViewport &&
        this.lastZoom !== null &&
        this.lastViewport.west === q.west &&
        this.lastViewport.south === q.south &&
        this.lastViewport.east === q.east &&
        this.lastViewport.north === q.north &&
        Math.abs(this.lastZoom - zoom) < 0.35;

      if (!force && sameViewport) return;

      this.lastViewport = q;
      this.lastZoom = zoom;
      const subBounds = subscriptionBoundsForZoom(q, zoom);
      this.viewportBoxes = boundsToAisBoxes(subBounds);
    }

    const merged = dedupeBoxes([
      ...this.seedBoxes,
      ...this.viewportBoxes,
    ]).slice(0, MAX_ACTIVE_BOXES);

    if (!force && aisBoxesEqual(merged, this.activeBoxes)) return;

    this.activeBoxes = merged;
    this.subscriptionUpdates += 1;
    this.lastUpdateAt = new Date().toISOString();
    this.applyBoxes?.(this.activeBoxes);
  }
}

function dedupeBoxes(boxes: AisBoundingBox[]): AisBoundingBox[] {
  const seen = new Set<string>();
  const out: AisBoundingBox[] = [];
  for (const box of boxes) {
    const key = `${box.sw[0].toFixed(3)},${box.sw[1].toFixed(3)},${box.ne[0].toFixed(3)},${box.ne[1].toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(box);
  }
  return out;
}

const globalForMgr = globalThis as unknown as {
  __ccViewportSubMgr?: ViewportSubscriptionManager;
};

export function getViewportSubscriptionManager(): ViewportSubscriptionManager {
  if (!globalForMgr.__ccViewportSubMgr) {
    globalForMgr.__ccViewportSubMgr = new ViewportSubscriptionManager();
  }
  return globalForMgr.__ccViewportSubMgr;
}

/** Test helper */
export function resetViewportSubscriptionManagerForTests(): void {
  globalForMgr.__ccViewportSubMgr = undefined;
}
