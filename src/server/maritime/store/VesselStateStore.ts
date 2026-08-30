import type { VesselState } from "../ais/vesselState";

export interface VesselStateStore {
  get(mmsi: string): VesselState | undefined;
  upsert(state: VesselState): void;
  list(): VesselState[];
  size(): number;
  clear(): void;
}

/**
 * Process-local in-memory store.
 * Designed so Redis (or another backend) can replace this later.
 */
export class InMemoryVesselStateStore implements VesselStateStore {
  private readonly vessels = new Map<string, VesselState>();

  get(mmsi: string): VesselState | undefined {
    return this.vessels.get(mmsi);
  }

  upsert(state: VesselState): void {
    this.vessels.set(state.mmsi, state);
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
