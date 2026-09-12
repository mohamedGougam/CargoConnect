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
import { completeShipmentExecution } from "@/server/execution/completeShipment";
import {
  buildAisFixtureVessel,
  resetAisFixturesForTests,
  setExecutionAisFixture,
} from "@/server/execution/aisFixtures";
import { runShipmentObservationWatcher } from "@/server/execution/observationWatcher";
import {
  createEmailMilestoneCandidates,
  detectOperationalMilestonePhrases,
} from "@/server/execution/emailMilestoneCandidates";
import { isMeaningfulObservationChange } from "@/server/execution/meaningfulChange";
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
    "documents-test-complete",
  );
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
    id: "user_cmp_1",
    email: "shipper-cmp@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_cmp_other",
    email: "other-cmp@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Other",
    emailVerifiedAt: new Date().toISOString(),
  });
  const search = await runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const replyToken = "cmpreplytoken12345678901234";
  const request: CommercialRequest = {
    id: "req_cmp_1",
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
    id: "quote_cmp_a",
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
    providerMessageId: "cmp_clean_1",
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
  return {
    user,
    other,
    booking: ready.booking,
    execution: (await getRepositories().shipmentExecutions.getForBooking(
      ready.booking.id,
    ))!,
    request,
    replyToken,
  };
}

describe("live observation watcher", () => {
  it("ingests meaningful fixture observations; skips unchanged; ignores completed", async () => {
    const seeded = await seedInTransit();
    setExecutionAisFixture(
      seeded.execution.id,
      buildAisFixtureVessel("UNDERWAY_MED"),
    );

    const run1 = await runShipmentObservationWatcher();
    expect(run1.activeExecutions).toBeGreaterThanOrEqual(1);
    expect(run1.matchedVessels).toBeGreaterThanOrEqual(1);
    expect(run1.observationsIngested).toBeGreaterThanOrEqual(1);

    const run2 = await runShipmentObservationWatcher();
    expect(run2.observationsSkipped).toBeGreaterThanOrEqual(1);

    // Advance to completed and ensure watcher ignores
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
    await completeShipmentExecution({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });

    const active = await getRepositories().shipmentExecutions.listActiveForWatcher();
    expect(active.find((e) => e.id === seeded.execution.id)).toBeUndefined();
  });

  it("meaningful change filter rejects identical points", () => {
    const t0 = Date.now() - 5_000;
    const prev = {
      id: "o1",
      shipmentExecutionId: "e1",
      kind: "UNDERWAY" as const,
      latitude: 36.5,
      longitude: 15.2,
      sog: 12,
      observedAt: new Date(t0).toISOString(),
      source: "test",
      freshnessLabel: "live" as const,
      createdAt: new Date(t0).toISOString(),
    };
    expect(
      isMeaningfulObservationChange({
        previous: prev,
        next: {
          latitude: 36.5,
          longitude: 15.2,
          sog: 12,
          observedAt: new Date(t0 + 1_000).toISOString(),
          source: "test",
        },
      }),
    ).toBe(false);
    expect(
      isMeaningfulObservationChange({
        previous: prev,
        next: {
          latitude: 37.0,
          longitude: 16.0,
          sog: 12,
          observedAt: new Date(t0 + 1_000).toISOString(),
          source: "test",
        },
      }),
    ).toBe(true);
  });
});

