import type {
  ShipmentExecution,
  ShipmentExecutionStatus,
  ShipmentMilestone,
  ShipmentMilestoneType,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const CONFIRMABLE = new Set<ShipmentMilestoneType>([
  "LOADING_PLANNED",
  "LOADED",
  "DEPARTED",
  "ARRIVED",
  "DISCHARGED",
  "DELIVERED",
]);

/** Required prior confirmed milestone (or execution status) before confirming. */
const PREREQ: Partial<
  Record<ShipmentMilestoneType, ShipmentMilestoneType | ShipmentExecutionStatus>
> = {
  DEPARTED: "LOADED",
  ARRIVED: "DEPARTED",
  DISCHARGED: "ARRIVED",
  DELIVERED: "DISCHARGED",
};

export type ConfirmMilestoneResult =
  | {
      ok: true;
      milestone: ShipmentMilestone;
      execution: ShipmentExecution;
      alreadyConfirmed?: boolean;
    }
  | { ok: false; error: string; code: string };

/**
 * Explicit user confirmation of operational milestones.
 * AIS / email never auto-call this for cargo events.
 */
export async function confirmShipmentMilestone(input: {
  bookingId: string;
  userId: string;
  type: ShipmentMilestoneType;
  occurredAt?: string | null;
  notes?: string | null;
  candidateId?: string | null;
}): Promise<ConfirmMilestoneResult> {
  if (!CONFIRMABLE.has(input.type)) {
    return {
      ok: false,
      error: "Milestone type is not user-confirmable",
      code: "invalid_type",
    };
  }

  const repos = getRepositories();
  const booking = await repos.bookings.get(input.bookingId);
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }

  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution) {
    return { ok: false, error: "Shipment execution not found", code: "not_found" };
  }

  if (execution.status === "COMPLETED") {
    return {
      ok: false,
      error: "Completed shipment milestones are immutable",
      code: "immutable",
    };
  }

  const existing = await repos.shipmentMilestones.getLatestConfirmed(
    execution.id,
    input.type,
  );
  if (existing) {
    return {
      ok: true,
      milestone: existing,
      execution,
      alreadyConfirmed: true,
    };
  }

  const orderError = await checkSequence(execution, input.type);
  if (orderError) {
    return { ok: false, error: orderError, code: "invalid_order" };
  }

  const now = new Date().toISOString();
  const occurredAt = input.occurredAt ?? now;
  const all = await repos.shipmentMilestones.listForExecution(execution.id);

  const milestone: ShipmentMilestone = {
    id: newId("ms"),
    shipmentExecutionId: execution.id,
    type: input.type,
    status: "CONFIRMED",
    occurredAt,
    source: "USER",
    sourceReference: input.candidateId ?? null,
    notes: input.notes ?? null,
    observationContext: {
      supportedByAis: all.some(
        (m) =>
          (input.type === "DEPARTED" &&
            m.type === "VESSEL_LEFT_ORIGIN_AREA") ||
          (input.type === "ARRIVED" && m.type === "VESSEL_AT_DESTINATION") ||
          (input.type === "LOADED" && m.type === "VESSEL_AT_ORIGIN"),
      ),
      fromCandidateId: input.candidateId ?? null,
    },
    createdAt: now,
  };
  await repos.shipmentMilestones.create(milestone);

  const updated: ShipmentExecution = {
    ...execution,
    status: deriveStatus(execution.status, input.type),
    actualLoadedAt:
      input.type === "LOADED" ? occurredAt : execution.actualLoadedAt,
    actualDepartedAt:
      input.type === "DEPARTED" ? occurredAt : execution.actualDepartedAt,
    actualArrivedAt:
      input.type === "ARRIVED" ? occurredAt : execution.actualArrivedAt,
    actualDischargedAt:
      input.type === "DISCHARGED" ? occurredAt : execution.actualDischargedAt,
    actualDeliveredAt:
      input.type === "DELIVERED" ? occurredAt : execution.actualDeliveredAt,
    updatedAt: now,
  };

  if (input.type === "DEPARTED") {
    updated.status = "IN_TRANSIT";
    await repos.shipmentMilestones.create({
      id: newId("ms"),
      shipmentExecutionId: execution.id,
      type: "IN_TRANSIT",
      status: "CONFIRMED",
      occurredAt,
      source: "SYSTEM",
      notes: "Derived after confirmed departure",
      createdAt: now,
    });
  }

  await repos.shipmentExecutions.update(updated);

  if (input.candidateId) {
    const cand = await repos.shipmentMilestoneCandidates.get(input.candidateId);
    if (cand && cand.shipmentExecutionId === execution.id) {
      await repos.shipmentMilestoneCandidates.update({
        ...cand,
        status: "CONFIRMED",
        reviewedAt: now,
        reviewedByUserId: input.userId,
      });
    }
  }

  const auditType =
    input.type === "LOADED"
      ? "LOADING_CONFIRMED"
      : input.type === "DEPARTED"
        ? "DEPARTURE_CONFIRMED"
        : input.type === "ARRIVED"
          ? "ARRIVAL_CONFIRMED"
          : input.type === "DISCHARGED"
            ? "DISCHARGE_CONFIRMED"
            : input.type === "DELIVERED"
              ? "DELIVERY_CONFIRMED"
              : "MILESTONE_CONFIRMED";

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: auditType,
    metadata: {
      executionId: execution.id,
      milestoneType: input.type,
      occurredAt,
      candidateId: input.candidateId ?? null,
    },
    createdAt: now,
  });

  return { ok: true, milestone, execution: updated };
}

