import { describe, expect, it } from "vitest";
import {
  MAP_FOUNDATION_IDS,
  MAP_FOUNDATION_META,
  OPENFREEMAP_STYLE_DARK,
  PROTOMAPS_RESEARCH_NOTE,
  applyDayViewMaritimeOverrides,
  applyPremiumMaritimeProofOverrides,
  isVectorFoundation,
} from "@/lib/map/mapFoundations";
import type { StyleSpecification } from "maplibre-gl";

function sampleStyle(): StyleSpecification {
  return {
    version: 8,
    name: "test",
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#000" },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": "#111" },
      },
      {
        id: "highway_minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        paint: { "line-opacity": 0.9, "line-color": "#fff" },
      },
      {
        id: "place_village",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        paint: { "text-opacity": 1 },
      },
    ],
  };
}

describe("map foundations (research / visual proof)", () => {
  it("keeps current Esri as non-permanent default foundation", () => {
    expect(MAP_FOUNDATION_META["current-esri"].recurringLicenseCost).toBe(
      "uncertain",
    );
    expect(MAP_FOUNDATION_META["current-esri"].commercialConfidence).toBe("low");
  });

  it("shortlists OpenFreeMap options as commercially clearer vector paths", () => {
    for (const id of ["openfreemap-dark", "openfreemap-fiord", "openfreemap-premium-proof"] as const) {
      expect(isVectorFoundation(id)).toBe(true);
      expect(MAP_FOUNDATION_META[id].recurringLicenseCost).toBe("none");
      expect(MAP_FOUNDATION_META[id].commercialConfidence).toBe("high");
      expect(MAP_FOUNDATION_META[id].selfHostPossible).toBe(true);
    }
  });

  it("marks Protomaps hosted demo API as requiring approval", () => {
    expect(PROTOMAPS_RESEARCH_NOTE.demoApi).toMatch(/PAID|REQUIRES APPROVAL/);
    expect(PROTOMAPS_RESEARCH_NOTE.dataLicense).toMatch(/ODbL|OpenStreetMap/);
  });

  it("premium proof mutates OpenFreeMap dark toward navy sea / quiet land", () => {
    const proof = applyPremiumMaritimeProofOverrides(sampleStyle());
    const water = proof.layers?.find((l) => l.id === "water");
    const road = proof.layers?.find((l) => l.id === "highway_minor");
    const village = proof.layers?.find((l) => l.id === "place_village");
    const waterPaint = (water?.paint ?? {}) as Record<string, unknown>;
    const roadPaint = (road?.paint ?? {}) as Record<string, unknown>;
    const villagePaint = (village?.paint ?? {}) as Record<string, unknown>;

    expect(waterPaint["fill-color"]).toBe("#071018");
    expect(roadPaint["line-opacity"]).toBe(0.08);
    expect(villagePaint["text-opacity"]).toBe(0.2);
    expect(village?.minzoom).toBe(8);
    expect(OPENFREEMAP_STYLE_DARK).toContain("openfreemap");
    expect(MAP_FOUNDATION_IDS.length).toBeGreaterThan(0);
  });

  it("day view overrides produce premium blue sea on vector foundations", () => {
    const day = applyDayViewMaritimeOverrides(sampleStyle());
    const water = day.layers?.find((l) => l.id === "water");
    const bg = day.layers?.find((l) => l.id === "background");
    const waterPaint = (water?.paint ?? {}) as Record<string, unknown>;
    const bgPaint = (bg?.paint ?? {}) as Record<string, unknown>;

    expect(String(waterPaint["fill-color"])).toMatch(/#[0-9a-f]{6}/i);
    expect(waterPaint["fill-color"]).not.toBe("#071018");
    expect(String(bgPaint["background-color"])).toMatch(/#[0-9a-f]{6}/i);
    expect(day.name).toMatch(/Day View/i);
  });

  it("exposes explorer foundation ids including baseline", () => {
    expect(MAP_FOUNDATION_IDS[0]).toBe("current-esri");
    expect(OPENFREEMAP_STYLE_DARK).toContain("openfreemap.org");
  });
});
