import type { OperationalHandoff } from "@/domain/commercial/types";
import {
  assertHandoffReady,
  buildHandoffContent,
} from "@/server/handoff/buildHandoff";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

export type CreateHandoffResult =
  | {
      ok: true;
      handoff: OperationalHandoff;
      regenerated?: boolean;
      newVersion?: boolean;
    }
  | { ok: false; error: string; code: string };

/**
 * Create or regenerate an operational handoff draft.
 * Finalized versions are never mutated — a new version is created instead.
 */
export async function createOrRegenerateHandoff(input: {
  bookingId: string;
  userId: string;
  forceNewVersion?: boolean;
  operationsContactName?: string | null;
  operationsContactEmail?: string | null;
  operationsContactPhone?: string | null;
  operationalNotes?: string | null;
}): Promise<CreateHandoffResult> {
  const gate = await assertHandoffReady({
    bookingId: input.bookingId,
    userId: input.userId,
  });
  if (!gate.ok) return gate;

  const repos = getRepositories();
  const latest = await repos.handoffs.getLatestForBooking(gate.booking.id);
  const now = new Date().toISOString();

  const notes =
    input.operationalNotes !== undefined
      ? input.operationalNotes
      : (latest?.operationalNotes ?? null);
  const opsName =
    input.operationsContactName !== undefined
      ? input.operationsContactName
      : (latest?.operationsContactName ?? null);
  const opsEmail =
    input.operationsContactEmail !== undefined
      ? input.operationsContactEmail
      : (latest?.operationsContactEmail ?? null);
  const opsPhone =
    input.operationsContactPhone !== undefined
      ? input.operationsContactPhone
      : (latest?.operationsContactPhone ?? null);

  // Regenerate editable draft in place
  if (
    latest &&
    latest.status !== "FINALIZED" &&
    !input.forceNewVersion
  ) {
    const content = await buildHandoffContent({
      booking: gate.booking,
      request: gate.request,
      user: gate.user,
      version: latest.version,
      supersedesHandoffId: latest.supersedesHandoffId,
      operationsContactName: opsName,
      operationsContactEmail: opsEmail,
      operationsContactPhone: opsPhone,
      operationalNotes: notes,
    });
    const updated: OperationalHandoff = {
      ...latest,
      ...content,
      id: latest.id,
      status: "READY_FOR_REVIEW",
      generatedAt: latest.generatedAt,
      updatedAt: now,
      reviewedAt: null,
      finalizedAt: null,
      finalizedByUserId: null,
    };
    await repos.handoffs.update(updated);
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: gate.booking.commercialRequestId,
      userId: input.userId,
      eventType: "HANDOFF_REGENERATED",
      metadata: {
        handoffId: updated.id,
        handoffReference: updated.handoffReference,
        version: updated.version,
      },
      createdAt: now,
    });
    return { ok: true, handoff: updated, regenerated: true };
  }

  const version = latest ? latest.version + 1 : 1;
  const supersedes =
    latest?.status === "FINALIZED" ? latest.id : (latest?.id ?? null);
  const content = await buildHandoffContent({
    booking: gate.booking,
    request: gate.request,
    user: gate.user,
    version,
    supersedesHandoffId: supersedes,
    operationsContactName: opsName,
    operationsContactEmail: opsEmail,
    operationsContactPhone: opsPhone,
    operationalNotes: notes,
  });

  const handoff: OperationalHandoff = {
    id: newId("handoff"),
    ...content,
    status: "READY_FOR_REVIEW",
    generatedAt: now,
    updatedAt: now,
  };

  await repos.handoffs.create(handoff);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: gate.booking.commercialRequestId,
    userId: input.userId,
    eventType: "HANDOFF_CREATED",
    metadata: {
      handoffId: handoff.id,
      handoffReference: handoff.handoffReference,
      version: handoff.version,
    },
    createdAt: now,
  });

  return {
    ok: true,
    handoff,
    newVersion: Boolean(latest),
  };
}
