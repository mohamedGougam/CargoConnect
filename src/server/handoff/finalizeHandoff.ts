import type { OperationalHandoff } from "@/domain/commercial/types";
import { assertHandoffReady } from "@/server/handoff/buildHandoff";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

export type FinalizeHandoffResult =
  | {
      ok: true;
      handoff: OperationalHandoff;
      alreadyFinalized?: boolean;
    }
  | { ok: false; error: string; code: string };

export async function finalizeOperationalHandoff(input: {
  bookingId: string;
  handoffId: string;
  userId: string;
}): Promise<FinalizeHandoffResult> {
  const gate = await assertHandoffReady({
    bookingId: input.bookingId,
    userId: input.userId,
  });
  if (!gate.ok) return gate;

  const repos = getRepositories();
  const handoff = await repos.handoffs.get(input.handoffId);
  if (
    !handoff ||
    handoff.bookingId !== gate.booking.id ||
    handoff.userId !== input.userId
  ) {
    return { ok: false, error: "Handoff not found", code: "not_found" };
  }

  if (handoff.status === "FINALIZED") {
    return { ok: true, handoff, alreadyFinalized: true };
  }

  const critical = handoff.warnings.filter((w) => w.severity === "CRITICAL");
  if (critical.length > 0) {
    return {
      ok: false,
      error: "Critical warnings block finalization",
      code: "HANDOFF_NOT_READY",
    };
  }

  const now = new Date().toISOString();
  const finalized: OperationalHandoff = {
    ...handoff,
    status: "FINALIZED",
    reviewedAt: now,
    finalizedAt: now,
    finalizedByUserId: input.userId,
    updatedAt: now,
  };

  await repos.handoffs.update(finalized);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: gate.booking.commercialRequestId,
    userId: input.userId,
    eventType: "HANDOFF_FINALIZED",
    metadata: {
      handoffId: finalized.id,
      handoffReference: finalized.handoffReference,
      version: finalized.version,
    },
    createdAt: now,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: gate.booking.commercialRequestId,
    userId: input.userId,
    eventType: "HANDOFF_REVIEWED",
    metadata: {
      handoffId: finalized.id,
      handoffReference: finalized.handoffReference,
    },
    createdAt: now,
  });

  return { ok: true, handoff: finalized };
}
