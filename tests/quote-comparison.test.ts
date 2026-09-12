import { beforeEach, describe, expect, it } from "vitest";
import {
  createUser,
  resetCommercialStoreForTests,
  saveRequest,
} from "@/server/commercial/store";
import { hashPassword } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { compareQuotesForRequest } from "@/server/commercial/comparison/compareQuotes";
import { correctCommercialQuote } from "@/server/commercial/comparison/correctQuote";
import {
  estimateFreightAmount,
  normalizeCommercialQuote,
  normalizeRateUnit,
} from "@/server/commercial/comparison/normalize";
import { rankQuotes } from "@/server/commercial/comparison/rank";
import { computeCompletenessScore } from "@/server/commercial/comparison/completeness";
import {
  NO_VERIFIED_RATE_NOTE,
  type CommercialQuote,
  type CommercialRequest,
} from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  delete process.env.FX_ENABLED;
  delete process.env.FX_RATES_JSON;
  await resetCommercialStoreForTests();
});

async function seedRequestWithQuotes() {
  const user = await createUser({
    id: "user_cmp_1",
    email: "shipper@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    emailVerifiedAt: new Date().toISOString(),
  });
  const search = await runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const request: CommercialRequest = {
    id: "req_cmp_1",
    type: "QUOTE",
    userId: user.id,
    status: "RESPONSE_RECEIVED",
    searchContext: search.status === "active" ? search : createIdleSearchState(),
    origin: search.origin,
    destination: search.destination,
    cargo: { description: "steel", weightTons: 2000 },
    recipient: {
      contactId: "cc-alexandria-falcon",
      organizationName: "Falcon Freight Group",
      contactType: "BROKER",
      portId: "port-alexandria",
      portName: "Alexandria",
      email: "info@falconfg.com",
      sourceUrl: "https://www.falconfg.com/",
    },
    aiDraft: {
      subject: "RFQ",
      body: "Please quote",
      generator: "deterministic_template",
      generatedAt: now,
    },
    verifiedFreightRateAvailable: false,
    freightRateNote: NO_VERIFIED_RATE_NOTE,
    createdAt: now,
    updatedAt: now,
    sentAt: now,
  };
  await saveRequest(request);

  const msgA = newId("msg");
  const msgB = newId("msg");
  const msgC = newId("msg");
  for (const [id, from] of [
    [msgA, "broker-a@example.com"],
    [msgB, "broker-b@example.com"],
    [msgC, "broker-c@example.com"],
  ] as const) {
    await getRepositories().messages.create({
      id,
      commercialRequestId: request.id,
      direction: "INBOUND",
      provider: "fixture",
      providerMessageId: id,
      fromAddress: from,
      replyTo: "",
      toAddress: "request+tok@reply.test",
      subject: "Re: RFQ",
      bodySnapshot: "quote body",
      deliveryStatus: "RECEIVED",
      createdAt: now,
      receivedAt: now,
    });
  }

  const quoteA: CommercialQuote = {
    id: "quote_a",
    commercialRequestId: request.id,
    inboundMessageId: msgA,
    organizationName: "Broker A",
    currency: "USD",
    freightRate: 42,
    rateUnit: "MT",
    quantityTons: 2000,
    estimatedDeparture: "18–20 September",
    transitTime: "9 days",
    validityUntil: "15 September 2099",
    excludedCharges: "Port charges excluded",
    extractionConfidence: 0.85,
    extractionMethod: "deterministic",
    responseClassification: "QUOTE",
    quoteStatus: "PARSED",
    version: 1,
    isLatest: true,
    createdAt: now,
    updatedAt: now,
  };
  const quoteB: CommercialQuote = {
    id: "quote_b",
    commercialRequestId: request.id,
    inboundMessageId: msgB,
    organizationName: "Broker B",
    currency: "USD",
    freightRate: 45,
    rateUnit: "MT",
    quantityTons: 2000,
    estimatedDeparture: "17–19 September",
    transitTime: "7 days",
    validityUntil: "14 September 2099",
    includedCharges: "Port charges included",
    extractionConfidence: 0.8,
    extractionMethod: "deterministic",
    responseClassification: "QUOTE",
    quoteStatus: "PARSED",
    version: 1,
    isLatest: true,
    createdAt: now,
    updatedAt: now,
  };
  const quoteC: CommercialQuote = {
    id: "quote_c",
    commercialRequestId: request.id,
    inboundMessageId: msgC,
    organizationName: "Broker C",
    currency: "EUR",
    totalPrice: 80000,
    priceBasis: "lump_sum",
    estimatedDeparture: "21 September",
    transitTime: "10 days",
    validityUntil: "20 September 2099",
    extractionConfidence: 0.75,
    extractionMethod: "deterministic",
    responseClassification: "QUOTE",
    quoteStatus: "PARSED",
    version: 1,
    isLatest: true,
    createdAt: now,
    updatedAt: now,
  };

  await getRepositories().quotes.create(quoteA);
  await getRepositories().quotes.create(quoteB);
  await getRepositories().quotes.create(quoteC);

  return { user, request, quoteA, quoteB, quoteC };
}

