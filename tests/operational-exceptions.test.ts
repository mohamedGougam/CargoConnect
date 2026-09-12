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
import { ingestVesselObservation } from "@/server/execution/observeVessel";
import { evaluateShipmentExceptions } from "@/server/exceptions/evaluateExceptions";
import {
  acknowledgeOperationalException,
  dismissOperationalException,
} from "@/server/exceptions/manageException";
import {
  createVesselSubstitutionException,
  detectVesselSubstitutionPhrase,
} from "@/server/exceptions/vesselSubstitution";
import { createEmailMilestoneCandidates } from "@/server/execution/emailMilestoneCandidates";
import {
  buildAisFixtureVessel,
  resetAisFixturesForTests,
  setExecutionAisFixture,
} from "@/server/execution/aisFixtures";
import { runShipmentObservationWatcher } from "@/server/execution/observationWatcher";
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
    "documents-test-exceptions",
  );
  process.env.SHIPMENT_EXCEPTION_AIS_STALE_MINUTES = "60";
  process.env.SHIPMENT_EXCEPTION_ETA_SLIPPAGE_MINUTES = "360";
  process.env.SHIPMENT_EXCEPTION_ROUTE_DEVIATION_KM = "80";
  process.env.SHIPMENT_EXCEPTION_ORIGIN_DWELL_HOURS = "12";
  process.env.SHIPMENT_EXCEPTION_DESTINATION_DWELL_HOURS = "12";
  process.env.SHIPMENT_OBSERVATION_PERIODIC_MS = "1";
  process.env.SHIPMENT_OBSERVATION_INTERVAL_SECONDS = "1";
  resetDocumentStorageForTests();
  resetAisFixturesForTests();
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
  await rm(process.env.DOCUMENT_STORAGE_LOCAL_DIR, {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

async function seedInTransit() {
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
  const replyToken = "exreplytoken1234567890123456";
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
    providerMessageId: `ex_clean_${Date.now()}`,
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
  await getRepositories().bookings.update({
    ...ack.booking,
    vesselSnapshot: { vesselName: "MV Atlas", vesselMmsi: "244123456" },
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
      body: Buffer.from("Document 2,000 MT steel"),
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
  if (!handoff.ok) throw new Error("handoff failed");
  await finalizeOperationalHandoff({
    bookingId: ready.booking.id,
    handoffId: handoff.handoff.id,
    userId: user.id,
  });
  const started = await startShipmentTracking({
    bookingId: ready.booking.id,
    userId: user.id,
  });
  if (!started.ok) throw new Error("start failed");
  await associateVesselToExecution({
    executionId: started.execution.id,
    userId: user.id,
    bookingCommercialRequestId: request.id,
    confirmVessel: { mmsi: "244123456", name: "MV Atlas" },
  });
  await confirmShipmentMilestone({
    bookingId: ready.booking.id,
    userId: user.id,
    type: "LOADED",
  });
  await confirmShipmentMilestone({
    bookingId: ready.booking.id,
    userId: user.id,
    type: "DEPARTED",
  });
  const execution = (await getRepositories().shipmentExecutions.getForBooking(
    ready.booking.id,
  ))!;
  return {
    user,
    other,
    booking: ready.booking,
    execution,
    request,
  };
}

describe("operational exceptions", () => {
  it("creates ETA_SLIPPAGE and AIS_STALE; auto-resolves stale when fresh", async () => {
    const seeded = await seedInTransit();
    const planned = "2026-09-18T08:00:00.000Z";
    const aisEta = "2026-09-18T20:00:00.000Z";
    await getRepositories().shipmentExecutions.update({
      ...seeded.execution,
      plannedEta: planned,
      latestObservedEta: aisEta,
      updatedAt: new Date().toISOString(),
    });

    const r1 = await evaluateShipmentExceptions({
      executionId: seeded.execution.id,
    });
    expect(r1.created).toBeGreaterThanOrEqual(1);

    const open1 = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const eta = open1.find((e) => e.type === "ETA_SLIPPAGE");
    expect(eta).toBeTruthy();
    expect(eta!.severity).toBe("WARNING");
    expect(eta!.explanation).toMatch(/AIS-reported ETA differs/i);
    expect(eta!.evidence.some((e) => e.label === "Difference")).toBe(true);

    // Dedupe
    const r2 = await evaluateShipmentExceptions({
      executionId: seeded.execution.id,
    });
    expect(r2.created).toBe(0);
    expect(r2.updated).toBeGreaterThanOrEqual(1);

    // Stale observation
    const staleAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    await ingestVesselObservation({
      execution: (await getRepositories().shipmentExecutions.get(
        seeded.execution.id,
      ))!,
      observation: {
        latitude: 36.5,
        longitude: 15.2,
        sog: 12,
        observedAt: staleAt,
        source: "test",
        aisEta,
      },
      bookingCommercialRequestId: seeded.request.id,
      userId: seeded.user.id,
    });
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    const open2 = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const stale = open2.find((e) => e.type === "AIS_STALE");
    expect(stale).toBeTruthy();
    expect(stale!.explanation).toMatch(/No recent AIS position/i);
    expect(stale!.explanation).not.toMatch(/lost|missing/i);

    // Fresh AIS resumes → auto-resolve AIS_STALE
    await ingestVesselObservation({
      execution: (await getRepositories().shipmentExecutions.get(
        seeded.execution.id,
      ))!,
      observation: {
        latitude: 36.6,
        longitude: 15.4,
        sog: 12.2,
        observedAt: new Date().toISOString(),
        source: "test",
        aisEta,
      },
      bookingCommercialRequestId: seeded.request.id,
      userId: seeded.user.id,
    });
    const r3 = await evaluateShipmentExceptions({
      executionId: seeded.execution.id,
    });
    expect(r3.autoResolved).toBeGreaterThanOrEqual(1);
    const open3 = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    expect(open3.find((e) => e.type === "AIS_STALE")).toBeUndefined();
  });

  it("creates ROUTE_DEVIATION for far-from-corridor position and resolves on return", async () => {
    const seeded = await seedInTransit();
    const repos = getRepositories();
    const tFar = new Date(Date.now() - 120_000).toISOString();
    const tNear = new Date(Date.now() - 10_000).toISOString();
    await repos.shipmentObservations.create({
      id: newId("obs"),
      shipmentExecutionId: seeded.execution.id,
      kind: "UNDERWAY",
      latitude: 55.0,
      longitude: 10.0,
      sog: 10,
      observedAt: tFar,
      source: "test",
      freshnessLabel: "live",
      createdAt: tFar,
    });
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    const open = await repos.operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const route = open.find((e) => e.type === "ROUTE_DEVIATION");
    expect(route).toBeTruthy();
    expect(route!.explanation).toMatch(/reference corridor/i);
    expect(route!.explanation).not.toMatch(/off course|incorrectly/i);

    await repos.shipmentObservations.create({
      id: newId("obs"),
      shipmentExecutionId: seeded.execution.id,
      kind: "UNDERWAY",
      latitude: 36.0,
      longitude: -5.35,
      sog: 11,
      observedAt: tNear,
      source: "test",
      freshnessLabel: "live",
      createdAt: tNear,
    });
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    const open2 = await repos.operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    expect(open2.find((e) => e.type === "ROUTE_DEVIATION")).toBeUndefined();
  });

  it("creates VESSEL_SUBSTITUTION without changing association", async () => {
    const seeded = await seedInTransit();
    expect(
      detectVesselSubstitutionPhrase(
        "Please note vessel nomination has changed from MV Atlas to MV Orion.",
      )?.reportedName,
    ).toMatch(/Orion/i);

    const created = await createVesselSubstitutionException({
      commercialRequestId: seeded.request.id,
      inboundMessageId: "msg_sub_1",
      textBody:
        "Please note vessel nomination has changed from MV Atlas to MV Orion.",
    });
    expect(created).toBe(true);
    const exec = await getRepositories().shipmentExecutions.get(
      seeded.execution.id,
    );
    expect(exec?.vesselName).toBe("MV Atlas");
    const open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const sub = open.find((e) => e.type === "VESSEL_SUBSTITUTION");
    expect(sub?.severity).toBe("HIGH");
    expect(sub?.evidence.some((e) => e.value.includes("Orion"))).toBe(true);
  });

  it("persists SOURCE_CONFLICT from broker/AIS mismatch", async () => {
    const seeded = await seedInTransit();
    // Roll back departure so candidate can be created
    await getRepositories().shipmentExecutions.update({
      ...seeded.execution,
      status: "LOADED",
      actualDepartedAt: null,
      updatedAt: new Date().toISOString(),
    });
    const milestones = await getRepositories().shipmentMilestones.listForExecution(
      seeded.execution.id,
    );
    for (const m of milestones.filter(
      (x) => x.type === "DEPARTED" || x.type === "IN_TRANSIT",
    )) {
      await getRepositories().shipmentMilestones.update({
        ...m,
        status: "CANCELLED",
      });
    }
    setExecutionAisFixture(
      seeded.execution.id,
      buildAisFixtureVessel("NEAR_ROTTERDAM"),
    );
    await runShipmentObservationWatcher();

    const cand = await createEmailMilestoneCandidates({
      commercialRequestId: seeded.request.id,
      inboundMessageId: "msg_conflict_ex",
      fromAddress: "broker-a@example.com",
      textBody: "Vessel sailed Rotterdam at 12:00.",
    });
    expect(cand[0]?.conflictWarning).toBeTruthy();

    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    const open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const conflict = open.find((e) => e.type === "SOURCE_CONFLICT");
    expect(conflict).toBeTruthy();
    expect(conflict!.status).toBe("OPEN");
  });

  it("origin and destination dwell respect thresholds", async () => {
    const seeded = await seedInTransit();
    // Origin dwell: LOADED, near origin, loaded long ago
    await getRepositories().shipmentExecutions.update({
      ...(await getRepositories().shipmentExecutions.get(seeded.execution.id))!,
      status: "LOADED",
      actualDepartedAt: null,
      actualLoadedAt: new Date(Date.now() - 14 * 3_600_000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const milestones = await getRepositories().shipmentMilestones.listForExecution(
      seeded.execution.id,
    );
    for (const m of milestones.filter(
      (x) => x.type === "DEPARTED" || x.type === "IN_TRANSIT",
    )) {
      await getRepositories().shipmentMilestones.update({
        ...m,
        status: "CANCELLED",
      });
    }
    await ingestVesselObservation({
      execution: (await getRepositories().shipmentExecutions.get(
        seeded.execution.id,
      ))!,
      observation: {
        latitude: 51.95,
        longitude: 4.48,
        sog: 0.2,
        observedAt: new Date().toISOString(),
        source: "test",
      },
      bookingCommercialRequestId: seeded.request.id,
      userId: seeded.user.id,
    });
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    let open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    expect(open.find((e) => e.type === "ORIGIN_DWELL")).toBeTruthy();

    // Destination dwell
    await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "DEPARTED",
    });
    await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "ARRIVED",
      occurredAt: new Date(Date.now() - 18 * 3_600_000).toISOString(),
    });
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    expect(open.find((e) => e.type === "DESTINATION_DWELL")).toBeTruthy();
  });

  it("enforces ownership; HIGH dismiss requires note; completed skips live eval", async () => {
    const seeded = await seedInTransit();
    await getRepositories().shipmentExecutions.update({
      ...seeded.execution,
      plannedEta: "2026-09-18T08:00:00.000Z",
      latestObservedEta: "2026-09-18T20:00:00.000Z",
      updatedAt: new Date().toISOString(),
    });
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    const open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const eta = open.find((e) => e.type === "ETA_SLIPPAGE")!;

    const denied = await acknowledgeOperationalException({
      bookingId: seeded.booking.id,
      exceptionId: eta.id,
      userId: seeded.other.id,
    });
    expect(denied.ok).toBe(false);

    const ack = await acknowledgeOperationalException({
      bookingId: seeded.booking.id,
      exceptionId: eta.id,
      userId: seeded.user.id,
    });
    expect(ack.ok).toBe(true);

    // Create HIGH vessel sub and require note
    await createVesselSubstitutionException({
      commercialRequestId: seeded.request.id,
      inboundMessageId: "msg_sub_2",
      textBody: "Vessel nomination has changed from MV Atlas to MV Orion.",
    });
    const open2 = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    const sub = open2.find((e) => e.type === "VESSEL_SUBSTITUTION")!;
    const noNote = await dismissOperationalException({
      bookingId: seeded.booking.id,
      exceptionId: sub.id,
      userId: seeded.user.id,
    });
    expect(noNote.ok).toBe(false);

    const dismissed = await dismissOperationalException({
      bookingId: seeded.booking.id,
      exceptionId: sub.id,
      userId: seeded.user.id,
      note: "Reviewed with broker — nomination pending",
    });
    expect(dismissed.ok).toBe(true);

    // Complete and ensure no new live exceptions
    await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "ARRIVED",
    });
    await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "DISCHARGED",
    });
    await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "DELIVERED",
    });
    const { completeShipmentExecution } = await import(
      "@/server/execution/completeShipment"
    );
    await completeShipmentExecution({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });

    const before = (
      await getRepositories().operationalExceptions.listForExecution(
        seeded.execution.id,
      )
    ).length;

    await getRepositories().shipmentExecutions.update({
      ...(await getRepositories().shipmentExecutions.get(seeded.execution.id))!,
      plannedEta: "2026-09-18T08:00:00.000Z",
      latestObservedEta: "2026-09-19T08:00:00.000Z",
      updatedAt: new Date().toISOString(),
    });
    const afterEval = await evaluateShipmentExceptions({
      executionId: seeded.execution.id,
    });
    expect(afterEval.evaluated).toBe(false);
    expect(afterEval.created).toBe(0);
    const after = (
      await getRepositories().operationalExceptions.listForExecution(
        seeded.execution.id,
      )
    ).length;
    expect(after).toBe(before);
  });

  it("document regression when required doc fails after ready", async () => {
    const seeded = await seedInTransit();
    const reqs = await getRepositories().documentRequirements.listForBooking(
      seeded.booking.id,
    );
    const req = reqs.find((r) => r.required)!;
    await getRepositories().documentRequirements.update({
      ...req,
      status: "REJECTED",
      updatedAt: new Date().toISOString(),
    });
    const docs = await getRepositories().bookingDocuments.listForBooking(
      seeded.booking.id,
    );
    const current = docs.find((d) => d.isCurrent && d.documentType === req.documentType);
    if (current) {
      await getRepositories().bookingDocuments.update({
        ...current,
        validationStatus: "FAIL",
      });
    }
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    const open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    expect(open.find((e) => e.type === "DOCUMENT_REGRESSION")).toBeTruthy();
  });
});
