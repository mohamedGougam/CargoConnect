import { describe, expect, it } from "vitest";
import type { Vessel } from "@/domain/models";
import { parseMaritimeQueryDeterministic } from "@/lib/search/parseQuery";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { buildMaritimeCorridor } from "@/lib/search/buildCorridor";
import { scoreRelevantVessels } from "@/lib/search/scoreVessels";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

describe("natural-language maritime query parse", () => {
  it("parses Rotterdam to Alexandria", () => {
    const parsed = parseMaritimeQueryDeterministic("Rotterdam to Alexandria");
    expect(parsed.originText).toBe("Rotterdam");
    expect(parsed.destinationText).toBe("Alexandria");
    expect(parsed.interpreter).toBe("deterministic");
  });

  it("parses ships from Piraeus to Istanbul", () => {
    const parsed = parseMaritimeQueryDeterministic(
      "Show ships from Piraeus to Istanbul",
    );
    expect(parsed.originText?.toLowerCase()).toContain("piraeus");
    expect(parsed.destinationText?.toLowerCase()).toContain("istanbul");
  });

  it("parses cargo transport phrasing", () => {
    const parsed = parseMaritimeQueryDeterministic(
      "I need to transport steel from Rotterdam to Alexandria",
    );
    expect(parsed.originText).toBe("Rotterdam");
    expect(parsed.destinationText).toBe("Alexandria");
    expect(parsed.cargo?.description).toBe("steel");
    expect(parsed.vesselType).toBe("general_cargo");
  });

  it("parses Greece to Egypt", () => {
    const parsed = parseMaritimeQueryDeterministic(
      "Find vessels between Greece and Egypt",
    );
    expect(parsed.originText).toBe("Greece");
    expect(parsed.destinationText).toBe("Egypt");
  });

  it("parses trailing Place → Place after cargo chip text", () => {
    const parsed = parseMaritimeQueryDeterministic("2,000t steel · Greece → Egypt");
    expect(parsed.originText).toBe("Greece");
    expect(parsed.destinationText).toBe("Egypt");
    expect(parsed.cargo?.quantityTons).toBe(2000);
  });
});

describe("port resolution", () => {
  const ports = getSearchPortIndex();

  it("resolves Rotterdam and Alexandria", () => {
    const origin = resolveLocation("Rotterdam", ports);
    const dest = resolveLocation("Alexandria", ports);
    expect(origin.best?.port.name).toMatch(/Rotterdam/i);
    expect(dest.best?.port.name).toMatch(/Alexandria/i);
    expect(origin.ambiguous).toBe(false);
    expect(dest.ambiguous).toBe(false);
  });

  it("resolves Piraeus and Istanbul", () => {
    expect(resolveLocation("Piraeus", ports).best?.port.name).toMatch(/Piraeus/i);
    expect(resolveLocation("Istanbul", ports).best?.port.name).toMatch(/Istanbul/i);
  });

  it("resolves Greece → primary hub and Egypt → primary hub", () => {
    const greece = resolveLocation("Greece", ports);
    const egypt = resolveLocation("Egypt", ports);
    expect(greece.best?.port.name).toMatch(/Piraeus/i);
    expect(egypt.best?.port.name).toMatch(/Alexandria/i);
  });
});

describe("maritime corridor", () => {
  const ports = getSearchPortIndex();

  it("builds Gibraltar-aware corridor for Rotterdam → Alexandria", () => {
    const origin = resolveLocation("Rotterdam", ports).best!.port;
    const dest = resolveLocation("Alexandria", ports).best!.port;
    const corridor = buildMaritimeCorridor(origin, dest);
    expect(corridor.kind).toBe("visual_search_corridor");
    expect(corridor.waypoints.length).toBeGreaterThan(4);
    // Must pass near Gibraltar rather than cutting across Europe
    const nearGib = corridor.waypoints.some(
      (p) => Math.abs(p.longitude - -5.35) < 2 && Math.abs(p.latitude - 36) < 3,
    );
    expect(nearGib).toBe(true);
  });

  it("builds Aegean corridor for Piraeus → Istanbul", () => {
    const origin = resolveLocation("Piraeus", ports).best!.port;
    const dest = resolveLocation("Istanbul", ports).best!.port;
    const corridor = buildMaritimeCorridor(origin, dest);
    expect(corridor.waypoints.length).toBeGreaterThanOrEqual(3);
  });
});

describe("runMaritimeRouteSearch", () => {
  const sampleVessels: Vessel[] = [
    {
      id: "v-corridor",
      name: "Corridor Ship",
      type: "container",
      cargoCategory: "Containers",
      position: { longitude: -5.3, latitude: 36.1 },
      course: 90,
      speed: 14,
      status: "underway",
      meta: { freshness: "live", source: "AISSTREAM", sourceTimestamp: new Date().toISOString() },
    },
    {
      id: "v-far",
      name: "Pacific Far",
      type: "tanker",
      cargoCategory: "Liquid",
      position: { longitude: -150, latitude: 20 },
      course: 10,
      speed: 12,
      status: "underway",
      meta: { freshness: "live", source: "AISSTREAM", sourceTimestamp: new Date().toISOString() },
    },
  ];

  it("returns active search for Rotterdam → Alexandria", () => {
    const result = runMaritimeRouteSearch({
      query: "Rotterdam to Alexandria",
      vessels: sampleVessels,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
    expect(result.corridor?.kind).toBe("visual_search_corridor");
    expect(result.relevantVesselIds).toContain("v-corridor");
    expect(result.relevantVesselIds).not.toContain("v-far");
  });

  it("scores vessels near corridor higher", () => {
    const ports = getSearchPortIndex();
    const origin = resolveLocation("Rotterdam", ports).best!.port;
    const dest = resolveLocation("Alexandria", ports).best!.port;
    const corridor = buildMaritimeCorridor(origin, dest);
    const hits = scoreRelevantVessels(sampleVessels, {
      corridor,
      originLatLon: origin.position,
      destinationLatLon: dest.position,
    });
    expect(hits[0]?.vesselId).toBe("v-corridor");
  });
});
