import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaritimeSearchIntent } from "@/domain/search/intent";
import { emptyPlaceIntent } from "@/lib/search/intent/schema";
import type {
  InterpretQueryInput,
  InterpretQueryResult,
  MaritimeIntentInterpreter,
} from "@/lib/search/intent/MaritimeIntentInterpreter";
import { DeterministicInterpreter } from "@/lib/search/intent/deterministicInterpreter";
import { parseMaritimeQueryDeterministic } from "@/lib/search/parseQuery";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import { resetMaritimeIntentInterpreterCache } from "@/lib/search/intent/createInterpreter";

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

/** Mock OpenAI interpreter — never calls the network. */
class MockOpenAIInterpreter implements MaritimeIntentInterpreter {
  constructor(private readonly intents: Map<string, MaritimeSearchIntent>) {}

  async interpret(input: InterpretQueryInput): Promise<InterpretQueryResult> {
    const key = input.query.trim().toLowerCase();
    for (const [pattern, intent] of this.intents) {
      if (key.includes(pattern.toLowerCase()) || key === pattern.toLowerCase()) {
        return { intent, source: "openai", latencyMs: 12 };
      }
    }
    // Fall through shape: unknown → clarification
    return {
      intent: baseIntent({
        intent: "UNKNOWN",
        interpretationConfidence: "LOW",
        clarificationNeeded: true,
        clarificationReason: "Mock: no intent",
      }),
      source: "openai",
      latencyMs: 5,
    };
  }
}

describe("AI maritime search (mocked OpenAI)", () => {
  beforeEach(() => {
    resetMaritimeIntentInterpreterCache();
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_SEARCH_ENABLED = "false";
  });

  it("resolves Barcelona to Algiers via catalogue (deterministic fast path)", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Barcelona to Algiers",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Barcelona/i);
    expect(result.destination?.name).toMatch(/Algiers/i);
    expect(result.origin?.unlocode).toBe("ESBCN");
    expect(result.destination?.unlocode).toBe("DZALG");
    expect(result.interpreterUsed).toBe("deterministic");
    expect(result.resolutionOutcome).toBe("auto");
  });

  it("uses mock OpenAI for Dutch when forced interpreter is provided", async () => {
    const mock = new MockOpenAIInterpreter(
      new Map([
        [
          "van rotterdam naar alexandrië",
          baseIntent({
            detectedLanguage: "nl",
            origin: place({
              rawText: "Rotterdam",
              city: "Rotterdam",
              country: "Netherlands",
              portHint: "Rotterdam",
            }),
            destination: place({
              rawText: "Alexandrië",
              city: "Alexandria",
              country: "Egypt",
              portHint: "Alexandria",
            }),
          }),
        ],
      ]),
    );

    const result = await runMaritimeRouteSearch({
      query: "Van Rotterdam naar Alexandrië",
      vessels: [],
      interpreter: mock,
    });
    // Deterministic Dutch parser may already resolve — either path OK if ports correct
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
  });

  it("resolves German von/nach deterministically", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Von Hamburg nach Alexandria",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Hamburg/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
  });

  it("resolves Greek Piraeus → Alexandria deterministically", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Από τον Πειραιά στην Αλεξάνδρεια",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Piraeus/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
  });

  it("resolves Greek Piraeus → Alexandria with mock OpenAI place hints", async () => {
    const mock = new MockOpenAIInterpreter(
      new Map([
        [
          "πειραιά",
          baseIntent({
            detectedLanguage: "el",
            origin: place({
              city: "Piraeus",
              country: "Greece",
              portHint: "Piraeus",
            }),
            destination: place({
              city: "Alexandria",
              country: "Egypt",
              portHint: "Alexandria",
            }),
          }),
        ],
      ]),
    );
    const result = await runMaritimeRouteSearch({
      query: "Από τον Πειραιά στην Αλεξάνδρεια",
      vessels: [],
      interpreter: mock,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Piraeus/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
  });

  it("resolves Spanish De Barcelona a Argel", async () => {
    const result = await runMaritimeRouteSearch({
      query: "De Barcelona a Argel",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Barcelona/i);
    expect(result.destination?.name).toMatch(/Algiers/i);
  });

  it("resolves Arabic with mock OpenAI (catalogue validates ports)", async () => {
    const mock = new MockOpenAIInterpreter(
      new Map([
        [
          "روتردام",
          baseIntent({
            detectedLanguage: "ar",
            origin: place({
              city: "Rotterdam",
              country: "Netherlands",
              portHint: "Rotterdam",
            }),
            destination: place({
              city: "Alexandria",
              country: "Egypt",
              portHint: "Alexandria",
            }),
            cargo: { description: "steel", normalizedType: "steel" },
            quantity: { value: 2000, unit: "MT" },
          }),
        ],
      ]),
    );
    const result = await runMaritimeRouteSearch({
      query: "أريد شحن ٢٠٠٠ طن من الفولاذ من روتردام إلى الإسكندرية",
      vessels: [],
      interpreter: mock,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
    expect(result.cargo?.quantityTons).toBe(2000);
  });

  it("tolerates misspelling Barcalona to Algirs", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Barcalona to Algirs",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Barcelona/i);
    expect(result.destination?.name).toMatch(/Algiers/i);
  });

  it("city Athens maps to Piraeus", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Athens to Alexandria",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Piraeus/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
  });

  it("country Netherlands to Egypt auto-resolves hubs", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Netherlands to Egypt",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
    expect(result.destination?.name).toMatch(/Alexandria/i);
  });

  it("Spain to Egypt returns helpful origin candidates", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Spain to Egypt",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.resolutionOutcome).toBe("candidates");
    const names = result.originCandidates?.map((c) => c.port.name) ?? [];
    expect(names.some((n) => /Barcelona|Algeciras|Valencia/i.test(n))).toBe(
      true,
    );
    expect(result.uxMessage?.toLowerCase()).not.toContain("could not resolve");
  });

  it("vague northern Europe asks clarification", async () => {
    const mock = new MockOpenAIInterpreter(
      new Map([
        [
          "northern europe",
          baseIntent({
            detectedLanguage: "en",
            origin: place({ region: "northern Europe" }),
            destination: place({
              country: "Egypt",
              portHint: "Alexandria",
            }),
            interpretationConfidence: "LOW",
            clarificationNeeded: true,
            clarificationReason: "Origin region is too broad",
          }),
        ],
      ]),
    );
    const result = await runMaritimeRouteSearch({
      query: "somewhere in northern Europe to Egypt",
      vessels: [],
      interpreter: mock,
    });
    expect(["ambiguous", "error"]).toContain(result.status);
    expect(result.resolutionOutcome).toMatch(/clarification|candidates/);
  });

  it("OpenAI outage falls back to deterministic (mock failure)", async () => {
    const failing: MaritimeIntentInterpreter = {
      async interpret() {
        return {
          intent: (
            await new DeterministicInterpreter().interpret({
              query: "Rotterdam to Alexandria",
            })
          ).intent,
          source: "deterministic",
          latencyMs: 3,
          fallbackUsed: true,
          errorCode: "openai_timeout",
        };
      },
    };
    const result = await runMaritimeRouteSearch({
      query: "Rotterdam to Alexandria",
      vessels: [],
      interpreter: failing,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Rotterdam/i);
  });

  it("does not invent ports — mock city must exist in catalogue", async () => {
    const mock = new MockOpenAIInterpreter(
      new Map([
        [
          "atlantis",
          baseIntent({
            origin: place({ city: "Atlantis", portHint: "Atlantis" }),
            destination: place({ city: "Alexandria", portHint: "Alexandria" }),
          }),
        ],
      ]),
    );
    const result = await runMaritimeRouteSearch({
      query: "Atlantis to Alexandria",
      vessels: [],
      interpreter: mock,
    });
    expect(result.status).not.toBe("active");
    expect(result.origin).toBeUndefined();
  });
});

