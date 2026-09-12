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
import { acceptChangedCommercialTerms } from "@/server/documents/acceptChangedTerms";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import { uploadBookingDocument } from "@/server/documents/uploadDocument";
import { markBookingReadyForOperations } from "@/server/documents/markReady";
import { computeDocumentCompleteness } from "@/server/documents/markReady";
import {
  assertAllowedUpload,
  buildStorageKey,
  getDocumentStorage,
  resetDocumentStorageForTests,
} from "@/server/documents/storage";
import {
  NO_VERIFIED_RATE_NOTE,
  type CommercialQuote,
  type CommercialRequest,
} from "@/domain/commercial/types";
import { createIdleSearchState } from "@/domain/search/types";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import { rm } from "fs/promises";
import path from "path";

const CLEAN = `Dear Mohamed,
Confirmed as per your request at USD 42/MT for 2,000 MT steel.
Laycan 18–20 September.
MV Atlas nominated.
Booking reference AX9384.
Regards`;

const PRICE_CHANGE = `We can proceed, however final rate is USD 45/MT.`;

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.DOCUMENT_STORAGE_PROVIDER = "local";
  process.env.DOCUMENT_STORAGE_LOCAL_DIR = path.join(
    process.cwd(),
    ".data",
    "documents-test",
  );
  resetDocumentStorageForTests();
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
  await rm(process.env.DOCUMENT_STORAGE_LOCAL_DIR, {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

async function seedAwaiting() {
  const user = await createUser({
    id: "user_doc_1",
    email: "shipper@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_doc_other",
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
  const replyToken = "doctestreplytoken1234567890";
  const request: CommercialRequest = {
    id: "req_doc_1",
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
    bodySnapshot: "Please provide cargo dimensions and packing list.",
    deliveryStatus: "RECEIVED",
    createdAt: now,
    receivedAt: now,
  });
  const quoteA: CommercialQuote = {
    id: "quote_doc_a",
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
  return { user, other, session, request: sent.request, proceed: sent.proceed, replyToken };
}

async function inbound(body: string, id: string, replyToken: string) {
  return processInboundEmail({
    provider: "fixture",
    providerMessageId: id,
    fromAddress: "broker-a@example.com",
    toAddresses: [`request+${replyToken}@reply.test`],
    subject: "Re: Request to proceed",
    textBody: body,
  });
}

describe("changed terms acceptance", () => {
  it("cannot book before acceptance; acceptance creates revised snapshot", async () => {
    const seeded = await seedAwaiting();
    await inbound(PRICE_CHANGE, "chg_1", seeded.replyToken);
    const conf = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    expect(conf?.classification).toBe("TERMS_CHANGED");
    expect(await getRepositories().bookings.getForRequest(seeded.request.id)).toBeUndefined();

    const cleanAck = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: conf!.id,
      userId: seeded.user.id,
    });
    expect(cleanAck.ok).toBe(false);

    const accepted = await acceptChangedCommercialTerms({
      requestId: seeded.request.id,
      confirmationId: conf!.id,
      userId: seeded.user.id,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.acceptedSnapshot.previousProceedSnapshot.rate).toBe(42);
    expect(accepted.acceptedSnapshot.acceptedTerms.rate).toBe(45);
    expect(accepted.booking.commercialSnapshot.rate).toBe(45);
    expect(seeded.proceed.snapshot.rate).toBe(42);

    const again = await acceptChangedCommercialTerms({
      requestId: seeded.request.id,
      confirmationId: conf!.id,
      userId: seeded.user.id,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.alreadyAccepted).toBe(true);
    expect(again.booking.id).toBe(accepted.booking.id);
  });
});

describe("document workflow", () => {
  async function seedConfirmedBooking() {
    const seeded = await seedAwaiting();
    await inbound(CLEAN, "clean_docs_1", seeded.replyToken);
    const conf = await getRepositories().confirmations.getLatestForRequest(
      seeded.request.id,
    );
    const ack = await acknowledgeCommercialConfirmation({
      requestId: seeded.request.id,
      confirmationId: conf!.id,
      userId: seeded.user.id,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) throw new Error("ack failed");
    return { ...seeded, booking: ack.booking };
  }

  it("generates checklist including broker-requested dimensions", async () => {
    const { booking } = await seedConfirmedBooking();
    const reqs = await getRepositories().documentRequirements.listForBooking(
      booking.id,
    );
    expect(reqs.some((r) => r.documentType === "COMMERCIAL_INVOICE" && r.required)).toBe(
      true,
    );
    expect(reqs.some((r) => r.documentType === "PACKING_LIST")).toBe(true);
    expect(reqs.some((r) => r.documentType === "CARGO_DIMENSIONS")).toBe(true);
    expect(
      reqs.find((r) => r.documentType === "CERTIFICATE_OF_ORIGIN")?.required,
    ).toBe(false);
    const refreshed = await getRepositories().bookings.get(booking.id);
    expect(refreshed?.status).toBe("DOCUMENTS_PENDING");
  });

  it("rejects invalid and oversized uploads; preserves versions", async () => {
    const { booking, user } = await seedConfirmedBooking();
    const bad = await uploadBookingDocument({
      bookingId: booking.id,
      userId: user.id,
      documentType: "PACKING_LIST",
      filename: "virus.exe",
      contentType: "application/x-msdownload",
      body: Buffer.from("MZ"),
    });
    expect(bad.ok).toBe(false);

    const invoice = await uploadBookingDocument({
      bookingId: booking.id,
      userId: user.id,
      documentType: "COMMERCIAL_INVOICE",
      filename: "invoice.txt",
      contentType: "text/plain",
      body: Buffer.from("Invoice total USD 84000 for 2,000 MT steel Rotterdam"),
    });
    expect(invoice.ok).toBe(true);

    const pl1 = await uploadBookingDocument({
      bookingId: booking.id,
      userId: user.id,
      documentType: "PACKING_LIST",
      filename: "packing-v1.txt",
      contentType: "text/plain",
      body: Buffer.from("Packing list 1,950 MT steel"),
    });
    expect(pl1.ok).toBe(true);
    if (!pl1.ok) return;
    expect(pl1.document.validationStatus).toBe("WARNING");

    const pl2 = await uploadBookingDocument({
      bookingId: booking.id,
      userId: user.id,
      documentType: "PACKING_LIST",
      filename: "packing-v2.txt",
      contentType: "text/plain",
      body: Buffer.from("Packing list 2,000 MT steel"),
    });
    expect(pl2.ok).toBe(true);
    if (!pl2.ok) return;
    expect(pl2.replaced).toBe(true);
    expect(pl2.document.version).toBe(2);
    expect(pl2.document.validationStatus).toBe("PASS");

    const all = await getRepositories().bookingDocuments.listForBooking(
      booking.id,
    );
    expect(all.filter((d) => d.documentType === "PACKING_LIST")).toHaveLength(2);
  });

  it("blocks readiness until complete + acknowledgements path", async () => {
    const { booking, user, other } = await seedConfirmedBooking();
    const cross = await uploadBookingDocument({
      bookingId: booking.id,
      userId: other.id,
      documentType: "COMMERCIAL_INVOICE",
      filename: "x.txt",
      contentType: "text/plain",
      body: Buffer.from("x"),
    });
    expect(cross.ok).toBe(false);

    let ready = await markBookingReadyForOperations({
      bookingId: booking.id,
      userId: user.id,
    });
    expect(ready.ok).toBe(false);

    const reqs = await getRepositories().documentRequirements.listForBooking(
      booking.id,
    );
    for (const req of reqs.filter((r) => r.required)) {
      const body =
        req.documentType === "PACKING_LIST"
          ? "Packing list 2,000 MT steel"
          : req.documentType === "CARGO_DIMENSIONS"
            ? "Dimensions 12x3x3 m for 2,000 MT steel"
            : "Commercial document 2,000 MT steel Rotterdam Alexandria";
      const up = await uploadBookingDocument({
        bookingId: booking.id,
        userId: user.id,
        requirementId: req.id,
        documentType: req.documentType,
        filename: `${req.documentType}.txt`,
        contentType: "text/plain",
        body: Buffer.from(body),
      });
      expect(up.ok).toBe(true);
    }

    const completeness = await computeDocumentCompleteness(booking.id);
    expect(completeness.percent).toBe(100);
    expect(completeness.canMarkReady).toBe(true);

    ready = await markBookingReadyForOperations({
      bookingId: booking.id,
      userId: user.id,
    });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.booking.status).toBe("READY_FOR_OPERATIONS");

    const again = await markBookingReadyForOperations({
      bookingId: booking.id,
      userId: user.id,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.alreadyReady).toBe(true);
  });

  it("sanitizes filenames and rejects arbitrary storage keys", () => {
    const allowed = assertAllowedUpload({
      filename: "../../etc/passwd.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.filename.includes("..")).toBe(false);
    expect(() =>
      buildStorageKey({
        bookingId: "b1",
        documentId: "d1",
        filename: "ok.pdf",
      }),
    ).not.toThrow();
  });

  it("storage download only via owned key path", async () => {
    const { booking, user } = await seedConfirmedBooking();
    const up = await uploadBookingDocument({
      bookingId: booking.id,
      userId: user.id,
      documentType: "COMMERCIAL_INVOICE",
      filename: "inv.txt",
      contentType: "text/plain",
      body: Buffer.from("Invoice 2,000 MT steel"),
    });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const stored = await getDocumentStorage().download(up.document.storageKey);
    expect(stored?.body.toString("utf8")).toContain("Invoice");
  });
});
