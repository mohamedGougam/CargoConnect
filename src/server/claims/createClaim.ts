import type {
  ClaimPreparation,
  ClaimType,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  collectClaimEvidence,
  mapExceptionToClaimType,
} from "@/server/claims/collectEvidence";

type Result =
  | { ok: true; claim: ClaimPreparation }
  | { ok: false; error: string; code: string };

export async function createClaimPreparation(input: {
  bookingId: string;
  userId: string;
  claimType?: ClaimType;
  exceptionId?: string | null;
  title?: string | null;
  description?: string | null;
}): Promise<Result> {
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(input.bookingId)) ??
    (await repos.bookings.getByReference(input.bookingId));
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Not found", code: "not_found" };
  }

  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  const relatedExceptionIds: string[] = [];
  let claimType: ClaimType = input.claimType ?? "OTHER";
  let title = input.title?.trim() || "Claim preparation";
  let issueStartedAt: string | null = null;

  if (input.exceptionId) {
    const ex = await repos.operationalExceptions.get(input.exceptionId);
    if (!ex || ex.bookingId !== booking.id) {
      return { ok: false, error: "Exception not found", code: "not_found" };
    }
    if (ex.severity === "INFO" && !input.claimType) {
      return {
        ok: false,
        error: "INFO exceptions do not open claim preparation by default",
        code: "not_applicable",
      };
    }
    relatedExceptionIds.push(ex.id);
    claimType = input.claimType ?? mapExceptionToClaimType(ex.type);
    title = input.title?.trim() || `Claim preparation · ${ex.title}`;
    issueStartedAt = ex.detectedAt;
  }

  const prior = await repos.claimPreparations.listForBooking(booking.id);
  const seq = String(prior.length + 1).padStart(2, "0");
  const reference = `CL-${booking.bookingReference}-${seq}`;

  const now = new Date().toISOString();
  const claimId = newId("claim");
  const draft: ClaimPreparation = {
    id: claimId,
    bookingId: booking.id,
    shipmentExecutionId: execution?.id ?? null,
    userId: input.userId,
    reference,
    status: "DRAFT",
    claimType,
    title,
    description: input.description ?? null,
    relatedExceptionIds,
    issueStartedAt,
    issueEndedAt: null,
    claimedCurrency: null,
    claimedAmount: null,
    claimedAmountSource: null,
    claimedAmountNote: null,
    userNotes: null,
    timelineSnapshot: [],
    durationFacts: [],
    missingEvidence: [],
    warnings: [],
    evidenceSnapshot: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await repos.claimPreparations.create(draft);

  const collected = await collectClaimEvidence({
    claimPreparationId: claimId,
    booking,
    execution: execution ?? null,
    relatedExceptionIds,
    claimType,
  });

  const ready: ClaimPreparation = {
    ...draft,
    status: "READY_FOR_REVIEW",
    timelineSnapshot: collected.timeline,
    durationFacts: collected.durations,
    missingEvidence: collected.missing,
    warnings: collected.warnings,
    updatedAt: new Date().toISOString(),
  };
  await repos.claimPreparations.update(ready);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_PREPARATION_CREATED",
    metadata: {
      claimId: ready.id,
      reference: ready.reference,
      claimType: ready.claimType,
      exceptionId: input.exceptionId ?? null,
      evidenceCount: collected.items.length,
    },
    createdAt: now,
  });

  for (const item of collected.items) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: booking.commercialRequestId,
      userId: input.userId,
      eventType: "CLAIM_EVIDENCE_ADDED",
      metadata: {
        claimId: ready.id,
        evidenceId: item.id,
        type: item.type,
        sourceId: item.sourceId ?? null,
      },
      createdAt: now,
    });
  }

  return { ok: true, claim: ready };
}