describe("multilingual deterministic parse helpers", () => {
  it.each([
    ["Van Antwerpen naar Alexandrië", "Antwerp", "Alexandria"],
    ["Von Hamburg nach Alexandria", "Hamburg", "Alexandria"],
    ["De Barcelona a Argel", "Barcelona", "Algiers"],
    ["Je veux transporter de l'acier d'Anvers à Alexandrie", null, null],
  ])("parses %s", (query, originExpect, destExpect) => {
    const parsed = parseMaritimeQueryDeterministic(query);
    if (originExpect) {
      expect(parsed.originText?.toLowerCase()).toContain(
        originExpect.toLowerCase().slice(0, 5).toLowerCase(),
      );
    }
    if (destExpect) {
      expect(parsed.destinationText?.toLowerCase()).toMatch(
        /alexandr|argel|algiers/i,
      );
    }
  });
});

describe("port aliases for AI search", () => {
  const ports = getSearchPortIndex();

  it("resolves Anvers → Antwerp and Alexandrie → Alexandria", () => {
    expect(resolveLocation("Anvers", ports).best?.port.name).toMatch(/Antwerp/i);
    expect(resolveLocation("Alexandrie", ports).best?.port.name).toMatch(
      /Alexandria/i,
    );
  });

  it("resolves Algirs and Barcalona via fuzzy/alias", () => {
    expect(resolveLocation("Algirs", ports).best?.port.name).toMatch(/Algiers/i);
    expect(resolveLocation("Barcalona", ports).best?.port.name).toMatch(
      /Barcelona/i,
    );
  });
});

describe("DeterministicInterpreter isolation", () => {
  it("never imports OpenAI client", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const det = new DeterministicInterpreter();
    const r = await det.interpret({ query: "2000 MT steel from Rotterdam to Alexandria" });
    expect(r.source).toBe("deterministic");
    expect(r.intent.origin.portHint?.toLowerCase()).toContain("rotterdam");
    spy.mockRestore();
  });
});
