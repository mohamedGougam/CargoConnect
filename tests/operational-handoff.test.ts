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
import { acknowledgeCommercialConfirmation } from "@/server/commercial/confirmation/acknowledgeConfirmation";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import { uploadBookingDocument } from "@/server/documents/uploadDocument";
import { markBookingReadyForOperations } from "@/server/documents/markReady";
import { resetDocumentStorageForTests } from "@/server/documents/storage";
import { createOrRegenerateHandoff } from "@/server/handoff/createHandoff";
import { finalizeOperationalHandoff } from "@/server/handoff/finalizeHandoff";
import { generateHandoffPdf } from "@/server/handoff/generatePdf";
import { detectNewerDocumentsThanHandoff } from "@/server/handoff/buildHandoff";
import {
  NO_VERIFIED_RATE_NOTE,
  type CommercialQuote,
  type CommercialRequest,
} from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import { rm } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

const CLEAN = `Dear Mohamed,
Confirmed as per your request at USD 42/MT for 2,000 MT steel.
Laycan 18–20 September.
MV Atlas nominated.
Booking reference AX9384.
Regards`;

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.DOCUMENT_STORAGE_PROVIDER = "local";
  process.env.DOCUMENT_STORAGE_LOCAL_DIR = path.join(
    process.cwd(),
    ".data",
    "documents-test-handoff",
  );
  resetDocumentStorageForTests();
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
  await rm(process.env.DOCUMENT_STORAGE_LOCAL_DIR, {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

async function seedReadyBooking() {
  const user = await createUser({
    id: "user_ho_1",
    email: "shipper-ho@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_ho_other",
    email: "other-ho@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Other",
    emailVerifiedAt: new Date().toISOString(),
  });
  const search = runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const replyToken = "handoffreplytoken12345678901";
  const request: CommercialRequest = {
    id: "req_ho_1",
    type: "QUOTE",
    userId: user.id,
    status: "RESPONSE_RECEIVED",
    searchContext: search.status === "active" ? search : createIdleSearchState(),
    origin: search.origin,
    destination: search.destination,
    cargo: { description: "steel", weightTons: 2000 },
    replyToken,
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
    replyTo: "",
    toAddress: `request+${replyToken}@reply.test`,
    subject: "Re: RFQ",
    bodySnapshot: "Quote attached",
    deliveryStatus: "RECEIVED",
    createdAt: now,
    receivedAt: now,
  });
  const quoteA: CommercialQuote = {
    id: "quote_ho_a",
    commercialRequestId: request.id,
    inboundMessageId: msgA,
    organizationName: "Broker A",
    contactId: "cc-alexandria-falcon",
    currency: "USD",
    freightRate: 42,
    rateUnit: "MT",
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
  if (!sent.ok) throw new Error("send failed");

  await processInboundEmail({
    provider: "fixture",
    providerMessageId: "ho_clean_1",
    fromAddress: "broker-a@example.com",
    toAddresses: [`request+${replyToken}@reply.test`],
    subject: "Re: Request to proceed",
    textBody: CLEAN,
  });
  const conf = await getRepositories().confirmations.getLatestForRequest(
    request.id,
  );
  const ack = await acknowledgeCommercialConfirmation({
    requestId: request.id,
    confirmationId: conf!.id,
    userId: user.id,
  });
  if (!ack.ok) throw new Error("ack failed");

  const reqs = await getRepositories().documentRequirements.listForBooking(
    ack.booking.id,
  );
  for (const req of reqs.filter((r) => r.required)) {
    const body =
      req.documentType === "PACKING_LIST"
        ? "Packing list 2,000 MT steel"
        : "Commercial document 2,000 MT steel Rotterdam Alexandria";
    const up = await uploadBookingDocument({
      bookingId: ack.booking.id,
      userId: user.id,
      requirementId: req.id,
      documentType: req.documentType,
      filename: `${req.documentType}.txt`,
      contentType: "text/plain",
      body: Buffer.from(body),
    });
    if (!up.ok) throw new Error(`upload ${req.documentType} failed`);
  }

  const ready = await markBookingReadyForOperations({
    bookingId: ack.booking.id,
    userId: user.id,
  });
  if (!ready.ok) throw new Error("ready failed");

  return { user, other, booking: ready.booking, request: sent.request };
}

describe("operational handoff", () => {
  it("blocks creation before READY_FOR_OPERATIONS and wrong user", async () => {
    const seeded = await seedReadyBooking();
    const booking = await getRepositories().bookings.get(seeded.booking.id);
    await getRepositories().bookings.update({
      ...booking!,
      status: "DOCUMENTS_PENDING",
      updatedAt: new Date().toISOString(),
    });

    const blocked = await createOrRegenerateHandoff({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("HANDOFF_NOT_READY");

    await getRepositories().bookings.update({
      ...booking!,
      status: "READY_FOR_OPERATIONS",
      updatedAt: new Date().toISOString(),
    });

    const cross = await createOrRegenerateHandoff({
      bookingId: seeded.booking.id,
      userId: seeded.other.id,
    });
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.code).toBe("not_found");
  });

  it("copies booking/commercial/document snapshot with provenance", async () => {
    const { user, booking } = await seedReadyBooking();
    const created = await createOrRegenerateHandoff({
      bookingId: booking.id,
      userId: user.id,
      operationalNotes: "notify terminal 24h before arrival",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const h = created.handoff;
    expect(h.status).toBe("READY_FOR_REVIEW");
    expect(h.handoffReference).toMatch(/^HO-CC-\d{4}-\d{6}-V1$/);
    expect(h.bookingSnapshot.bookingReference).toBe(booking.bookingReference);
    expect(h.commercialSnapshot.rate).toBe(42);
    expect(h.commercialSnapshot.currency).toBe("USD");
    expect(h.shipmentSnapshot.origin?.toLowerCase()).toContain("rotterdam");
    expect(h.shipmentSnapshot.destination?.toLowerCase()).toContain(
      "alexandria",
    );
    expect(h.shipmentSnapshot.quantityTons).toBe(2000);
    expect(h.vesselSnapshot.vesselName).toMatch(/Atlas/i);
    expect(h.documentManifest.some((d) => d.documentType === "PACKING_LIST" && d.uploaded)).toBe(
      true,
    );
    expect(
      h.documentManifest.find((d) => d.documentType === "CERTIFICATE_OF_ORIGIN")
        ?.uploaded,
    ).toBe(false);
    expect(h.missingInformation.some((m) => m.code === "LOADING_TERMINAL_UNSPECIFIED")).toBe(
      true,
    );
    expect(h.provenance.some((p) => p.field === "rate")).toBe(true);
    expect(h.operationalNotes).toContain("notify terminal");
    expect(h.operationalSummary).toContain("2,000");
    expect(JSON.stringify(h)).not.toMatch(/storageKey|DOCUMENT_STORAGE/);
  });

  it("requires acknowledgements path; finalize is idempotent and immutable", async () => {
    const { user, booking } = await seedReadyBooking();
    const created = await createOrRegenerateHandoff({
      bookingId: booking.id,
      userId: user.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const fin = await finalizeOperationalHandoff({
      bookingId: booking.id,
      handoffId: created.handoff.id,
      userId: user.id,
    });
    expect(fin.ok).toBe(true);
    if (!fin.ok) return;
    expect(fin.handoff.status).toBe("FINALIZED");
    expect(fin.handoff.finalizedAt).toBeTruthy();

    const again = await finalizeOperationalHandoff({
      bookingId: booking.id,
      handoffId: created.handoff.id,
      userId: user.id,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.alreadyFinalized).toBe(true);

    const snap = structuredClone(fin.handoff);
    const regenerated = await createOrRegenerateHandoff({
      bookingId: booking.id,
      userId: user.id,
      forceNewVersion: true,
    });
    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) return;
    expect(regenerated.handoff.version).toBe(2);
    expect(regenerated.handoff.supersedesHandoffId).toBe(fin.handoff.id);

    const v1 = await getRepositories().handoffs.get(fin.handoff.id);
    expect(v1?.status).toBe("FINALIZED");
    expect(v1?.commercialSnapshot.rate).toBe(snap.commercialSnapshot.rate);
    expect(v1?.documentManifest).toEqual(snap.documentManifest);
  });

  it("document replacement after finalize does not mutate v1; enables v2", async () => {
    const { user, booking } = await seedReadyBooking();
    const created = await createOrRegenerateHandoff({
      bookingId: booking.id,
      userId: user.id,
    });
    if (!created.ok) throw new Error("create failed");
    const fin = await finalizeOperationalHandoff({
      bookingId: booking.id,
      handoffId: created.handoff.id,
      userId: user.id,
    });
    if (!fin.ok) throw new Error("finalize failed");

    const pl = await uploadBookingDocument({
      bookingId: booking.id,
      userId: user.id,
      documentType: "PACKING_LIST",
      filename: "packing-v3.txt",
      contentType: "text/plain",
      body: Buffer.from("Packing list 2,000 MT steel corrected v3"),
    });
    expect(pl.ok).toBe(true);
    if (!pl.ok) return;
    expect(pl.document.version).toBeGreaterThanOrEqual(2);

    const v1 = await getRepositories().handoffs.get(fin.handoff.id);
    const plEntry = v1?.documentManifest.find(
      (d) => d.documentType === "PACKING_LIST",
    );
    expect(plEntry?.documentId).not.toBe(pl.document.id);
    expect(await detectNewerDocumentsThanHandoff(v1!)).toBe(true);

    const v2 = await createOrRegenerateHandoff({
      bookingId: booking.id,
      userId: user.id,
      forceNewVersion: true,
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.handoff.version).toBe(2);
    const pl2 = v2.handoff.documentManifest.find(
      (d) => d.documentType === "PACKING_LIST",
    );
    expect(pl2?.documentId).toBe(pl.document.id);
  });

  it("PDF includes booking reference, rate, manifest; no storage keys; cross-user denied", async () => {
    const { user, other, booking } = await seedReadyBooking();
    const created = await createOrRegenerateHandoff({
      bookingId: booking.id,
      userId: user.id,
    });
    if (!created.ok) throw new Error("create failed");
    const fin = await finalizeOperationalHandoff({
      bookingId: booking.id,
      handoffId: created.handoff.id,
      userId: user.id,
    });
    if (!fin.ok) throw new Error("finalize failed");

    const pdf = await generateHandoffPdf({
      handoff: fin.handoff,
      userId: user.id,
    });
    expect(pdf.filename).toContain(booking.bookingReference);
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(Buffer.from(pdf.bytes).subarray(0, 4).toString("utf8")).toBe("%PDF");

    const loaded = await PDFDocument.load(pdf.bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.getTitle()).toContain(fin.handoff.handoffReference);
    expect(loaded.getSubject()).toContain(booking.bookingReference);
    expect(loaded.getSubject()).toContain("USD");
    expect(loaded.getSubject()).toContain("42");
    expect(fin.handoff.documentManifest.some((d) => d.label.includes("Packing"))).toBe(
      true,
    );
    expect(JSON.stringify(fin.handoff)).not.toMatch(/storageKey|DOCUMENT_STORAGE/);
    expect(fin.handoff.operationalSummary).toBeTruthy();

    await expect(
      generateHandoffPdf({ handoff: fin.handoff, userId: other.id }),
    ).rejects.toThrow(/Forbidden/);

    const missing = await finalizeOperationalHandoff({
      bookingId: booking.id,
      handoffId: "handoff_does_not_exist",
      userId: user.id,
    });
    expect(missing.ok).toBe(false);
  });
});
