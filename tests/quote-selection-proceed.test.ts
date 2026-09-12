import { beforeEach, describe, expect, it } from "vitest";
import {
  createUser,
  resetCommercialStoreForTests,
  saveRequest,
} from "@/server/commercial/store";
import { hashPassword } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { selectCommercialQuote } from "@/server/commercial/proceed/selectQuote";
import { prepareProceedRequest } from "@/server/commercial/proceed/prepareProceed";
import {
  resetProceedRateLimitsForTests,
  sendProceedRequest,
} from "@/server/commercial/proceed/sendProceed";
import { generateProceedMessage } from "@/server/commercial/proceed/generateProceedMessage";
import { buildProceedSnapshot } from "@/server/commercial/proceed/generateProceedMessage";
import { correctCommercialQuote } from "@/server/commercial/comparison/correctQuote";
import { classifyProceedReply } from "@/server/commercial/proceed/classifyProceedReply";
import {
  NO_VERIFIED_RATE_NOTE,
  type CommercialQuote,
  type CommercialRequest,
} from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.EMAIL_FROM_NAME = "CargoConnect";
  delete process.env.EMAIL_INBOUND_ENABLED;
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
});

async function seedRotterdamAlexandria() {
  const user = await createUser({
    id: "user_proceed_1",
    email: "shipper@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    companyName: "Ada Shipping",
    phone: "+10000000000",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_proceed_other",
    email: "other@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Other User",
    emailVerifiedAt: new Date().toISOString(),
  });

  const search = await runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const request: CommercialRequest = {
    id: "req_proceed_1",
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
  await getRepositories().messages.create({
    id: msgA,
    commercialRequestId: request.id,
    direction: "INBOUND",
    provider: "fixture",
    providerMessageId: msgA,
    fromAddress: "broker-a@example.com",
    fromName: "Broker A",
    replyTo: "",
    toAddress: "request+tok@reply.test",
    subject: "Re: RFQ",
    bodySnapshot:
      "USD 42 / MT. Est freight USD 84000. Transit 9 days. Laycan 18–20 September. Valid until 15 September 2099. Port charges excluded.",
    deliveryStatus: "RECEIVED",
    createdAt: now,
    receivedAt: now,
  });

  const quoteA: CommercialQuote = {
    id: "quote_broker_a",
    commercialRequestId: request.id,
    inboundMessageId: msgA,
    organizationName: "Broker A",
    contactId: "cc-alexandria-falcon",
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
  await getRepositories().quotes.create(quoteA);

  return {
    user,
    other,
    request,
    quoteA,
    session: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      companyName: user.companyName,
      phone: user.phone,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
    },
  };
}

describe("quote selection", () => {
  it("selects a valid quote and persists selection", async () => {
    const { user, request, quoteA } = await seedRotterdamAlexandria();
    const result = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
      preferenceSnapshot: "best_overall",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe("QUOTE_SELECTED");
    expect(result.selection.commercialQuoteId).toBe(quoteA.id);
    expect(result.selection.active).toBe(true);

    const stored = await getRepositories().selections.getActiveForRequest(
      request.id,
    );
    expect(stored?.id).toBe(result.selection.id);
  });

  it("cannot select another user’s quote/request", async () => {
    const { other, request, quoteA } = await seedRotterdamAlexandria();
    const result = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: other.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("rejects expired quotes", async () => {
    const { user, request, quoteA } = await seedRotterdamAlexandria();
    await getRepositories().quotes.update({
      ...quoteA,
      validityUntil: "1 January 2020",
      updatedAt: new Date().toISOString(),
    });
    const result = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("quote_expired");
  });

  it("rejects superseded quotes", async () => {
    const { user, request, quoteA } = await seedRotterdamAlexandria();
    await getRepositories().quotes.update({
      ...quoteA,
      isLatest: false,
      quoteStatus: "SUPERSEDED",
      updatedAt: new Date().toISOString(),
    });
    const result = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("quote_superseded");
  });

  it("allows selection change before proceed send", async () => {
    const { user, request, quoteA } = await seedRotterdamAlexandria();
    const msgB = newId("msg");
    const now = new Date().toISOString();
    await getRepositories().messages.create({
      id: msgB,
      commercialRequestId: request.id,
      direction: "INBOUND",
      provider: "fixture",
      providerMessageId: msgB,
      fromAddress: "broker-b@example.com",
      replyTo: "",
      toAddress: "request+tok@reply.test",
      subject: "Re: RFQ",
      bodySnapshot: "USD 45",
      deliveryStatus: "RECEIVED",
      createdAt: now,
      receivedAt: now,
    });
    const quoteB: CommercialQuote = {
      ...quoteA,
      id: "quote_broker_b",
      inboundMessageId: msgB,
      organizationName: "Broker B",
      freightRate: 45,
    };
    await getRepositories().quotes.create(quoteB);

    const first = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    expect(first.ok).toBe(true);
    const second = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteB.id,
      userId: user.id,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.selection.commercialQuoteId).toBe(quoteB.id);
    const active = await getRepositories().selections.getActiveForRequest(
      request.id,
    );
    expect(active?.commercialQuoteId).toBe(quoteB.id);
    const audits = await getRepositories().audits.listForRequest(request.id);
    expect(audits.some((a) => a.eventType === "QUOTE_SELECTION_CHANGED")).toBe(
      true,
    );
  });

  it("locks selection after proceed send", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const sent = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.request.status).toBe("AWAITING_CONFIRMATION");

    const change = await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    expect(change.ok).toBe(false);
    if (change.ok) return;
    expect(change.code).toBe("selection_locked");
  });
});

