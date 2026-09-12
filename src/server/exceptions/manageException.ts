import type { OperationalException } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

type ActionResult =
  | { ok: true; exception: OperationalException }
  | { ok: false; error: string; code: string };

async function loadOwnedException(input: {
  bookingId: string;
  exceptionId: string;
  userId: string;
}): Promise<
  | { ok: true; exception: OperationalException; commercialRequestId: string | null }
  | { ok: false; error: string; code: string }
> {
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(input.bookingId)) ??
    (await repos.bookings.getByReference(input.bookingId));
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Not found", code: "not_found" };
  }
  const exception = await repos.operationalExceptions.get(input.exceptionId);
  if (!exception || exception.bookingId !== booking.id) {
    return { ok: false, error: "Exception not found", code: "not_found" };
  }
  return {
    ok: true,
    exception,
    commercialRequestId: booking.commercialRequestId,
  };
}

export async function acknowledgeOperationalException(input: {
  bookingId: string;
  exceptionId: string;
  userId: string;
}): Promise<ActionResult> {
  const loaded = await loadOwnedException(input);
  if (!loaded.ok) return loaded;
  if (
    loaded.exception.status === "RESOLVED" ||
    loaded.exception.status === "DISMISSED"
  ) {
    return { ok: false, error: "Exception is closed", code: "invalid_state" };
  }
  const now = new Date().toISOString();
  const updated: OperationalException = {
    ...loaded.exception,
    status: "ACKNOWLEDGED",
    acknowledgedAt: now,
    acknowledgedByUserId: input.userId,
    updatedAt: now,
  };
  await getRepositories().operationalExceptions.update(updated);
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "OPERATIONAL_EXCEPTION_ACKNOWLEDGED",
    metadata: { exceptionId: updated.id, type: updated.type },
    createdAt: now,
  });
  return { ok: true, exception: updated };
}

export async function dismissOperationalException(input: {
  bookingId: string;
  exceptionId: string;
  userId: string;
  note?: string | null;
}): Promise<ActionResult> {
  const loaded = await loadOwnedException(input);
  if (!loaded.ok) return loaded;
  if (
    loaded.exception.status === "RESOLVED" ||
    loaded.exception.status === "DISMISSED"
  ) {
    return { ok: false, error: "Exception is closed", code: "invalid_state" };
  }
  if (
    loaded.exception.severity === "HIGH" &&
    !(input.note && input.note.trim().length > 0)
  ) {
    return {
      ok: false,
      error: "A note is required to dismiss a HIGH severity exception",
      code: "note_required",
    };
  }
  const now = new Date().toISOString();
  const updated: OperationalException = {
    ...loaded.exception,
    status: "DISMISSED",
    dismissedAt: now,
    dismissedByUserId: input.userId,
    dismissalNote: input.note?.trim() || null,
    updatedAt: now,
  };
  await getRepositories().operationalExceptions.update(updated);
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "OPERATIONAL_EXCEPTION_DISMISSED",
    metadata: {
      exceptionId: updated.id,
      type: updated.type,
      hasNote: Boolean(updated.dismissalNote),
    },
    createdAt: now,
  });
  return { ok: true, exception: updated };
}

export async function resolveOperationalException(input: {
  bookingId: string;
  exceptionId: string;
  userId: string;
  note?: string | null;
}): Promise<ActionResult> {
  const loaded = await loadOwnedException(input);
  if (!loaded.ok) return loaded;
  if (loaded.exception.status === "DISMISSED") {
    return { ok: false, error: "Exception was dismissed", code: "invalid_state" };
  }
  if (loaded.exception.status === "RESOLVED") {
    return { ok: true, exception: loaded.exception };
  }
  const now = new Date().toISOString();
  const updated: OperationalException = {
    ...loaded.exception,
    status: "RESOLVED",
    resolvedAt: now,
    resolvedByUserId: input.userId,
    resolutionNote: input.note?.trim() || null,
    autoResolved: false,
    updatedAt: now,
  };
  await getRepositories().operationalExceptions.update(updated);
  await getRepositories().audits.append({
    id: newId("audit"),
    commercialRequestId: loaded.commercialRequestId,
    userId: input.userId,
    eventType: "OPERATIONAL_EXCEPTION_RESOLVED",
    metadata: { exceptionId: updated.id, type: updated.type },
    createdAt: now,
  });
  return { ok: true, exception: updated };
}