describe("quote normalization", () => {
  it("calculates compatible MT rate × quantity", async () => {
    const { request, quoteA } = await seedRequestWithQuotes();
    const est = estimateFreightAmount({
      quote: quoteA,
      shipmentQuantityTons: request.cargo.weightTons,
    });
    expect(est.amount).toBe(84000);
    expect(normalizeRateUnit("MT")).toBe("MT");
  });

  it("handles lump sum and refuses incompatible mass/volume conversion", async () => {
    const { request, quoteC } = await seedRequestWithQuotes();
    const lump = estimateFreightAmount({ quote: quoteC });
    expect(lump.amount).toBe(80000);

    const bad = estimateFreightAmount({
      quote: {
        ...quoteC,
        totalPrice: null,
        priceBasis: null,
        freightRate: 10,
        rateUnit: "M3",
      },
      shipmentQuantityTons: request.cargo.weightTons,
    });
    expect(bad.amount).toBeNull();
  });

  it("marks EUR non-comparable without FX", async () => {
    const { request, quoteC } = await seedRequestWithQuotes();
    const n = normalizeCommercialQuote({ quote: quoteC, request });
    expect(n.priceComparable).toBe(false);
    expect(n.warnings.some((w) => /FX|currency/i.test(w))).toBe(true);
  });

  it("keeps completeness independent of extraction confidence", () => {
    const sparse: CommercialQuote = {
      id: "q",
      commercialRequestId: "r",
      inboundMessageId: "m",
      freightRate: 1,
      currency: "USD",
      rateUnit: "MT",
      extractionConfidence: 0.95,
      extractionMethod: "deterministic",
      responseClassification: "QUOTE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const complete: CommercialQuote = {
      ...sparse,
      estimatedDeparture: "18 Sep",
      transitTime: "9 days",
      validityUntil: "15 Sep",
      vesselName: "MV Test",
      excludedCharges: "ports",
      paymentTerms: "freight prepaid",
      extractionConfidence: 0.4,
    };
    expect(computeCompletenessScore(complete)).toBeGreaterThan(
      computeCompletenessScore(sparse),
    );
    expect(complete.extractionConfidence).toBeLessThan(sparse.extractionConfidence);
  });
});

