import type { VesselState } from "../ais/vesselState";
import { VERY_STALE_HIDE_MS } from "../normalize/freshness";

export interface VesselStateStore {
  get(mmsi: string): VesselState | undefined;
  upsert(state: VesselState): void;
  list(): VesselState[];
  size(): number;
  clear(): void;
  /** Drop stale / overflow entries. Returns number removed. */
  prune?(nowMs?: number): number;
}

const DEFAULT_MAX_VESSELS = 8_000;
const PRUNE_EVERY_UPSERTS = 250;

/**
 * Process-local in-memory store with bounded growth.
 * Designed so Redis (or another backend) can replace this later.
 */
export class InMemoryVesselStateStore implements VesselStateStore {
  private readonly vessels = new Map<string, VesselState>();
  private upsertsSincePrune = 0;
  private readonly maxVessels: number;
  private readonly maxAgeMs: number;

  constructor(options?: { maxVessels?: number; maxAgeMs?: number }) {
    this.maxVessels = options?.maxVessels ?? DEFAULT_MAX_VESSELS;
    this.maxAgeMs = options?.maxAgeMs ?? VERY_STALE_HIDE_MS;
  }

  get(mmsi: string): VesselState | undefined {
    return this.vessels.get(mmsi);
  }

  upsert(state: VesselState): void {
    this.vessels.set(state.mmsi, state);
    this.upsertsSincePrune += 1;
    if (this.upsertsSincePrune >= PRUNE_EVERY_UPSERTS) {
      this.upsertsSincePrune = 0;
      this.prune();
    }
  }

  list(): VesselState[] {
    return Array.from(this.vessels.values());
  }

  size(): number {
    return this.vessels.size;
  }

  clear(): void {
    this.vessels.clear();
  }

  prune(nowMs = Date.now()): number {
    let removed = 0;
    for (const [mmsi, state] of this.vessels) {
      const ts = state.lastPositionAt
        ? Date.parse(state.lastPositionAt)
        : state.lastStaticAt
          ? Date.parse(state.lastStaticAt)
          : 0;
      if (!Number.isFinite(ts) || nowMs - ts > this.maxAgeMs) {
        this.vessels.delete(mmsi);
        removed += 1;
      }
    }

    if (this.vessels.size <= this.maxVessels) return removed;

    // Evict oldest position first when over capacity.
    const ranked = Array.from(this.vessels.values()).sort((a, b) => {
      const ta = Date.parse(a.lastPositionAt ?? a.lastStaticAt ?? "0");
      const tb = Date.parse(b.lastPositionAt ?? b.lastStaticAt ?? "0");
      return ta - tb;
    });
    const overflow = this.vessels.size - this.maxVessels;
    for (let i = 0; i < overflow; i++) {
      this.vessels.delete(ranked[i].mmsi);
      removed += 1;
    }
    return removed;
  }
}

/** Singleton store for the Node process (Next.js server). */
const globalForVessels = globalThis as unknown as {
  __ccVesselStore?: InMemoryVesselStateStore;
};

export function getVesselStateStore(): VesselStateStore {
  if (!globalForVessels.__ccVesselStore) {
    globalForVessels.__ccVesselStore = new InMemoryVesselStateStore();
  }
  return globalForVessels.__ccVesselStore;
}

/** Test helper */
export function resetVesselStateStoreForTests(): void {
  globalForVessels.__ccVesselStore = undefined;
}
