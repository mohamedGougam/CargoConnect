import type {
  ClaimEvidenceItem,
  ClaimPreparation,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { collectClaimEvidence } from "@/server/claims/collectEvidence";

type Result =
  | { ok: true; claim: ClaimPreparation; evidence?: ClaimEvidenceItem[] }
  | { ok: false; error: string; code: string };

async function loadOwnedClaim(input: {
  claimId: string;
  userId: string;
}): Promise<
  | {
      ok: true;
      claim: ClaimPreparation;
      commercialRequestId: string | null;
    }
  | { ok: false; error: string; code: string }
> {
  const repos = getRepositories();
  const claim =
    (await repos.claimPreparations.get(input.claimId)) ??
    (await repos.claimPreparations.getByReference(input.claimId));
  if (!claim || claim.userId !== input.userId) {
    return { ok: false, error: "Not found", code: "not_found" };
  }
  const booking = await repos.bookings.get(claim.bookingId);
  return {
    ok: true,
    claim,
    commercialRequestId: booking?.commercialRequestId ?? null,
  };
}

export async function getClaimPreparation(input: {
  claimId: string;
  userId: string;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  const evidence = await getRepositories().claimEvidenceItems.listForClaim(
    loaded.claim.id,
  );
  return { ok: true, claim: loaded.claim, evidence };
}

export async function setClaimEvidenceIncluded(input: {
  claimId: string;
  evidenceId: string;
  userId: string;
  included: boolean;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  if (
    loaded.claim.status === "FINALIZED" ||
    loaded.claim.status === "CLOSED"
  ) {
    return { ok: false, error: "Claim dossier is immutable", code: "immutable" };
  }
  const repos = getRepositories();
  const item = await repos.claimEvidenceItems.get(input.evidenceId);
  if (!item || item.claimPreparationId !== loaded.claim.id) {
    return { ok: false, error: "Evidence not found", code: "not_found" };
  }
  // Client cannot forge source — only toggle included on existing server items
  const updated = await repos.claimEvidenceItems.update({
    ...item,
    included: input.included,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: input.included ? "CLAIM_EVIDENCE_ADDED" : "CLAIM_EVIDENCE_REMOVED",
    metadata: {
      claimId: loaded.claim.id,
      evidenceId: updated.id,
      type: updated.type,
    },
    createdAt: new Date().toISOString(),
  });

  const claim = await rebuildTimelineFromEvidence(loaded.claim);
  return { ok: true, claim, evidence: await repos.claimEvidenceItems.listForClaim(claim.id) };
}

async function rebuildTimelineFromEvidence(
  claim: ClaimPreparation,
): Promise<ClaimPreparation> {
  const repos = getRepositories();
  const items = await repos.claimEvidenceItems.listForClaim(claim.id);
  const timeline = items
    .filter((i) => i.included && i.occurredAt)
    .map((i) => ({
      id: newId("ctl"),
      occurredAt: i.occurredAt!,
      title: i.title,
      factualSummary: i.factualSummary ?? i.title,
      sourceLabel: i.sourceLabel,
      evidenceItemId: i.id,
    }))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const next = {
    ...claim,
    timelineSnapshot: timeline,
    updatedAt: new Date().toISOString(),
  };
  await repos.claimPreparations.update(next);
  return next;
}

export async function updateClaimNotes(input: {
  claimId: string;
  userId: string;
  userNotes: string;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  if (
    loaded.claim.status === "FINALIZED" ||
    loaded.claim.status === "CLOSED"
  ) {
    return { ok: false, error: "Claim dossier is immutable", code: "immutable" };
  }
  const now = new Date().toISOString();
  const claim: ClaimPreparation = {
    ...loaded.claim,
    userNotes: input.userNotes,
    updatedAt: now,
  };
  await getRepositories().claimPreparations.update(claim);
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_NOTE_UPDATED",
    metadata: { claimId: claim.id },
    createdAt: now,
  });
  return { ok: true, claim };
}

export async function updateClaimAmount(input: {
  claimId: string;
  userId: string;
  currency: string | null;
  amount: number | null;
  note?: string | null;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  if (
    loaded.claim.status === "FINALIZED" ||
    loaded.claim.status === "CLOSED"
  ) {
    return { ok: false, error: "Claim dossier is immutable", code: "immutable" };
  }
  if (
    input.amount != null &&
    (!Number.isFinite(input.amount) || input.amount < 0)
  ) {
    return { ok: false, error: "Invalid amount", code: "validation" };
  }
  const now = new Date().toISOString();
  const claim: ClaimPreparation = {
    ...loaded.claim,
    claimedCurrency: input.currency,
    claimedAmount: input.amount,
    claimedAmountSource:
      input.amount != null ? "USER_SUPPLIED" : null,
    claimedAmountNote: input.note ?? null,
    warnings: Array.from(
      new Set([
        ...loaded.claim.warnings.filter(
          (w) => !w.includes("Potential claim amount"),
        ),
        ...(input.amount != null
          ? [
              "Potential claim amount was entered manually by the user and was not calculated by CargoConnect.",
            ]
          : []),
      ]),
    ),
    updatedAt: now,
  };
  await getRepositories().claimPreparations.update(claim);
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_AMOUNT_UPDATED",
    metadata: {
      claimId: claim.id,
      hasAmount: input.amount != null,
      currency: input.currency,
    },
    createdAt: now,
  });
  return { ok: true, claim };
}

export async function finalizeClaimPreparation(input: {
  claimId: string;
  userId: string;
  acknowledgedReview: boolean;
  acknowledgedNoLiability: boolean;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  if (loaded.claim.status === "FINALIZED") {
    return { ok: true, claim: loaded.claim };
  }
  if (loaded.claim.status === "CLOSED") {
    return { ok: false, error: "Claim is closed", code: "invalid_state" };
  }
  if (!input.acknowledgedReview || !input.acknowledgedNoLiability) {
    return {
      ok: false,
      error: "Both acknowledgements are required",
      code: "ack_required",
    };
  }

  const repos = getRepositories();
  const evidence = await repos.claimEvidenceItems.listForClaim(loaded.claim.id);
  const now = new Date().toISOString();
  const claim: ClaimPreparation = {
    ...loaded.claim,
    status: "FINALIZED",
    evidenceSnapshot: evidence.filter((e) => e.included),
    finalizedAt: now,
    finalizedByUserId: input.userId,
    updatedAt: now,
  };
  await repos.claimPreparations.update(claim);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_REVIEWED",
    metadata: { claimId: claim.id },
    createdAt: now,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_FINALIZED",
    metadata: {
      claimId: claim.id,
      reference: claim.reference,
      version: claim.version,
      evidenceCount: claim.evidenceSnapshot?.length ?? 0,
    },
    createdAt: now,
  });
  return { ok: true, claim, evidence };
}

