import type { ShipmentExecution } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { associateVesselToExecution } from "@/server/execution/associateVessel";
import { resolvePortByNameOrId } from "@/server/execution/geofence";

export type StartTrackingResult =
  | {
      ok: true;
      execution: ShipmentExecution;
      alreadyStarted?: boolean;
      vesselAssociationPending?: boolean;
      vesselCandidates?: unknown;
    }
  | { ok: false; error: string; code: string };

/**
 * Start shipment execution tracking.
 * Requires READY_FOR_OPERATIONS + finalized handoff.
 * Does NOT mean the vessel has departed.
 */
export async function startShipmentTracking(input: {
  bookingId: string;
  userId: string;
}): Promise<StartTrackingResult> {
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(input.bookingId)) ??
    (await repos.bookings.getByReference(input.bookingId));
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }

  const existing = await repos.shipmentExecutions.getForBooking(booking.id);
  if (existing) {
    return { ok: true, execution: existing, alreadyStarted: true };
  }

  if (
    booking.status !== "READY_FOR_OPERATIONS" &&
    booking.status !== "IN_EXECUTION"
  ) {
    return {
      ok: false,
      error: "Booking must be READY_FOR_OPERATIONS",
      code: "not_ready",
    };
  }

  const handoff = await repos.handoffs.getLatestForBooking(booking.id);
  if (!handoff || handoff.status !== "FINALIZED") {
    return {
      ok: false,
      error: "Finalized operational handoff required",
      code: "handoff_required",
    };
  }

  const origin =
    resolvePortByNameOrId(booking.origin) ??
    resolvePortByNameOrId(handoff.shipmentSnapshot.origin);
  const destination =
    resolvePortByNameOrId(booking.destination) ??
    resolvePortByNameOrId(handoff.shipmentSnapshot.destination);

  const now = new Date().toISOString();
  const execution: ShipmentExecution = {
    id: newId("exec"),
    bookingId: booking.id,
    userId: input.userId,
    status: "READY_FOR_OPERATIONS",
    originPortId: origin?.id ?? null,
    destinationPortId: destination?.id ?? null,
    vesselId: null,
    vesselMmsi: booking.vesselSnapshot?.vesselMmsi ?? handoff.vesselSnapshot.vesselMmsi ?? null,
    vesselImo: booking.vesselSnapshot?.vesselImo ?? handoff.vesselSnapshot.vesselImo ?? null,
    vesselName:
      booking.vesselSnapshot?.vesselName ??
      handoff.vesselSnapshot.vesselName ??
      null,
    plannedEta: booking.commercialSnapshot.departure ?? null,
    latestObservedEta: null,
    handoffId: handoff.id,
    createdAt: now,
    updatedAt: now,
  };

  await repos.shipmentExecutions.create(execution);

  await repos.bookings.update({
    ...booking,
    status: "IN_EXECUTION",
    updatedAt: now,
  });

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "SHIPMENT_EXECUTION_CREATED",
    metadata: {
      executionId: execution.id,
      bookingId: booking.id,
      handoffId: handoff.id,
    },
    createdAt: now,
  });

  const assoc = await associateVesselToExecution({
    executionId: execution.id,
    userId: input.userId,
    bookingCommercialRequestId: booking.commercialRequestId,
  });

  if (assoc.ok && "requiresConfirmation" in assoc && assoc.requiresConfirmation) {
    return {
      ok: true,
      execution,
      vesselAssociationPending: true,
      vesselCandidates: assoc.candidates,
    };
  }

  const refreshed =
    (await repos.shipmentExecutions.get(execution.id)) ?? execution;

  return { ok: true, execution: refreshed };
}