describe("proceed snapshot + messaging", () => {
  it("snapshot matches selected Broker A facts and excludes fabrications", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const snap = prepared.proceed.snapshot;
    expect(snap.rate).toBe(42);
    expect(snap.currency).toBe("USD");
    expect(snap.estimatedFreight).toBe(84000);
    expect(snap.transit).toBe("9 days");
    expect(snap.departure).toBe("18–20 September");
    expect(snap.excludedCharges).toContain("Port charges");
    expect(snap.vesselName == null || snap.vesselName === "").toBe(true);

    expect(prepared.draft.body).toContain("USD 42");
    expect(prepared.draft.body).toContain("84,000");
    expect(prepared.draft.body).toContain("Port charges excluded");
    expect(prepared.draft.body).toContain(
      "subject to your confirmation",
    );
    expect(prepared.draft.subject.toLowerCase()).toContain("request to proceed");
  });

  it("later quote correction does not mutate sent snapshot", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    if (!prepared.ok) throw new Error("prepare failed");
    const sent = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const frozen = structuredClone(sent.proceed.snapshot);

    await correctCommercialQuote({
      quoteId: quoteA.id,
      userId: user.id,
      patch: { freightRate: 99 },
    });

    const proceed = await getRepositories().proceedRequests.get(
      sent.proceed.id,
    );
    expect(proceed?.snapshot.rate).toBe(frozen.rate);
    expect(proceed?.snapshot.rate).toBe(42);
    expect(proceed?.snapshot.estimatedFreight).toBe(84000);
  });

  it("generateProceedMessage does not invent missing fields", async () => {
    const { request, quoteA } = await seedRotterdamAlexandria();
    const snap = buildProceedSnapshot({
      quote: {
        ...quoteA,
        freightRate: 42,
        currency: "USD",
        rateUnit: "MT",
        estimatedDeparture: undefined,
        transitTime: undefined,
        vesselName: undefined,
        paymentTerms: undefined,
        includedCharges: undefined,
        excludedCharges: undefined,
      },
      request,
    });
    const msg = generateProceedMessage({
      request,
      snapshot: snap,
      requester: { fullName: "Ada", email: "a@example.com" },
    });
    expect(msg.body).not.toMatch(/Vessel:/);
    expect(msg.body).not.toMatch(/Payment terms:/);
    expect(msg.body).not.toMatch(/Laycan/);
  });
});

