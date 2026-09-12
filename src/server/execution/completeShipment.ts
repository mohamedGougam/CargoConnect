import type { ShipmentExecution } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

export type CompleteShipmentResult =
  | {
      ok: true;
      execution: ShipmentExecution;
      alreadyCompleted?: boolean;
    }
  | { ok: false; error: string; code: string };

/**
 * Explicit shipment completion after DELIVERED.
 * Completed executions leave the observation watcher.
 */
export async function completeShipmentExecution(input: {
  bookingId: string;
  userId: string;
}): Promise<CompleteShipmentResult> {
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(input.bookingId)) ??
    (await repos.bookings.getByReference(input.bookingId));
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }

  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution) {
    return { ok: false, error: "Execution not found", code: "not_found" };
  }

  if (execution.status === "COMPLETED") {
    return { ok: true, execution, alreadyCompleted: true };
  }

  if (execution.status !== "DELIVERED") {
    return {
      ok: false,
      error: "Shipment must be DELIVERED before completion",
      code: "invalid_order",
    };
  }

  const now = new Date().toISOString();
  const summary = buildCloseoutSummary(execution, booking.bookingReference);

  const updated: ShipmentExecution = {
    ...execution,
    status: "COMPLETED",
    completedAt: now,
    completedByUserId: input.userId,
    closeoutSummary: summary,
    updatedAt: now,
  };
  await repos.shipmentExecutions.update(updated);

  await repos.shipmentMilestones.create({
    id: newId("ms"),
    shipmentExecutionId: execution.id,
    type: "COMPLETED",
    status: "CONFIRMED",
    occurredAt: now,
    source: "USER",
    notes: "User confirmed shipment execution complete",
    createdAt: now,
  });

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "SHIPMENT_COMPLETED",
    metadata: {
      executionId: execution.id,
      bookingId: booking.id,
    },
    createdAt: now,
  });

  return { ok: true, execution: updated };
}

function buildCloseoutSummary(
  execution: ShipmentExecution,
  bookingReference: string,
): string {
  const lines = [
    "Shipment completed",
    `Booking: ${bookingReference}`,
    `Route: ${execution.originPortId ?? "—"} → ${execution.destinationPortId ?? "—"}`,
    `Vessel: ${execution.vesselName ?? "—"}`,
    `Loaded: ${execution.actualLoadedAt ?? "—"}`,
    `Departed: ${execution.actualDepartedAt ?? "—"}`,
    `Arrived: ${execution.actualArrivedAt ?? "—"}`,
    `Discharged: ${execution.actualDischargedAt ?? "—"}`,
    `Delivered: ${execution.actualDeliveredAt ?? "—"}`,
  ];
  return lines.join("\n");
}
