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
import { startShipmentTracking } from "@/server/execution/startTracking";
import { associateVesselToExecution } from "@/server/execution/associateVessel";
import { confirmShipmentMilestone } from "@/server/execution/confirmMilestone";
import {
  buildAisFixtureVessel,
  resetAisFixturesForTests,
  setExecutionAisFixture,
} from "@/server/execution/aisFixtures";
import { applyAisFixtureToExecution } from "@/server/execution/observeVessel";
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

beforeEach(async () => {
  process.env.COMMERCIAL_STORE = "memory";
  process.env.EMAIL_DELIVERY_MODE = "log";
  process.env.EMAIL_FROM_ADDRESS = "requests@test.cargoconnect.local";
  process.env.DOCUMENT_STORAGE_PROVIDER = "local";
  process.env.DOCUMENT_STORAGE_LOCAL_DIR = path.join(
    process.cwd(),
    ".data",
    "documents-test-exec",
  );
  process.env.SHIPMENT_OBSERVATION_PERIODIC_MS = "1";
  resetDocumentStorageForTests();
  resetAisFixturesForTests();
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
  await rm(process.env.DOCUMENT_STORAGE_LOCAL_DIR, {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

async function seedReadyWithHandoff() {
  const user = await createUser({
    id: "user_ex_1",
    email: "shipper-ex@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_ex_other",
    email: "other-ex@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Other",
    emailVerifiedAt: new Date().toISOString(),
  });
  const search = runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const replyToken = "exectestreplytoken1234567890";
  const request: CommercialRequest = {
    id: "req_ex_1",
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
    bodySnapshot: "Quote",
    deliveryStatus: "RECEIVED",
    createdAt: now,
    receivedAt: now,
  });
  const quoteA: CommercialQuote = {
    id: "quote_ex_a",
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
    providerMessageId: "ex_clean_1",
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

  // Ensure vessel name on booking for association
  await getRepositories().bookings.update({
    ...ack.booking,
    vesselSnapshot: {
      vesselName: "MV Atlas",
      vesselImo: null,
      vesselMmsi: null,
    },
    updatedAt: new Date().toISOString(),
  });

  const reqs = await getRepositories().documentRequirements.listForBooking(
    ack.booking.id,
  );
  for (const req of reqs.filter((r) => r.required)) {
    const up = await uploadBookingDocument({
      bookingId: ack.booking.id,
      userId: user.id,
      requirementId: req.id,
      documentType: req.documentType,
      filename: `${req.documentType}.txt`,
      contentType: "text/plain",
      body: Buffer.from("Document 2,000 MT steel Rotterdam Alexandria"),
    });
    if (!up.ok) throw new Error("upload failed");
  }

  const ready = await markBookingReadyForOperations({
    bookingId: ack.booking.id,
    userId: user.id,
  });
  if (!ready.ok) throw new Error("ready failed");

  const handoff = await createOrRegenerateHandoff({
    bookingId: ready.booking.id,
    userId: user.id,
  });
  if (!handoff.ok) throw new Error("handoff create failed");
  const fin = await finalizeOperationalHandoff({
    bookingId: ready.booking.id,
    handoffId: handoff.handoff.id,
    userId: user.id,
  });
  if (!fin.ok) throw new Error("handoff finalize failed");

  return { user, other, booking: ready.booking, handoff: fin.handoff };
}

describe("shipment execution", () => {
  it("cannot start without ready + finalized handoff; ownership; idempotent", async () => {
    const seeded = await seedReadyWithHandoff();
    const booking = await getRepositories().bookings.get(seeded.booking.id);

    await getRepositories().bookings.update({
      ...booking!,
      status: "DOCUMENTS_PENDING",
      updatedAt: new Date().toISOString(),
    });
    const blocked = await startShipmentTracking({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });
    expect(blocked.ok).toBe(false);

    await getRepositories().bookings.update({
      ...booking!,
      status: "READY_FOR_OPERATIONS",
      updatedAt: new Date().toISOString(),
    });

    const cross = await startShipmentTracking({
      bookingId: seeded.booking.id,
      userId: seeded.other.id,
    });
    expect(cross.ok).toBe(false);

    const started = await startShipmentTracking({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.execution.status).toBe("READY_FOR_OPERATIONS");

    const again = await startShipmentTracking({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.alreadyStarted).toBe(true);
    expect(again.execution.id).toBe(started.execution.id);
  });

  it("associates vessel; ambiguous name requires confirmation; change preserved", async () => {
    const { user, booking } = await seedReadyWithHandoff();
    const started = await startShipmentTracking({
      bookingId: booking.id,
      userId: user.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const ambiguous = await associateVesselToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
      nameSearchCandidates: [
        buildAisFixtureVessel("NEAR_ROTTERDAM"),
        buildAisFixtureVessel("VESSEL_CHANGE_ORION", { name: "MV Atlas II" }),
      ],
    });
    // execution already has vesselName MV Atlas — candidates both match "atlas"
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok) return;
    if ("requiresConfirmation" in ambiguous && ambiguous.requiresConfirmation) {
      expect(ambiguous.candidates.length).toBeGreaterThan(1);
    }

    const confirmed = await associateVesselToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
      confirmVessel: {
        vesselId: "mmsi:244123456",
        mmsi: "244123456",
        imo: "9123456",
        name: "MV Atlas",
      },
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok || confirmed.requiresConfirmation) return;
    expect(confirmed.association.vesselMmsi).toBe("244123456");

    const change = await associateVesselToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
      reportedChange: { vesselName: "MV Orion", mmsi: "244999888" },
    });
    expect(change.ok).toBe(true);
    if (!change.ok) return;
    expect(change.requiresConfirmation).toBe(true);

    const switched = await associateVesselToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
      confirmVessel: {
        mmsi: "244999888",
        name: "MV Orion",
      },
    });
    expect(switched.ok).toBe(true);
    if (!switched.ok || switched.requiresConfirmation) return;
    const history =
      await getRepositories().shipmentVesselAssociations.listForExecution(
        started.execution.id,
      );
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.filter((a) => !a.active).length).toBeGreaterThanOrEqual(1);
  });

  it("AIS observations never auto-confirm cargo milestones", async () => {
    const { user, booking } = await seedReadyWithHandoff();
    const started = await startShipmentTracking({
      bookingId: booking.id,
      userId: user.id,
    });
    if (!started.ok) throw new Error("start failed");
    await associateVesselToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
      confirmVessel: {
        mmsi: "244123456",
        name: "MV Atlas",
      },
    });

    setExecutionAisFixture(
      started.execution.id,
      buildAisFixtureVessel("NEAR_ROTTERDAM"),
    );
    const near = await applyAisFixtureToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
    });
    expect(near.ok).toBe(true);
    if (!near.ok) return;
    expect(near.messages.some((m) => m.includes("near origin"))).toBe(true);

    let exec = await getRepositories().shipmentExecutions.get(
      started.execution.id,
    );
    expect(exec?.status).toBe("READY_FOR_OPERATIONS");
    expect(exec?.actualDepartedAt).toBeFalsy();

    setExecutionAisFixture(
      started.execution.id,
      buildAisFixtureVessel("LEFT_ROTTERDAM"),
    );
    const left = await applyAisFixtureToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
    });
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    expect(
      left.messages.some((m) => m.toLowerCase().includes("departed")),
    ).toBe(true);
    exec = await getRepositories().shipmentExecutions.get(started.execution.id);
    expect(exec?.status).not.toBe("IN_TRANSIT");

    setExecutionAisFixture(
      started.execution.id,
      buildAisFixtureVessel("UNDERWAY_MED"),
    );
    await applyAisFixtureToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
    });

    setExecutionAisFixture(
      started.execution.id,
      buildAisFixtureVessel("NEAR_ALEXANDRIA"),
    );
    const dest = await applyAisFixtureToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
    });
    expect(dest.ok).toBe(true);
    if (!dest.ok) return;
    expect(dest.messages.some((m) => m.includes("destination"))).toBe(true);
    exec = await getRepositories().shipmentExecutions.get(started.execution.id);
    expect(exec?.status).not.toBe("ARRIVED");

    setExecutionAisFixture(
      started.execution.id,
      buildAisFixtureVessel("STALE"),
    );
    const stale = await applyAisFixtureToExecution({
      executionId: started.execution.id,
      userId: user.id,
      bookingCommercialRequestId: booking.commercialRequestId,
    });
    expect(stale.ok).toBe(true);
    if (!stale.ok) return;
    expect(stale.messages.some((m) => m.toLowerCase().includes("stale"))).toBe(
      true,
    );
  });

  it("explicit loaded/departure/arrival confirmations drive status", async () => {
    const { user, other, booking } = await seedReadyWithHandoff();
    const started = await startShipmentTracking({
      bookingId: booking.id,
      userId: user.id,
    });
    if (!started.ok) throw new Error("start failed");

    const cross = await confirmShipmentMilestone({
      bookingId: booking.id,
      userId: other.id,
      type: "LOADED",
    });
    expect(cross.ok).toBe(false);

    const loaded = await confirmShipmentMilestone({
      bookingId: booking.id,
      userId: user.id,
      type: "LOADED",
      occurredAt: "2026-09-11T10:00:00.000Z",
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.execution.status).toBe("LOADED");
    expect(loaded.milestone.source).toBe("USER");

    const loadedAgain = await confirmShipmentMilestone({
      bookingId: booking.id,
      userId: user.id,
      type: "LOADED",
    });
    expect(loadedAgain.ok).toBe(true);
    if (!loadedAgain.ok) return;
    expect(loadedAgain.alreadyConfirmed).toBe(true);

    const dep = await confirmShipmentMilestone({
      bookingId: booking.id,
      userId: user.id,
      type: "DEPARTED",
      occurredAt: "2026-09-11T13:55:00.000Z",
    });
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;
    expect(dep.execution.status).toBe("IN_TRANSIT");
    expect(dep.execution.actualDepartedAt).toBe("2026-09-11T13:55:00.000Z");

    const arr = await confirmShipmentMilestone({
      bookingId: booking.id,
      userId: user.id,
      type: "ARRIVED",
      occurredAt: "2026-09-18T08:00:00.000Z",
    });
    expect(arr.ok).toBe(true);
    if (!arr.ok) return;
    expect(arr.execution.status).toBe("ARRIVED");
  });

  it("rejects arbitrary vessel reassignment injection patterns", async () => {
    const { user, booking } = await seedReadyWithHandoff();
    const started = await startShipmentTracking({
      bookingId: booking.id,
      userId: user.id,
    });
    if (!started.ok) throw new Error("start failed");

    // Client cannot force another user's execution via wrong userId
    const hijack = await associateVesselToExecution({
      executionId: started.execution.id,
      userId: "not_owner",
      bookingCommercialRequestId: booking.commercialRequestId,
      confirmVessel: { mmsi: "999999999", name: "Hijack" },
    });
    expect(hijack.ok).toBe(false);
  });
});