describe("proceed send", () => {
  it("sends proceed and reaches AWAITING_CONFIRMATION (log mode)", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    if (!prepared.ok) throw new Error("prepare failed");
    const sent = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.request.status).toBe("AWAITING_CONFIRMATION");
    expect(sent.proceed.status).toBe("DELIVERY_SIMULATED");
    expect(sent.simulated).toBe(true);

    const messages = await getRepositories().messages.listForRequest(request.id);
    const outbound = messages.find((m) => m.messageKind === "PROCEED_REQUEST");
    expect(outbound).toBeTruthy();
    expect(outbound?.toAddress).toBe("broker-a@example.com");
  });

  it("duplicate send is idempotent", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    if (!prepared.ok) throw new Error("prepare failed");
    const first = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    const second = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.alreadySent).toBe(true);
    const proceedMsgs = (
      await getRepositories().messages.listForRequest(request.id)
    ).filter((m) => m.messageKind === "PROCEED_REQUEST");
    expect(proceedMsgs).toHaveLength(1);
  });

  it("blocks expired quote on server recheck", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    if (!prepared.ok) throw new Error("prepare failed");
    await getRepositories().quotes.update({
      ...quoteA,
      validityUntil: "1 January 2020",
      updatedAt: new Date().toISOString(),
    });
    const sent = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    expect(sent.ok).toBe(false);
    if (sent.ok) return;
    expect(sent.code).toBe("QUOTE_EXPIRED");
  });

  it("blocks superseded quote on server recheck", async () => {
    const { user, session, request, quoteA } = await seedRotterdamAlexandria();
    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: session,
    });
    if (!prepared.ok) throw new Error("prepare failed");
    await getRepositories().quotes.update({
      ...quoteA,
      isLatest: false,
      quoteStatus: "SUPERSEDED",
      updatedAt: new Date().toISOString(),
    });
    const sent = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: session,
    });
    expect(sent.ok).toBe(false);
    if (sent.ok) return;
    expect(sent.code).toBe("quote_superseded");
  });

  it("blocks unverified user in live mode", async () => {
    process.env.EMAIL_DELIVERY_MODE = "live";
    process.env.EMAIL_API_KEY = "re_test_key";
    const { session, request, quoteA, user } = await seedRotterdamAlexandria();
    const u = await getRepositories().users.findById(user.id);
    if (u) (u as { emailVerifiedAt: string | null }).emailVerifiedAt = null;

    await selectCommercialQuote({
      requestId: request.id,
      quoteId: quoteA.id,
      userId: user.id,
    });
    const prepared = await prepareProceedRequest({
      requestId: request.id,
      user: { ...session, emailVerifiedAt: null },
    });
    if (!prepared.ok) throw new Error("prepare failed");
    const sent = await sendProceedRequest({
      requestId: request.id,
      proceedId: prepared.proceed.id,
      user: { ...session, emailVerifiedAt: null },
    });
    expect(sent.ok).toBe(false);
    if (sent.ok) return;
    expect(sent.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("rejects arbitrary quote id not on request", async () => {
    const { user, request } = await seedRotterdamAlexandria();
    const result = await selectCommercialQuote({
      requestId: request.id,
      quoteId: "quote_fake_other",
      userId: user.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });
});

describe("proceed reply classification prep", () => {
  it("classifies confirmation language without booking transition", () => {
    expect(classifyProceedReply("We confirm capacity and can proceed.")).toBe(
      "PROCEED_CONFIRMED",
    );
    expect(classifyProceedReply("We must decline this request.")).toBe(
      "PROCEED_REJECTED",
    );
    expect(classifyProceedReply("Please provide more information.")).toBe(
      "MORE_INFORMATION_REQUIRED",
    );
    expect(classifyProceedReply("Revised rate is now USD 50.")).toBe(
      "TERMS_CHANGED",
    );
  });
});
