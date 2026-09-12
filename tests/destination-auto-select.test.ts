import { describe, expect, it, beforeEach } from "vitest";
import type { Vessel } from "@/domain/models";
import {
  aisDestinationMatchesPort,
  countAisDestinationVessels,
} from "@/lib/search/aisDestinationMatch";
import {
  buildDestinationOptions,
  switchSearchDestination,
} from "@/lib/search/activateSearch";
import {
  clearMaritimeDistanceCacheForTests,
  estimateMaritimeDistanceNm,
} from "@/lib/search/maritimeDistance";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

function vessel(partial: Partial<Vessel> & { id: string }): Vessel {
  return {
    name: partial.name ?? partial.id,
    type: partial.type ?? "container",
    cargoCategory: partial.cargoCategory ?? "Containers",
    position: partial.position ?? { longitude: 0, latitude: 0 },
    status: partial.status ?? "underway",
    destinationRaw: partial.destinationRaw,
    meta: partial.meta ?? {
      freshness: "live",
      source: "AISSTREAM",
      sourceTimestamp: new Date().toISOString(),
    },
    ...partial,
  };
}

describe("smart destination auto-selection", () => {
  beforeEach(() => {
    clearMaritimeDistanceCacheForTests();
  });

  it("A: Rotterdam → Norway auto-selects nearest maritime-distance candidate", async () => {
    const result = await runMaritimeRouteSearch({
      query: "I want to ship tulips from Rotterdam to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
    expect(result.destination?.country).toBe("Norway");
    expect(result.requestedDestinationLabel?.toLowerCase()).toContain("norway");
    expect(result.destinationSelectionReason).toBe("shortest_maritime_distance");
    expect(result.destinationOptions?.length).toBeGreaterThan(1);
    expect(
      result.destinationOptions?.every((o) => o.port.country === "Norway"),
    ).toBe(true);
    expect(result.destination?.id).toBe(result.destinationOptions![0].port.id);
    // Cargo may come from deterministic parse or remain unset without OpenAI
    if (result.cargo?.description) {
      expect(result.cargo.description.toLowerCase()).toMatch(/tulip/);
    }
    expect(result.corridor?.kind).toBe("visual_search_corridor");
  });

  it("B: switch destination updates route without new interpretation", async () => {
    const initial = await runMaritimeRouteSearch({
      query: "Rotterdam to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    expect(initial.status).toBe("active");
    expect(initial.destinationOptions!.length).toBeGreaterThan(1);

    const other = initial.destinationOptions!.find(
      (o) => o.port.id !== initial.destination!.id,
    )!;
    const switched = switchSearchDestination(initial, other.port.id, []);

    expect(switched.status).toBe("active");
    expect(switched.destination?.id).toBe(other.port.id);
    expect(switched.destinationSelectionReason).toBe("user_selected");
    expect(switched.originalQuery).toBe(initial.originalQuery);
    expect(switched.requestedDestinationLabel).toBe(
      initial.requestedDestinationLabel,
    );
    expect(switched.interpreterUsed).toBe(initial.interpreterUsed);
    expect(switched.corridor?.id).not.toBe(initial.corridor?.id);
  });

  it("C: destination options ordered by estimated maritime distance ascending", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Rotterdam to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    const opts = result.destinationOptions!;
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i].estimatedDistanceNm).toBeGreaterThanOrEqual(
        opts[i - 1].estimatedDistanceNm,
      );
    }
  });

  it("D: AIS destination matching covers OSLO / NOOSL / PORT OF OSLO", () => {
    const ports = getSearchPortIndex();
    const oslo = resolveLocation("Oslo", ports).best!.port;
    expect(aisDestinationMatchesPort("OSLO", oslo)).toBe(true);
    expect(aisDestinationMatchesPort("NOOSL", oslo)).toBe(true);
    expect(aisDestinationMatchesPort("PORT OF OSLO", oslo)).toBe(true);
    expect(aisDestinationMatchesPort("OSLO NORWAY", oslo)).toBe(true);
  });

  it("E: stale AIS observations are excluded from destination counts", () => {
    const ports = getSearchPortIndex();
    const oslo = resolveLocation("Oslo", ports).best!.port;
    const vessels: Vessel[] = [
      vessel({
        id: "live-oslo",
        destinationRaw: "OSLO",
        meta: {
          freshness: "live",
          source: "AISSTREAM",
          sourceTimestamp: new Date().toISOString(),
        },
      }),
      vessel({
        id: "stale-oslo",
        destinationRaw: "OSLO",
        meta: {
          freshness: "stale",
          source: "AISSTREAM",
          sourceTimestamp: new Date().toISOString(),
        },
      }),
      vessel({
        id: "very-stale-oslo",
        destinationRaw: "OSLO",
        meta: {
          freshness: "very_stale",
          source: "AISSTREAM",
          sourceTimestamp: new Date().toISOString(),
        },
      }),
    ];
    expect(countAisDestinationVessels(vessels, oslo)).toBe(2);
  });

  it("F: corridor-relevant vessel is not counted unless AIS destination matches", async () => {
    const ports = getSearchPortIndex();
    const oslo = resolveLocation("Oslo", ports).best!.port;
    const vessels: Vessel[] = [
      vessel({
        id: "corridor-no-dest",
        destinationRaw: "ROTTERDAM",
        position: { longitude: 5, latitude: 56 },
        meta: {
          freshness: "live",
          source: "AISSTREAM",
          sourceTimestamp: new Date().toISOString(),
        },
      }),
      vessel({
        id: "ais-oslo",
        destinationRaw: "NOOSL",
        position: { longitude: -150, latitude: 20 },
        meta: {
          freshness: "live",
          source: "AISSTREAM",
          sourceTimestamp: new Date().toISOString(),
        },
      }),
    ];
    const result = await runMaritimeRouteSearch({
      query: "Rotterdam to Norway",
      vessels,
      deterministicOnly: true,
    });
    const osloOpt = result.destinationOptions!.find((o) => o.port.id === oslo.id);
    expect(osloOpt?.aisDestinationVesselCount).toBe(1);
  });

  it("G: zero AIS count still lists the port", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Rotterdam to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.destinationOptions!.length).toBeGreaterThan(0);
    expect(
      result.destinationOptions!.every((o) => o.aisDestinationVesselCount === 0),
    ).toBe(true);
  });

  it("H: Norway dropdown contains only Norwegian ports", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Cargo from Hamburg to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(
      result.destinationOptions!.every((o) => o.port.country === "Norway"),
    ).toBe(true);
  });

  it("I: cargo/quantity preserved after switching destination", async () => {
    const initial = await runMaritimeRouteSearch({
      query: "2,000 MT steel from Rotterdam to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    expect(initial.status).toBe("active");
    expect(initial.cargo?.description?.toLowerCase()).toMatch(/steel/);
    expect(initial.cargo?.quantityTons).toBe(2000);

    const other = initial.destinationOptions!.find(
      (o) => o.port.id !== initial.destination!.id,
    )!;
    const switched = switchSearchDestination(initial, other.port.id, []);
    expect(switched.cargo?.description).toBe(initial.cargo?.description);
    expect(switched.cargo?.quantityTons).toBe(2000);
    expect(switched.vesselType).toBe(initial.vesselType);
  });

  it("J: Barcelona → Algeria resolves (single Algerian hub, no unnecessary switcher)", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Barcelona to Algeria",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Barcelona/i);
    expect(result.destination?.country).toBe("Algeria");
    // Catalogue currently has a single Algerian hub → exact path, no multi-port switcher
    expect(result.destinationOptions).toBeUndefined();
    expect(result.destinationSelectionReason).toBe("exact");
  });

  it("K: Hamburg → Egypt auto-selects Egyptian destination", async () => {
    const result = await runMaritimeRouteSearch({
      query: "2,000 MT steel from Hamburg to Egypt",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Hamburg/i);
    expect(result.destination?.country).toBe("Egypt");
    expect(result.destinationOptions!.length).toBeGreaterThan(1);
    expect(result.cargo?.quantityTons).toBe(2000);
  });

  it("L: exact Rotterdam → Alexandria has no destination switcher options", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Rotterdam to Alexandria",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.destination?.name).toMatch(/Alexandria/i);
    expect(result.destinationSelectionReason).toBe("exact");
    expect(result.destinationOptions).toBeUndefined();
  });

  it("maritime distance uses corridor polyline (not land great-circle for Med)", () => {
    const ports = getSearchPortIndex();
    const rotterdam = resolveLocation("Rotterdam", ports).best!.port;
    const alexandria = resolveLocation("Alexandria", ports).best!.port;
    const est = estimateMaritimeDistanceNm(rotterdam, alexandria);
    expect(est.estimated).toBe(true);
    expect(est.method).toBe("corridor_polyline_nm");
    // Great-circle through Europe is ~3,200 km (~1,700 nm); maritime via Gib is longer.
    expect(est.distanceNm).toBeGreaterThan(2000);
    expect(est.distanceNm).toBeLessThan(4500);
  });

  it("buildDestinationOptions ranks Stavanger nearer than Oslo from Rotterdam", () => {
    const ports = getSearchPortIndex();
    const origin = resolveLocation("Rotterdam", ports).best!.port;
    const norway = resolveLocation("Norway", ports);
    const options = buildDestinationOptions(origin, norway.candidates, []);
    const stavanger = options.find((o) => /Stavanger/i.test(o.port.name));
    const oslo = options.find((o) => /Oslo/i.test(o.port.name));
    expect(stavanger).toBeTruthy();
    expect(oslo).toBeTruthy();
    expect(stavanger!.estimatedDistanceNm).toBeLessThan(
      oslo!.estimatedDistanceNm,
    );
    expect(options[0].estimatedDistanceNm).toBe(
      Math.min(...options.map((o) => o.estimatedDistanceNm)),
    );
  });

  it("distance cache returns identical values for same UNLOCODE pair", () => {
    const ports = getSearchPortIndex();
    const a = resolveLocation("Rotterdam", ports).best!.port;
    const b = resolveLocation("Oslo", ports).best!.port;
    const first = estimateMaritimeDistanceNm(a, b);
    const second = estimateMaritimeDistanceNm(a, b);
    expect(second).toEqual(first);
  });

  it("Spain → Egypt stays ambiguous (multi source, not auto-picked by nearest)", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Spain to Egypt",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.originCandidates?.length).toBeGreaterThan(1);
  });
});
