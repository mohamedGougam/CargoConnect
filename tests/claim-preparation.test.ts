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
import { evaluateShipmentExceptions } from "@/server/exceptions/evaluateExceptions";
import { createClaimPreparation } from "@/server/claims/createClaim";
import {
  createClaimVersion,
  finalizeClaimPreparation,
  getClaimPreparation,
  setClaimEvidenceIncluded,
  updateClaimAmount,
} from "@/server/claims/manageClaim";
import { generateClaimPdf } from "@/server/claims/generatePdf";
import { applyExceptionDraft } from "@/server/exceptions/upsertException";
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
    "documents-test-claims",
  );
  resetDocumentStorageForTests();
  await resetCommercialStoreForTests();
  resetProceedRateLimitsForTests();
  await rm(process.env.DOCUMENT_STORAGE_LOCAL_DIR, {
    recursive: true,
    force: true,
  }).catch(() => undefined);
});

async function seedArrived() {
  const user = await createUser({
    id: "user_cl_1",
    email: "shipper-cl@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Shipper Ada",
    emailVerifiedAt: new Date().toISOString(),
  });
  const other = await createUser({
    id: "user_cl_other",
    email: "other-cl@example.com",
    passwordHash: await hashPassword("securepass1"),
    fullName: "Other",
    emailVerifiedAt: new Date().toISOString(),
  });
  const search = await runMaritimeRouteSearch({
    query: "2,000 tons of steel from Rotterdam to Alexandria",
    vessels: [],
  });
  const now = new Date().toISOString();
  const replyToken = "clreplytoken1234567890123456";
  const request: CommercialRequest = {
    id: "req_cl_1",
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
    id: "quote_cl_a",
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
    providerMessageId: `cl_clean_${Date.now()}`,
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
  await confirmShipmentMilestone({
    bookingId: ready.booking.id,
    userId: user.id,
    type: "ARRIVED",
    occurredAt: "2026-09-18T20:00:00.000Z",
  });
  const execution = (await getRepositories().shipmentExecutions.getForBooking(
    ready.booking.id,
  ))!;
  await getRepositories().shipmentExecutions.update({
    ...execution,
    plannedEta: "2026-09-18T08:00:00.000Z",
    actualArrivedAt: "2026-09-18T20:00:00.000Z",
    latestObservedEta: "2026-09-18T20:00:00.000Z",
    updatedAt: new Date().toISOString(),
  });
  return {
    user,
    other,
    booking: ready.booking,
    execution: (await getRepositories().shipmentExecutions.get(
      execution.id,
    ))!,
    request,
  };
}

describe("claim preparation", () => {
  it("creates DELAY claim from ETA exception with timeline and durations", async () => {
    const seeded = await seedArrived();
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    let open = await getRepositories().operationalExceptions.listOpenForExecution(
      seeded.execution.id,
    );
    let eta = open.find((e) => e.type === "ETA_SLIPPAGE");
    if (!eta) {
      await applyExceptionDraft({
        shipmentExecutionId: seeded.execution.id,
        bookingId: seeded.booking.id,
        commercialRequestId: seeded.request.id,
        draft: {
          type: "ETA_SLIPPAGE",
          logicalKey: `${seeded.execution.id}:ETA_SLIPPAGE`,
          severity: "WARNING",
          title: "ETA moved by +12h",
          explanation:
            "The AIS-reported ETA differs from the confirmed ETA by +12h.",
          evidence: [
            { label: "Confirmed ETA", value: "2026-09-18T08:00:00.000Z" },
            { label: "Latest AIS ETA", value: "2026-09-18T20:00:00.000Z" },
          ],
          source: "AIS",
          active: true,
        },
      });
      open = await getRepositories().operationalExceptions.listOpenForExecution(
        seeded.execution.id,
      );
      eta = open.find((e) => e.type === "ETA_SLIPPAGE");
    }
    expect(eta).toBeTruthy();

    const created = await createClaimPreparation({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      exceptionId: eta!.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.claim.claimType).toBe("DELAY");
    expect(created.claim.reference).toMatch(/^CL-CC-/);
    expect(created.claim.status).toBe("READY_FOR_REVIEW");
    expect(created.claim.timelineSnapshot.length).toBeGreaterThan(0);
    const delay = created.claim.durationFacts.find(
      (d) => d.label === "planned_vs_actual_arrival",
    );
    expect(delay?.displayLabel).toBe("Observed arrival difference");
    expect(delay?.elapsedLabel).toMatch(/\+12h/);
    expect(
      created.claim.missingEvidence.some((m) =>
        m.label.toLowerCase().includes("delay"),
      ),
    ).toBe(true);
    expect(
      created.claim.warnings.some((w) => w.toLowerCase().includes("liability")),
    ).toBe(true);

    // No auto-create without user
    const priorCount = (
      await getRepositories().claimPreparations.listForBooking(
        seeded.booking.id,
      )
    ).length;
    await evaluateShipmentExceptions({ executionId: seeded.execution.id });
    expect(
      (
        await getRepositories().claimPreparations.listForBooking(
          seeded.booking.id,
        )
      ).length,
    ).toBe(priorCount);
  });

  it("preserves departure conflict facts; demurrage prep shows dwell duration", async () => {
    const seeded = await seedArrived();
    const repos = getRepositories();
    await repos.shipmentObservations.create({
      id: newId("obs"),
      shipmentExecutionId: seeded.execution.id,
      kind: "NEAR_ORIGIN",
      latitude: 51.95,
      longitude: 4.48,
      sog: 0,
      observedAt: "2026-09-11T15:15:00.000Z",
      source: "test",
      freshnessLabel: "live",
      createdAt: "2026-09-11T15:15:00.000Z",
    });
    await repos.shipmentObservations.create({
      id: newId("obs"),
      shipmentExecutionId: seeded.execution.id,
      kind: "LEFT_ORIGIN_AREA",
      latitude: 51.7,
      longitude: 3.9,
      sog: 8,
      observedAt: "2026-09-11T15:42:00.000Z",
      source: "test",
      freshnessLabel: "live",
      createdAt: "2026-09-11T15:42:00.000Z",
    });
    const milestones = await repos.shipmentMilestones.listForExecution(
      seeded.execution.id,
    );
    const dep = milestones.find((m) => m.type === "DEPARTED");
    if (dep) {
      await repos.shipmentMilestones.update({
        ...dep,
        occurredAt: "2026-09-11T12:00:00.000Z",
      });
    }

    const conflictClaim = await createClaimPreparation({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      claimType: "MILESTONE_DISPUTE",
      title: "Departure timing preparation",
    });
    expect(conflictClaim.ok).toBe(true);
    if (!conflictClaim.ok) return;
    const discrepancy = conflictClaim.claim.durationFacts.find(
      (d) =>
        d.label === "departure_timing_discrepancy" ||
        d.label === "departure_vs_near_origin",
    );
    expect(discrepancy?.displayLabel).toMatch(/timing discrepancy/i);
    expect(discrepancy?.note).toMatch(/No source is declared correct/i);

    await repos.shipmentExecutions.update({
      ...(await repos.shipmentExecutions.get(seeded.execution.id))!,
      actualArrivedAt: "2026-09-18T06:25:00.000Z",
      actualDischargedAt: "2026-09-19T16:30:00.000Z",
      status: "DISCHARGED",
      updatedAt: new Date().toISOString(),
    });
    const dem = await createClaimPreparation({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      claimType: "DEMURRAGE_PREPARATION",
      title: "Demurrage preparation",
    });
    expect(dem.ok).toBe(true);
    if (!dem.ok) return;
    const dwell = dem.claim.durationFacts.find(
      (d) => d.label === "arrival_to_discharge",
    );
    expect(dwell?.displayLabel).toMatch(/arrival → discharge/i);
    expect(dwell?.elapsedLabel).toMatch(/34h/);
    expect(
      dem.claim.missingEvidence.some((m) =>
        m.label.toLowerCase().includes("demurrage"),
      ),
    ).toBe(true);
  });

  it("enforces ownership, amount labelling, include/exclude, finalize immutability, versioning, pdf", async () => {
    const seeded = await seedArrived();
    const created = await createClaimPreparation({
      bookingId: seeded.booking.id,
      userId: seeded.user.id,
      claimType: "DELAY",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const denied = await getClaimPreparation({
      claimId: created.claim.id,
      userId: seeded.other.id,
    });
    expect(denied.ok).toBe(false);

    const amount = await updateClaimAmount({
      claimId: created.claim.id,
      userId: seeded.user.id,
      currency: "EUR",
      amount: 12500,
      note: "Entered by user based on contractual demurrage calculation.",
    });
    expect(amount.ok).toBe(true);
    if (!amount.ok) return;
    expect(amount.claim.claimedAmountSource).toBe("USER_SUPPLIED");
    expect(
      amount.claim.warnings.some((w) => w.toLowerCase().includes("manually")),
    ).toBe(true);

    const evidence = await getRepositories().claimEvidenceItems.listForClaim(
      created.claim.id,
    );
    expect(evidence.length).toBeGreaterThan(0);
    const toggled = await setClaimEvidenceIncluded({
      claimId: created.claim.id,
      evidenceId: evidence[0].id,
      userId: seeded.user.id,
      included: false,
    });
    expect(toggled.ok).toBe(true);

    const noAck = await finalizeClaimPreparation({
      claimId: created.claim.id,
      userId: seeded.user.id,
      acknowledgedReview: false,
      acknowledgedNoLiability: true,
    });
    expect(noAck.ok).toBe(false);

    const fin = await finalizeClaimPreparation({
      claimId: created.claim.id,
      userId: seeded.user.id,
      acknowledgedReview: true,
      acknowledgedNoLiability: true,
    });
    expect(fin.ok).toBe(true);
    if (!fin.ok) return;
    expect(fin.claim.status).toBe("FINALIZED");
    expect(fin.claim.evidenceSnapshot?.length).toBeGreaterThan(0);

    const mutate = await updateClaimAmount({
      claimId: created.claim.id,
      userId: seeded.user.id,
      currency: "USD",
      amount: 1,
    });
    expect(mutate.ok).toBe(false);

    const again = await finalizeClaimPreparation({
      claimId: created.claim.id,
      userId: seeded.user.id,
      acknowledgedReview: true,
      acknowledgedNoLiability: true,
    });
    expect(again.ok).toBe(true);

    const pdf = await generateClaimPdf({
      claimId: created.claim.id,
      userId: seeded.user.id,
    });
    expect(pdf.filename).toContain(created.claim.reference);
    expect(pdf.filename).toContain("v1");
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(pdf.bytes.byteLength).toBeGreaterThan(500);
    expect(Buffer.from(pdf.bytes).subarray(0, 4).toString()).toBe("%PDF");
    const audits = await getRepositories().audits.listForRequest(
      seeded.request.id,
    );
    expect(
      audits.some((a) => a.eventType === "CLAIM_PDF_GENERATED"),
    ).toBe(true);

    const v2 = await createClaimVersion({
      claimId: created.claim.id,
      userId: seeded.user.id,
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.claim.version).toBe(2);
    expect(v2.claim.supersedesClaimPreparationId).toBe(created.claim.id);
    expect(v2.claim.status).toBe("READY_FOR_REVIEW");

    const v1 = await getRepositories().claimPreparations.get(created.claim.id);
    expect(v1?.status).toBe("FINALIZED");
    expect(v1?.claimedAmount).toBe(12500);
  });
});
