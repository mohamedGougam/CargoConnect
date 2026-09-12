import { describe, expect, it, beforeEach } from "vitest";
import {
  aisBoxesEqual,
  boundsAreaDeg2,
  boundsToAisBoxes,
  crossesAntimeridian,
  parseLngLatBounds,
  pointInBounds,
  quantizeBounds,
  subscriptionBoundsForZoom,
} from "@/server/maritime/geo/bbox";
import { seedAisBoxes, MARITIME_REGIONS } from "@/server/maritime/geo/regions";
import {
  ViewportSubscriptionManager,
  resetViewportSubscriptionManagerForTests,
} from "@/server/maritime/ais/ViewportSubscriptionManager";
import {
  InMemoryVesselStateStore,
  resetVesselStateStoreForTests,
} from "@/server/maritime/store/VesselStateStore";
import { getVesselSnapshot } from "@/server/maritime/ais/ingest";
import { normalizeAisShipType } from "@/server/maritime/normalize/vesselType";
import { listCatalogPorts, resetPortCatalogCacheForTests } from "@/server/maritime/ports/PortCatalog";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { buildMaritimeCorridor } from "@/lib/search/buildCorridor";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import type { VesselState } from "@/server/maritime/ais/vesselState";

describe("global maritime bbox helpers", () => {
  it("parses and rejects invalid latitude ranges", () => {
    expect(parseLngLatBounds({ west: 0, south: 10, east: 5, north: 5 })).toBeNull();
    expect(parseLngLatBounds({ west: 2, south: 1, east: 4, north: 3 })).toEqual({
      west: 2,
      south: 1,
      east: 4,
      north: 3,
    });
  });

  it("handles antimeridian crossing viewports", () => {
    const b = parseLngLatBounds({
      west: 170,
      south: 30,
      east: -170,
      north: 40,
    })!;
    expect(crossesAntimeridian(b)).toBe(true);
    const boxes = boundsToAisBoxes(b);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(pointInBounds(35, 175, b)).toBe(true);
    expect(pointInBounds(35, -175, b)).toBe(true);
    expect(pointInBounds(35, 0, b)).toBe(false);
  });

  it("rejects / clips huge world-view subscription area", () => {
    const world = parseLngLatBounds({
      west: -180,
      south: -60,
      east: 180,
      north: 70,
    })!;
    expect(boundsAreaDeg2(world)).toBeGreaterThan(1000);
    const clipped = subscriptionBoundsForZoom(world, 2);
    expect(boundsAreaDeg2(clipped)).toBeLessThan(boundsAreaDeg2(world));
  });

  it("quantizes tiny pans to the same bucket", () => {
    const a = quantizeBounds({ west: 4.1, south: 51.9, east: 5.2, north: 52.5 }, 0.25);
    const b = quantizeBounds({ west: 4.12, south: 51.91, east: 5.18, north: 52.48 }, 0.25);
    expect(a).toEqual(b);
  });

  it("compares AIS boxes for equality", () => {
    const a = [{ sw: [1, 2] as [number, number], ne: [3, 4] as [number, number] }];
    const b = [{ sw: [1, 2] as [number, number], ne: [3, 4] as [number, number] }];
    expect(aisBoxesEqual(a, b)).toBe(true);
    expect(aisBoxesEqual(a, [{ sw: [1, 2], ne: [3, 5] }])).toBe(false);
  });
});

describe("viewport subscription manager", () => {
  beforeEach(() => {
    resetViewportSubscriptionManagerForTests();
  });

  it("keeps seed boxes and merges viewport without thrashing tiny pans", () => {
    const applied: number[] = [];
    const mgr = new ViewportSubscriptionManager(seedAisBoxes());
    mgr.setApplyHandler(() => applied.push(1));
    mgr.bootstrap();
    expect(mgr.getActiveBoxes().length).toBeGreaterThan(0);

    mgr.registerViewport({
      west: 103,
      south: 0,
      east: 105,
      north: 2,
      zoom: 8,
    });
    mgr.flushNow();
    const afterFirst = mgr.getActiveBoxes().length;
    expect(afterFirst).toBeGreaterThanOrEqual(seedAisBoxes().length);

    mgr.registerViewport({
      west: 103.05,
      south: 0.05,
      east: 105.02,
      north: 2.02,
      zoom: 8.1,
    });
    mgr.flushNow();
    expect(mgr.getDiagnostics().viewportBoxes).toBeGreaterThan(0);
  });

  it("includes named maritime regions catalog", () => {
    expect(MARITIME_REGIONS.some((r) => r.id === "southeast_asia")).toBe(true);
    expect(MARITIME_REGIONS.some((r) => r.id === "us_west")).toBe(true);
  });
});