describe("email milestone candidates", () => {
  it("detects phrases and creates pending candidates without auto-confirm", async () => {
    expect(detectOperationalMilestonePhrases("hello world")).toHaveLength(0);
    expect(
      detectOperationalMilestonePhrases("MV Atlas arrived Alexandria at 06:25.")
        .map((d) => d.type),
    ).toContain("ARRIVED");

    const seeded = await seedInTransit();
    const created = await createEmailMilestoneCandidates({
      commercialRequestId: seeded.request.id,
      inboundMessageId: "msg_arrival_1",
      fromAddress: "broker-a@example.com",
      textBody: "MV Atlas arrived Alexandria at 06:25.",
    });
    expect(created.length).toBe(1);
    expect(created[0].status).toBe("PENDING");
    expect(created[0].proposedType).toBe("ARRIVED");

    const exec = await getRepositories().shipmentExecutions.get(
      seeded.execution.id,
    );
    expect(exec?.status).toBe("IN_TRANSIT");

    const confirmed = await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "ARRIVED",
      candidateId: created[0].id,
      occurredAt: "2026-09-18T06:25:00.000Z",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.execution.status).toBe("ARRIVED");

    const cand = await getRepositories().shipmentMilestoneCandidates.get(
      created[0].id,
    );
    expect(cand?.status).toBe("CONFIRMED");
  });

  it("blocks invalid order; discharge → delivery → complete", async () => {
    const seeded = await seedInTransit();
    const earlyDischarge = await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "DISCHARGED",
    });
    expect(earlyDischarge.ok).toBe(false);

    await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "ARRIVED",
    });

    const dischargeCand = await createEmailMilestoneCandidates({
      commercialRequestId: seeded.request.id,
      inboundMessageId: "msg_dis_1",
      fromAddress: "broker-a@example.com",
      textBody: "Discharging completed at 16:30.",
    });
    expect(dischargeCand[0]?.proposedType).toBe("DISCHARGED");

    const dis = await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "DISCHARGED",
      candidateId: dischargeCand[0].id,
    });
    expect(dis.ok).toBe(true);
    if (!dis.ok) return;
    expect(dis.execution.status).toBe("DISCHARGED");

    const delCand = await createEmailMilestoneCandidates({
      commercialRequestId: seeded.request.id,
      inboundMessageId: "msg_del_1",
      fromAddress: "broker-a@example.com",
      textBody: "Cargo delivered to consignee at 10:00.",
    });
    const del = await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "DELIVERED",
      candidateId: delCand[0].id,
    });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.execution.status).toBe("DELIVERED");

    const earlyComplete = await completeShipmentExecution({
      bookingId: seeded.booking.id,
      userId: seeded.other.id,
    });
    expect(earlyComplete.ok).toBe(false);

    const done = await completeShipmentExecution({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.execution.status).toBe("COMPLETED");
    expect(done.execution.closeoutSummary).toContain("Shipment completed");

    const again = await completeShipmentExecution({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.alreadyCompleted).toBe(true);

    const mutate = await confirmShipmentMilestone({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      type: "ARRIVED",
    });
    expect(mutate.ok).toBe(false);
  });

  it("flags departure conflict when AIS still near origin", async () => {
    const seeded = await seedInTransit();
    const exec = await getRepositories().shipmentExecutions.get(
      seeded.execution.id,
    );
    await getRepositories().shipmentExecutions.update({
      ...exec!,
      status: "LOADED",
      actualDepartedAt: null,
      updatedAt: new Date().toISOString(),
    });
    // Cancel confirmed DEPARTED so a candidate can be created again
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
      inboundMessageId: "msg_conflict_dep",
      fromAddress: "broker-a@example.com",
      textBody: "Vessel sailed Rotterdam at 12:00.",
    });
    expect(cand.length).toBe(1);
    expect(cand[0].proposedType).toBe("DEPARTED");
    expect(cand[0].status).toBe("PENDING");
    expect(cand[0].conflictWarning).toMatch(/conflict|differ/i);
  });
});

describe("observation job security", () => {
  it("rejects missing or wrong bearer secret", async () => {
    const { POST } = await import(
      "@/app/api/internal/shipment-observation/run/route"
    );
    const prev = process.env.SHIPMENT_OBSERVATION_JOB_SECRET;
    process.env.SHIPMENT_OBSERVATION_JOB_SECRET = "test-job-secret-16chars";

    const unauth = await POST(
      new Request("http://localhost/api/internal/shipment-observation/run", {
        method: "POST",
      }),
    );
    expect(unauth.status).toBe(401);

    const wrong = await POST(
      new Request("http://localhost/api/internal/shipment-observation/run", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );
    expect(wrong.status).toBe(401);

    const ok = await POST(
      new Request("http://localhost/api/internal/shipment-observation/run", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-job-secret-16chars",
        },
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok?: boolean; activeExecutions?: number };
    expect(body.ok).toBe(true);
    expect(typeof body.activeExecutions).toBe("number");

    if (prev === undefined) delete process.env.SHIPMENT_OBSERVATION_JOB_SECRET;
    else process.env.SHIPMENT_OBSERVATION_JOB_SECRET = prev;
  });
});