export async function dismissMilestoneCandidate(input: {
  bookingId: string;
  userId: string;
  candidateId: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; code: string }
> {
  const repos = getRepositories();
  const booking = await repos.bookings.get(input.bookingId);
  if (!booking || booking.userId !== input.userId) {
    return { ok: false, error: "Booking not found", code: "not_found" };
  }
  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution) {
    return { ok: false, error: "Execution not found", code: "not_found" };
  }
  const cand = await repos.shipmentMilestoneCandidates.get(input.candidateId);
  if (!cand || cand.shipmentExecutionId !== execution.id) {
    return { ok: false, error: "Candidate not found", code: "not_found" };
  }
  if (cand.status !== "PENDING") {
    return { ok: true };
  }
  const now = new Date().toISOString();
  await repos.shipmentMilestoneCandidates.update({
    ...cand,
    status: "DISMISSED",
    reviewedAt: now,
    reviewedByUserId: input.userId,
  });
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: booking.commercialRequestId,
    userId: input.userId,
    eventType: "MILESTONE_CANDIDATE_DISMISSED",
    metadata: { candidateId: cand.id, proposedType: cand.proposedType },
    createdAt: now,
  });
  return { ok: true };
}

async function checkSequence(
  execution: ShipmentExecution,
  type: ShipmentMilestoneType,
): Promise<string | null> {
  const prereq = PREREQ[type];
  if (!prereq) return null;

  const repos = getRepositories();
  if (type === "DEPARTED") {
    const loaded = await repos.shipmentMilestones.getLatestConfirmed(
      execution.id,
      "LOADED",
    );
    if (!loaded && execution.status === "READY_FOR_OPERATIONS") {
      // Allow departure after loaded OR if already past LOADED status
      return "Confirm LOADED before DEPARTED";
    }
    if (
      !loaded &&
      execution.status !== "LOADED" &&
      execution.status !== "IN_TRANSIT" &&
      execution.status !== "LOADING_PLANNED"
    ) {
      // if somehow already past, ok
    }
    if (!loaded && !execution.actualLoadedAt) {
      return "Confirm LOADED before DEPARTED";
    }
  }
  if (type === "ARRIVED") {
    if (!execution.actualDepartedAt) {
      return "Confirm DEPARTED before ARRIVED";
    }
  }
  if (type === "DISCHARGED") {
    if (!execution.actualArrivedAt) {
      return "Confirm ARRIVED before DISCHARGED";
    }
  }
  if (type === "DELIVERED") {
    if (!execution.actualDischargedAt) {
      return "Confirm DISCHARGED before DELIVERED";
    }
  }
  return null;
}

function deriveStatus(
  current: ShipmentExecutionStatus,
  type: ShipmentMilestoneType,
): ShipmentExecutionStatus {
  switch (type) {
    case "LOADING_PLANNED":
      return "LOADING_PLANNED";
    case "LOADED":
      return "LOADED";
    case "DEPARTED":
      return "IN_TRANSIT";
    case "ARRIVED":
      return "ARRIVED";
    case "DISCHARGED":
      return "DISCHARGED";
    case "DELIVERED":
      return "DELIVERED";
    default:
      return current;
  }
}