describe("bounded vessel cache", () => {
  beforeEach(() => {
    resetVesselStateStoreForTests();
  });

  it("evicts stale and overflow vessels", () => {
    const store = new InMemoryVesselStateStore({
      maxVessels: 3,
      maxAgeMs: 60_000,
    });
    const old = new Date(Date.now() - 120_000).toISOString();
    const fresh = new Date().toISOString();
    const base = {
      normalizedVesselType: "unknown" as const,
      source: "AISSTREAM" as const,
      lastUpdated: fresh,
      positionMessageCount: 1,
      staticMessageCount: 0,
    };
    store.upsert({
      ...base,
      mmsi: "1",
      latitude: 1,
      longitude: 1,
      lastPositionAt: old,
    } satisfies VesselState);
    store.upsert({
      ...base,
      mmsi: "2",
      latitude: 2,
      longitude: 2,
      lastPositionAt: fresh,
    } satisfies VesselState);
    store.upsert({
      ...base,
      mmsi: "3",
      latitude: 3,
      longitude: 3,
      lastPositionAt: fresh,
    } satisfies VesselState);
    store.upsert({
      ...base,
      mmsi: "4",
      latitude: 4,
      longitude: 4,
      lastPositionAt: fresh,
    } satisfies VesselState);
    store.prune();
    expect(store.size()).toBeLessThanOrEqual(3);
    expect(store.get("1")).toBeUndefined();
  });
});

describe("vessel type normalization (global AIS codes)", () => {
  it("maps dredger / HSC / sailing without inventing cargo subtypes", () => {
    expect(normalizeAisShipType(33)).toBe("other");
    expect(normalizeAisShipType(40)).toBe("other");
    expect(normalizeAisShipType(36)).toBe("pleasure");
    expect(normalizeAisShipType(70)).toBe("general_cargo");
    expect(normalizeAisShipType(80)).toBe("tanker");
  });
});

describe("global port catalog + search", () => {
  beforeEach(() => {
    resetPortCatalogCacheForTests();
  });

  it("includes Singapore, Shanghai, Los Angeles majors", () => {
    const ports = listCatalogPorts();
    const names = ports.map((p) => p.name.toLowerCase());
    expect(names.some((n) => n.includes("singapore"))).toBe(true);
    expect(names.some((n) => n.includes("shanghai"))).toBe(true);
    expect(names.some((n) => n.includes("los angeles"))).toBe(true);
    expect(names.some((n) => n.includes("jebel ali") || n.includes("dubai"))).toBe(true);
  });

  it("filters major-only at world zoom", () => {
    const majors = listCatalogPorts({ zoom: 2 });
    expect(majors.every((p) => (p.meta?.tier ?? "major") === "major")).toBe(true);
  });

  it("resolves global port pairs", () => {
    const index = getSearchPortIndex();
    for (const q of [
      "Singapore",
      "Shanghai",
      "Los Angeles",
      "New York",
      "Jebel Ali",
      "Rotterdam",
      "Alexandria",
    ]) {
      const r = resolveLocation(q, index);
      expect(r.best?.port || r.ambiguous).toBeTruthy();
    }
  });
});

describe("long-distance visual corridors", () => {
  it("uses passage waypoints for Asia→Europe (visual only)", () => {
    const index = getSearchPortIndex();
    const shanghai = resolveLocation("Shanghai", index);
    const rotterdam = resolveLocation("Rotterdam", index);
    expect(shanghai.best?.port.name).toMatch(/Shanghai/i);
    expect(rotterdam.best?.port.name).toMatch(/Rotterdam/i);
    const corridor = buildMaritimeCorridor(shanghai.best!.port, rotterdam.best!.port);
    expect(corridor.kind).toBe("visual_search_corridor");
    expect(corridor.waypoints.length).toBeGreaterThan(4);
    const lons = corridor.waypoints.map((w) => w.longitude);
    expect(lons.some((lon) => lon > 30 && lon < 110)).toBe(true);
  });

  it("keeps Rotterdam → Alexandria flagship corridor", () => {
    const result = runMaritimeRouteSearch({
      query: "2,000 MT steel from Rotterdam to Alexandria",
      vessels: [],
    });
    expect(result.status).toBe("active");
    if (result.status !== "active") return;
    expect(result.origin?.name.toLowerCase()).toContain("rotterdam");
    expect(result.destination?.name.toLowerCase()).toContain("alexandria");
    expect(result.corridor?.waypoints.length).toBeGreaterThan(3);
  });
});

describe("vessel snapshot bbox filter", () => {
  it("returns empty for empty cache (truthful)", () => {
    resetVesselStateStoreForTests();
    const vessels = getVesselSnapshot({
      minLat: 1,
      maxLat: 2,
      minLon: 103,
      maxLon: 105,
      zoom: 8,
    });
    expect(vessels).toEqual([]);
  });
});