export async function closeClaimPreparation(input: {
  claimId: string;
  userId: string;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  if (loaded.claim.status === "CLOSED") {
    return { ok: true, claim: loaded.claim };
  }
  const now = new Date().toISOString();
  const claim: ClaimPreparation = {
    ...loaded.claim,
    status: "CLOSED",
    closedAt: now,
    closedByUserId: input.userId,
    updatedAt: now,
  };
  await getRepositories().claimPreparations.update(claim);
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_CLOSED",
    metadata: { claimId: claim.id },
    createdAt: now,
  });
  return { ok: true, claim };
}

/**
 * Create a new version from a FINALIZED claim without mutating v1.
 */
export async function createClaimVersion(input: {
  claimId: string;
  userId: string;
}): Promise<Result> {
  const loaded = await loadOwnedClaim(input);
  if (!loaded.ok) return loaded;
  if (loaded.claim.status !== "FINALIZED") {
    return {
      ok: false,
      error: "Only finalized dossiers can spawn a new version",
      code: "invalid_state",
    };
  }

  const repos = getRepositories();
  const booking = await repos.bookings.get(loaded.claim.bookingId);
  if (!booking) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }
  const execution = loaded.claim.shipmentExecutionId
    ? await repos.shipmentExecutions.get(loaded.claim.shipmentExecutionId)
    : await repos.shipmentExecutions.getForBooking(booking.id);

  const prior = await repos.claimPreparations.listForBooking(booking.id);
  const nextVersion = loaded.claim.version + 1;
  const seq = String(prior.length + 1).padStart(2, "0");
  const reference = `CL-${booking.bookingReference}-${seq}`;
  const now = new Date().toISOString();
  const claimId = newId("claim");

  const draft: ClaimPreparation = {
    ...loaded.claim,
    id: claimId,
    reference,
    status: "DRAFT",
    version: nextVersion,
    supersedesClaimPreparationId: loaded.claim.id,
    evidenceSnapshot: null,
    timelineSnapshot: [],
    durationFacts: [],
    missingEvidence: [],
    finalizedAt: null,
    finalizedByUserId: null,
    closedAt: null,
    closedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  await repos.claimPreparations.create(draft);

  const collected = await collectClaimEvidence({
    claimPreparationId: claimId,
    booking,
    execution: execution ?? null,
    relatedExceptionIds: loaded.claim.relatedExceptionIds,
    claimType: loaded.claim.claimType,
  });

  const ready: ClaimPreparation = {
    ...draft,
    status: "READY_FOR_REVIEW",
    timelineSnapshot: collected.timeline,
    durationFacts: collected.durations,
    missingEvidence: collected.missing,
    warnings: collected.warnings,
    claimedCurrency: loaded.claim.claimedCurrency,
    claimedAmount: loaded.claim.claimedAmount,
    claimedAmountSource: loaded.claim.claimedAmountSource,
    claimedAmountNote: loaded.claim.claimedAmountNote,
    userNotes: loaded.claim.userNotes,
    updatedAt: new Date().toISOString(),
  };
  await repos.claimPreparations.update(ready);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "CLAIM_VERSION_CREATED",
    metadata: {
      claimId: ready.id,
      supersedes: loaded.claim.id,
      version: ready.version,
      reference: ready.reference,
    },
    createdAt: now,
  });

  return { ok: true, claim: ready };
}