describe("quote ranking", () => {
  it("identifies lowest cost, fastest transit, earliest departure", async () => {
    const { request, quoteA, quoteB, quoteC } = await seedRequestWithQuotes();
    const normalized = [quoteA, quoteB, quoteC].map((q) =>
      normalizeCommercialQuote({ quote: q, request }),
    );

    const lowest = rankQuotes({
      quotes: normalized,
      preference: "lowest_cost",
    });
    expect(lowest.recommendation?.organization).toBe("Broker A");

    const fastest = rankQuotes({
      quotes: normalized,
      preference: "fastest_transit",
    });
    expect(fastest.recommendation?.organization).toBe("Broker B");

    const earliest = rankQuotes({
      quotes: normalized,
      preference: "earliest_departure",
    });
    expect(earliest.recommendation?.organization).toBe("Broker B");
  });

  it("does not falsely compare EUR without FX in best overall price notes", async () => {
    const { user } = await seedRequestWithQuotes();
    const result = await compareQuotesForRequest({
      requestId: "req_cmp_1",
      userId: user.id,
      preference: "best_overall",
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.stats.comparablePrices).toBe(2);
    expect(result.ranking.summaryNotes.some((n) => n.includes("2 of 3"))).toBe(true);
    const c = result.normalized.find((n) => n.organization === "Broker C");
    expect(c?.priceComparable).toBe(false);
  });

  it("uses FX when enabled for EUR lump sum", async () => {
    process.env.FX_ENABLED = "true";
    process.env.FX_RATES_JSON = JSON.stringify({ EUR: 1.1, USD: 1 });
    process.env.FX_SOURCE = "test_fixture";
    process.env.FX_RATES_AS_OF = "2026-09-10T00:00:00.000Z";
    const { request, quoteC } = await seedRequestWithQuotes();
    const n = normalizeCommercialQuote({ quote: quoteC, request });
    expect(n.priceComparable).toBe(true);
    expect(n.normalizedTotal).toBe(88000);
    expect(n.fxApplied).toBe(true);
  });
});

describe("revisions and corrections", () => {
  it("preserves superseded quote and prefers latest", async () => {
    const { user, request, quoteA } = await seedRequestWithQuotes();
    const revised: CommercialQuote = {
      ...quoteA,
      id: "quote_a_v2",
      freightRate: 39,
      version: 2,
      supersedesQuoteId: quoteA.id,
      isLatest: true,
      inboundMessageId: newId("msg"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await getRepositories().quotes.update({
      ...quoteA,
      isLatest: false,
      quoteStatus: "SUPERSEDED",
    });
    await getRepositories().quotes.create(revised);

    const result = await compareQuotesForRequest({
      requestId: request.id,
      userId: user.id,
      preference: "lowest_cost",
    });
    if ("error" in result) throw new Error(result.error);
    const orgs = result.ranking.ranked
      .filter((r) => r.normalized.isLatest)
      .map((r) => r.normalized.organization);
    expect(orgs).toContain("Broker A");
    const a = result.normalized.find((n) => n.quoteId === "quote_a_v2");
    expect(a?.rate).toBe(39);
    expect(result.normalized.some((n) => n.quoteId === "quote_a" && !n.isLatest)).toBe(
      true,
    );
  });

  it("applies manual correction with provenance", async () => {
    const { user, quoteA } = await seedRequestWithQuotes();
    const result = await correctCommercialQuote({
      quoteId: quoteA.id,
      userId: user.id,
      patch: { freightRate: 40 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.freightRate).toBe(40);
    expect(result.quote.corrections?.[0].originalValue).toBe(42);
    expect(result.quote.quoteStatus).toBe("REVIEWED");

    const denied = await correctCommercialQuote({
      quoteId: quoteA.id,
      userId: "other_user",
      patch: { freightRate: 1 },
    });
    expect(denied.ok).toBe(false);
  });

  it("detects expired quotes", async () => {
    const { request, quoteA } = await seedRequestWithQuotes();
    const n = normalizeCommercialQuote({
      quote: { ...quoteA, validityUntil: "01 January 2020" },
      request,
      now: new Date("2026-09-10"),
    });
    expect(n.expiryState).toBe("expired");
  });
});

describe("compare access control", () => {
  it("blocks other users from comparing", async () => {
    await seedRequestWithQuotes();
    const result = await compareQuotesForRequest({
      requestId: "req_cmp_1",
      userId: "intruder",
      preference: "best_overall",
    });
    expect("error" in result).toBe(true);
  });
});
