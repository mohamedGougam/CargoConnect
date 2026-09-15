import { describe, expect, it } from "vitest";
import type { MaritimeSearchIntent } from "@/domain/search/intent";
import { emptyPlaceIntent } from "@/lib/search/intent/schema";
import type { MaritimeIntentInterpreter } from "@/lib/search/intent/MaritimeIntentInterpreter";
import {
  applyCatalogueAmplifyHints,
  placeNeedsCatalogueAmplify,
} from "@/lib/search/catalogueAmplify";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

function place(partial: Partial<MaritimeSearchIntent["origin"]>) {
  return { ...emptyPlaceIntent(), ...partial };
}

function baseIntent(
  overrides: Partial<MaritimeSearchIntent>,
): MaritimeSearchIntent {
  return {
    detectedLanguage: "en",
    intent: "ROUTE_SEARCH",
    origin: emptyPlaceIntent(),
    destination: emptyPlaceIntent(),
    cargo: { description: null, normalizedType: null },
    quantity: { value: null, unit: null },
    vesselTypeHint: null,
    dateHint: null,
    interpretationConfidence: "HIGH",
    clarificationNeeded: false,
    clarificationReason: null,
    ...overrides,
  };
}

describe("OpenAI catalogue amplify (step 2)", () => {
  const ports = getSearchPortIndex();

  it("Tunisia does not resolve via country allowlist alone", () => {
    const r = resolveLocation("Tunisia", ports);
    expect(r.best).toBeUndefined();
    expect(r.candidates).toHaveLength(0);
    expect(placeNeedsCatalogueAmplify(r)).toBe(true);
  });

  it("amplify ISO country returns ports in that country for nearest-pair mapping", () => {
    const r = applyCatalogueAmplifyHints("Tunisia", ports, {
      isoCountryCode: "TN",
      englishPortOrCityNames: ["Tunis"],
      unlocodeHints: [],
    });
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => /Tunisia/i.test(c.port.country))).toBe(
      true,
    );
    expect(
      r.candidates.every((c) => c.matchReason === "openai_amplify_country"),
    ).toBe(true);
  });

  it("amplify ISO country returns only real TN catalogue candidates", () => {
    const r = applyCatalogueAmplifyHints("تونس", ports, {
      isoCountryCode: "TN",
      englishPortOrCityNames: [],
      unlocodeHints: [],
    });
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => /Tunisia/i.test(c.port.country))).toBe(
      true,
    );
  });

  it("name-only amplify collects verified ports when no ISO is provided", () => {
    const r = applyCatalogueAmplifyHints("Tunisia gateways", ports, {
      isoCountryCode: null,
      englishPortOrCityNames: ["Tunis", "Sfax"],
      unlocodeHints: [],
    });
    expect(r.candidates.length + (r.best ? 1 : 0)).toBeGreaterThan(0);
    const portsFound = r.candidates.length
      ? r.candidates
      : r.best
        ? [r.best]
        : [];
    expect(portsFound.every((c) => /Tunisia/i.test(c.port.country))).toBe(true);
  });

  it("rejects invented UN/LOCODEs that are not in the catalogue", () => {
    const r = applyCatalogueAmplifyHints("Somewhere", ports, {
      isoCountryCode: null,
      englishPortOrCityNames: [],
      unlocodeHints: ["ZZFAKE"],
    });
    expect(r.best).toBeUndefined();
    expect(r.candidates).toHaveLength(0);
  });

  it("Arabic Tunisia→China: ports on both sides then nearest pair", async () => {
    const mockIntent: MaritimeIntentInterpreter = {
      async interpret() {
        return {
          source: "openai",
          latencyMs: 10,
          intent: baseIntent({
            detectedLanguage: "ar",
            origin: place({
              rawText: "تونس",
              interpretedName: "Tunisia",
              country: "Tunisia",
              city: null,
            }),
            destination: place({
              rawText: "الصين",
              interpretedName: "China",
              country: "China",
            }),
          }),
        };
      },
    };

    const result = await runMaritimeRouteSearch({
      query: "تونس إلى الصين",
      vessels: [],
      interpreter: mockIntent,
      amplifyPlace: async ({ place: p, fallbackLabel, ports: idx }) => {
        const label = fallbackLabel || p.country || p.rawText || "";
        if (/tunis|تونس/i.test(label) || /tunis/i.test(p.country ?? "")) {
          return {
            used: true,
            latencyMs: 8,
            result: applyCatalogueAmplifyHints(label, idx, {
              isoCountryCode: "TN",
              englishPortOrCityNames: ["Tunis", "Sfax", "Bizerte"],
              unlocodeHints: ["TNTUN"],
            }),
          };
        }
        return {
          used: false,
          latencyMs: 1,
          result: { queryText: label, candidates: [], ambiguous: true },
        };
      },
    });

    expect(result.status).toBe("active");
    expect(result.origin?.country).toMatch(/Tunisia/i);
    expect(result.destination?.country).toMatch(/China/i);
    expect(result.originSelectionReason).toBe("shortest_maritime_distance");
    expect(result.destinationSelectionReason).toBe(
      "shortest_maritime_distance",
    );
    expect(result.resolutionOutcome).not.toBe("catalogue_no_match");
  });
});
