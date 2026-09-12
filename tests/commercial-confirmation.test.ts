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
import { classifyProceedReply } from "@/server/commercial/proceed/classifyProceedReply";
import { extractConfirmationFields } from "@/server/commercial/confirmation/extractConfirmation";
import { compareConfirmationToSnapshot } from "@/server/commercial/confirmation/compareConfirmation";
import { acknowledgeCommercialConfirmation } from "@/server/commercial/confirmation/acknowledgeConfirmation";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import {
  NO_VERIFIED_RATE_NOTE,
  type CommercialQuote,
  type CommercialRequest,
  type ProceedSnapshot,
} from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

const CLEAN_CONFIRMATION = `Dear Mohamed,

Confirmed as per your request at USD 42/MT for 2,000 MT steel.
Laycan 18–20 September.
MV Atlas nominated.
Booking reference AX9384.

Regards`;

const PRICE_CHANGE = `We can proceed, however final rate is USD 45/MT.`;

const REJECTION = `Unfortunately the vessel is no longer available.`;

const MORE_INFO = `Please provide package dimensions before we confirm.`;

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.EMAIL_FROM_NAME = "CargoConnect";
  delete process.env.EMAIL_INBOUND_ENABLED;
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
});

async function seedAwaitingConfirmation() {
  const user = await createUser({
    id: "user_conf_1",
    email: "shipper@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    companyName: "Ada Shipping",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_conf_other",
    email: "other@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Other",
    emailVerifiedAt: new Date().toISOString(),
  });

  const search = runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const request: CommercialRequest = {
    id: "req_conf_1",
    type: "QUOTE",
    userId: user.id,
    status: "RESPONSE_RECEIVED",
    searchContext: search.status === "active" ? search : createIdleSearchState(),
    origin: search.origin,
    destination: search.destination,
    cargo: { description: "steel", weightTons: 2000 },
    replyToken: "testreplytoken1234567890ab",
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
    toAddress: "request+testreplytoken1234567890ab@reply.test",
    subject: "Re: RFQ",
    bodySnapshot: "USD 42 / MT quote",
    deliveryStatus: "RECEIVED",
    senderTrust: "EXPECTED_SENDER",
    createdAt: now,
    receivedAt: now,
  });

  const quoteA: CommercialQuote = {
    id: "quote_conf_a",
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

  const session = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    companyName: user.companyName,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
  };

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
  if (!sent.ok) throw new Error("send proceed failed");

  return {
    user,
    other,
    session,
    request: sent.request,
    quoteA,
    proceed: sent.proceed,
    snapshot: sent.proceed.snapshot as ProceedSnapshot,
  };
}

async function inboundConfirm(body: string, providerMessageId: string) {
  return processInboundEmail({
    provider: "fixture",
    providerMessageId,
    fromAddress: "broker-a@example.com",
    fromName: "Broker A",
    toAddresses: ["request+testreplytoken1234567890ab@reply.test"],
    subject: "Re: Request to proceed",
    textBody: body,
  });
}

describe("proceed reply classification fixtures", () => {
  it("classifies clean confirmation", () => {
    expect(classifyProceedReply(CLEAN_CONFIRMATION)).toBe("PROCEED_CONFIRMED");
  });

  it("classifies price change as TERMS_CHANGED", () => {
    expect(classifyProceedReply(PRICE_CHANGE)).toBe("TERMS_CHANGED");
  });

  it("classifies rejection", () => {
    expect(classifyProceedReply(REJECTION)).toBe("PROCEED_REJECTED");
  });

  it("classifies more-info request", () => {
    expect(classifyProceedReply(MORE_INFO)).toBe("MORE_INFORMATION_REQUIRED");
  });

  it("classifies ambiguous reply", () => {
    expect(classifyProceedReply("Thanks, noted.")).toBe("GENERAL_REPLY");
  });
});

describe("confirmation comparison", () => {
  it("matches clean confirmation against snapshot", () => {
    const snapshot: ProceedSnapshot = {
      quoteId: "q",
      quoteVersion: 1,
      organization: "Broker A",
      currency: "USD",
      rate: 42,
      rateUnit: "MT",
      estimatedFreight: 84000,
      departure: "18–20 September",
      transit: "9 days",
      excludedCharges: "Port charges excluded",
      inboundMessageId: "m",
      capturedAt: new Date().toISOString(),
    };
    const extracted = extractConfirmationFields({
      subject: "Re:",
      textBody: CLEAN_CONFIRMATION,
      snapshot,
    });
    expect(extracted.confirmedRate).toBe(42);
    expect(extracted.bookingReference).toBe("AX9384");
    expect(extracted.vesselName?.toLowerCase()).toContain("atlas");

    const compare = compareConfirmationToSnapshot({
      snapshot,
      extracted,
      requestOrigin: "Rotterdam",
      requestDestination: "Alexandria",
      requestQuantityTons: 2000,
    });
    expect(compare.hasMaterialChange).toBe(false);
    expect(compare.termsChanged).toBe(false);
  });

  it("detects changed rate", () => {
    const snapshot: ProceedSnapshot = {
      quoteId: "q",
      quoteVersion: 1,
      organization: "Broker A",
      currency: "USD",
      rate: 42,
      rateUnit: "MT",
      inboundMessageId: "m",
      capturedAt: new Date().toISOString(),
    };
    const extracted = extractConfirmationFields({
      subject: "Re:",
      textBody: PRICE_CHANGE,
      snapshot,
    });
    const compare = compareConfirmationToSnapshot({ snapshot, extracted });
    expect(compare.hasMaterialChange).toBe(true);
    expect(compare.diffs.some((d) => d.field === "rate")).toBe(true);
  });

  it("detects changed currency", () => {
    const snapshot: ProceedSnapshot = {
      quoteId: "q",
      quoteVersion: 1,
      organization: "Broker A",
      currency: "USD",
      rate: 42,
      rateUnit: "MT",
      inboundMessageId: "m",
      capturedAt: new Date().toISOString(),
    };
    const extracted = extractConfirmationFields({
      subject: "Re:",
      textBody: "Confirmed at EUR 42/MT.",
      snapshot,
    });
    const compare = compareConfirmationToSnapshot({ snapshot, extracted });
    expect(compare.diffs.some((d) => d.field === "currency")).toBe(true);
  });

  it("does not invent a change from missing fields", () => {
    const snapshot: ProceedSnapshot = {
      quoteId: "q",
      quoteVersion: 1,
      organization: "Broker A",
      currency: "USD",
      rate: 42,
      rateUnit: "MT",
      departure: "18–20 September",
      paymentTerms: "Net 30",
      inboundMessageId: "m",
      capturedAt: new Date().toISOString(),
    };
    const extracted = extractConfirmationFields({
      subject: "Re:",
      textBody: "Confirmed as per your request at USD 42/MT.",
      snapshot,
    });
    const compare = compareConfirmationToSnapshot({ snapshot, extracted });
    expect(compare.diffs.some((d) => d.field === "paymentTerms")).toBe(false);
    expect(compare.diffs.some((d) => d.field === "departure")).toBe(false);
  });
});

describe("confirmation → booking flow", () => {
  it("clean confirmation requires user ack to create booking", async () => {
    const seeded = await seedAwaitingConfirmation();
    expect(seeded.request.status).toBe("AWAITING_CONFIRMATION");

    const inbound = await inboundConfirm(CLEAN_CONFIRMATION, "inb_clean_1");
    expect(inbound.ok).toBe(true);

    const request = await getRepositories().requests.get(seeded.request.id);
    expect(request?.status).toBe("CONFIRMATION_REVIEW_REQUIRED");
    expect(request?.confirmationStatus).toBe("PROCEED_CONFIRMED");
    expect(request?.bookingId).toBeFalsy();

    const confirmation = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    expect(confirmation?.termsChanged).toBe(false);
    expect(confirmation?.bookingReference).toBe("AX9384");
    expect(confirmation?.vesselName?.toLowerCase()).toContain("atlas");

    const before = await getRepositories().bookings.getForRequest(seeded.request.id);
    expect(before).toBeUndefined();

    const ack = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: confirmation!.id,
      userId: seeded.user.id,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.request.status).toBe("COMMERCIALLY_CONFIRMED");
    expect(ack.booking.bookingReference).toMatch(/^CC-\d{4}-\d{6}$/);
    expect(ack.booking.externalBookingReference).toBe("AX9384");
    expect(ack.booking.commercialSnapshot.rate).toBe(42);
    expect(["COMMERCIALLY_CONFIRMED", "DOCUMENTS_PENDING"]).toContain(
      ack.booking.status,
    );
  });

  it("duplicate acknowledgement does not create duplicate booking", async () => {
    const seeded = await seedAwaitingConfirmation();
    await inboundConfirm(CLEAN_CONFIRMATION, "inb_clean_dup");
    const confirmation = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    const first = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: confirmation!.id,
      userId: seeded.user.id,
    });
    const second = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: confirmation!.id,
      userId: seeded.user.id,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.alreadyConfirmed).toBe(true);
    expect(second.booking.id).toBe(first.booking.id);
    const all = await getRepositories().bookings.listForUser(seeded.user.id);
    expect(all).toHaveLength(1);
  });

  it("changed terms do not create booking", async () => {
    const seeded = await seedAwaitingConfirmation();
    await inboundConfirm(PRICE_CHANGE, "inb_price");
    const request = await getRepositories().requests.get(seeded.request.id);
    expect(request?.status).toBe("TERMS_CHANGED");
    const confirmation = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    expect(confirmation?.classification).toBe("TERMS_CHANGED");
    expect(confirmation?.termsChanged).toBe(true);

    const ack = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: confirmation!.id,
      userId: seeded.user.id,
    });
    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe("terms_changed");
    expect(await getRepositories().bookings.getForRequest(seeded.request.id)).toBeUndefined();
  });

  it("rejection does not create booking", async () => {
    const seeded = await seedAwaitingConfirmation();
    await inboundConfirm(REJECTION, "inb_rej");
    const request = await getRepositories().requests.get(seeded.request.id);
    expect(request?.status).toBe("CONFIRMATION_REJECTED");
    expect(await getRepositories().bookings.getForRequest(seeded.request.id)).toBeUndefined();
  });

  it("only request owner may acknowledge", async () => {
    const seeded = await seedAwaitingConfirmation();
    await inboundConfirm(CLEAN_CONFIRMATION, "inb_own");
    const confirmation = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    const ack = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: confirmation!.id,
      userId: seeded.other.id,
    });
    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe("not_found");
  });

  it("booking snapshot stays immutable if confirmation record is later updated", async () => {
    const seeded = await seedAwaitingConfirmation();
    await inboundConfirm(CLEAN_CONFIRMATION, "inb_immut");
    const confirmation = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    const ack = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: confirmation!.id,
      userId: seeded.user.id,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;

    await getRepositories().confirmations.update({
      ...confirmation!,
      confirmedRate: 999,
      updatedAt: new Date().toISOString(),
    });
    const booking = await getRepositories().bookings.get(ack.booking.id);
    expect(booking?.confirmationSnapshot.confirmedRate).toBe(42);
    expect(booking?.commercialSnapshot.rate).toBe(42);
  });
});
