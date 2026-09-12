import type {
  Booking,
  ClaimDurationFact,
  ClaimEvidenceItem,
  ClaimMissingEvidence,
  ClaimTimelineEntry,
  ClaimType,
  OperationalException,
  ShipmentExecution,
  ShipmentMilestone,
  ShipmentMilestoneCandidate,
  ShipmentObservation,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  elapsedLabel,
  elapsedMs,
  unsignedElapsedLabel,
} from "@/server/claims/durations";

export async function collectClaimEvidence(input: {
  claimPreparationId: string;
  booking: Booking;
  execution: ShipmentExecution | null;
  relatedExceptionIds: string[];
  claimType: ClaimType;
}): Promise<{
  items: ClaimEvidenceItem[];
  timeline: ClaimTimelineEntry[];
  durations: ClaimDurationFact[];
  missing: ClaimMissingEvidence[];
  warnings: string[];
}> {
  const repos = getRepositories();
  const now = new Date().toISOString();
  const items: ClaimEvidenceItem[] = [];
  let code = 1;
  const nextCode = () => `E${code++}`;

  const push = (
    partial: Omit<ClaimEvidenceItem, "id" | "claimPreparationId" | "createdAt" | "registerCode">,
  ) => {
    items.push({
      id: newId("cev"),
      claimPreparationId: input.claimPreparationId,
      registerCode: nextCode(),
      createdAt: now,
      ...partial,
    });
  };

  push({
    type: "BOOKING_SNAPSHOT",
    sourceId: input.booking.id,
    title: `Booking ${input.booking.bookingReference}`,
    occurredAt: input.booking.confirmedAt ?? input.booking.createdAt,
    sourceLabel: "Booking snapshot",
    factualSummary: `${input.booking.origin ?? "—"} → ${input.booking.destination ?? "—"} · ${input.booking.status}`,
    included: true,
  });

  const snapId = input.booking.commercialRequestId;
  // Prefer confirmation-linked accepted snapshot when present
  const confirmation = await repos.confirmations.getLatestForRequest(snapId);
  if (confirmation) {
    const accepted = await repos.acceptedSnapshots.getForConfirmation(
      confirmation.id,
    );
    if (accepted) {
      push({
        type: "COMMERCIAL_SNAPSHOT",
        sourceId: accepted.id,
        title: "Accepted commercial terms",
        occurredAt: accepted.acceptedAt,
        sourceLabel: "Accepted commercial snapshot",
        factualSummary:
          "Accepted commercial terms snapshot preserved at booking time.",
        included: true,
      });
    }
  }

  if (input.booking.commercialSnapshot) {
    const cs = input.booking.commercialSnapshot;
    push({
      type: "COMMERCIAL_SNAPSHOT",
      sourceId: input.booking.id,
      title: "Booking commercial terms",
      occurredAt: input.booking.confirmedAt ?? input.booking.createdAt,
      sourceLabel: "Booking commercial snapshot",
      factualSummary: [
        cs.currency,
        cs.rate != null ? String(cs.rate) : null,
        cs.vesselName,
        cs.departure,
      ]
        .filter(Boolean)
        .join(" · ") || "Commercial terms on booking",
      included: true,
    });
  }

  const handoff = await repos.handoffs.getLatestForBooking(input.booking.id);
  if (handoff) {
    push({
      type: "HANDOFF",
      sourceId: handoff.id,
      title: `Operational handoff ${handoff.handoffReference}`,
      occurredAt: handoff.finalizedAt ?? handoff.generatedAt,
      sourceLabel: "Operational handoff",
      factualSummary: `Status ${handoff.status}`,
      included: true,
    });
  }

  const messages = await repos.messages.listForRequest(
    input.booking.commercialRequestId,
  );
  for (const m of messages.slice(-12)) {
    push({
      type: "EMAIL",
      sourceId: m.id,
      title: m.subject || `${m.direction} email`,
      occurredAt: m.receivedAt ?? m.createdAt,
      sourceLabel:
        m.direction === "INBOUND" ? "Inbound email" : "Outbound email",
      factualSummary: `${m.fromAddress} → ${m.toAddress ?? ""}`.trim(),
      included: true,
    });
  }

  const docs = await repos.bookingDocuments.listCurrentForBooking(
    input.booking.id,
  );
  for (const d of docs) {
    if (d.scanStatus === "INFECTED" || d.quarantined) continue;
    push({
      type: "DOCUMENT",
      sourceId: d.id,
      title: d.filename,
      occurredAt: d.uploadedAt,
      sourceLabel: `Document · ${d.documentType}`,
      factualSummary: `Validation: ${d.validationStatus}`,
      included: true,
    });
  }

  let milestones: ShipmentMilestone[] = [];
  let observations: ShipmentObservation[] = [];
  let candidates: ShipmentMilestoneCandidate[] = [];
  let exceptions: OperationalException[] = [];

  if (input.execution) {
    milestones = await repos.shipmentMilestones.listForExecution(
      input.execution.id,
    );
    observations = await repos.shipmentObservations.listForExecution(
      input.execution.id,
      40,
    );
    candidates = await repos.shipmentMilestoneCandidates.listForExecution(
      input.execution.id,
    );
    exceptions = await repos.operationalExceptions.listForExecution(
      input.execution.id,
    );

    for (const m of milestones.filter((x) => x.status === "CONFIRMED")) {
      push({
        type: "MILESTONE",
        sourceId: m.id,
        title: `${m.type.replace(/_/g, " ")} confirmed`,
        occurredAt: m.occurredAt ?? m.createdAt,
        sourceLabel: `Milestone · ${m.source}`,
        factualSummary: m.notes ?? `Confirmed ${m.type}`,
        included: true,
      });
    }

    // Meaningful AIS: geofence events + periodic spaced samples
    const meaningfulObs = observations.filter(
      (o) =>
        o.kind === "NEAR_ORIGIN" ||
        o.kind === "LEFT_ORIGIN_AREA" ||
        o.kind === "AT_DESTINATION" ||
        o.kind === "NEAR_DESTINATION" ||
        o.kind === "STALE" ||
        o.kind === "UNDERWAY",
    );
    for (const o of meaningfulObs.slice(0, 20)) {
      push({
        type: "AIS_OBSERVATION",
        sourceId: o.id,
        title: `AIS ${o.kind.replace(/_/g, " ").toLowerCase()}`,
        occurredAt: o.observedAt,
        sourceLabel: "Shipment observation",
        factualSummary: `${o.latitude.toFixed(3)}, ${o.longitude.toFixed(3)} · ${o.sog ?? "—"} kn · ${o.freshnessLabel}`,
        included: true,
      });
    }

    for (const c of candidates.filter((x) => x.status !== "DISMISSED")) {
      push({
        type: "EMAIL",
        sourceId: c.inboundMessageId ?? c.id,
        title: `Broker milestone candidate: ${c.proposedType}`,
        occurredAt: c.proposedOccurredAt ?? c.createdAt,
        sourceLabel: "Broker email candidate",
        factualSummary: c.evidenceText ?? c.proposedType,
        included: true,
      });
    }

    const related = new Set(input.relatedExceptionIds);
    for (const ex of exceptions) {
      if (related.size && !related.has(ex.id)) continue;
      if (!related.size && ex.severity === "INFO") continue;
      push({
        type: "EXCEPTION",
        sourceId: ex.id,
        title: ex.title,
        occurredAt: ex.detectedAt,
        sourceLabel: `Operational exception · ${ex.type}`,
        factualSummary: ex.explanation,
        included: true,
      });
    }
  }

  // Persist items
  for (const item of items) {
    await repos.claimEvidenceItems.create(item);
  }

  const timeline = buildFactualTimeline(items, observations, milestones);
  const durations = buildDurationFacts(
    input.claimType,
    input.execution,
    milestones,
    observations,
  );
  const missing = buildMissingEvidence(
    input.claimType,
    input.booking,
    docs,
    input.execution,
  );
  const warnings = buildWarnings(items, input.execution, exceptions);

  return { items, timeline, durations, missing, warnings };
}

function buildFactualTimeline(
  items: ClaimEvidenceItem[],
  observations: ShipmentObservation[],
  milestones: ShipmentMilestone[],
): ClaimTimelineEntry[] {
  const entries: ClaimTimelineEntry[] = [];

  for (const item of items.filter((i) => i.included && i.occurredAt)) {
    entries.push({
      id: newId("ctl"),
      occurredAt: item.occurredAt!,
      title: item.title,
      factualSummary: item.factualSummary ?? item.title,
      sourceLabel: item.sourceLabel,
      evidenceItemId: item.id,
    });
  }

  // Preserve departure conflicts as a group without picking a winner
  const depConfirmed = milestones.find(
    (m) => m.type === "DEPARTED" && m.status === "CONFIRMED",
  );
  const left = observations.find((o) => o.kind === "LEFT_ORIGIN_AREA");
  const near = observations.find((o) => o.kind === "NEAR_ORIGIN");
  if (depConfirmed?.occurredAt && (left || near)) {
    const group = newId("conflict");
    for (const e of entries) {
      if (
        e.title.includes("DEPARTED") ||
        e.title.toLowerCase().includes("depart") ||
        e.title.includes("LEFT ORIGIN") ||
        e.title.toLowerCase().includes("near origin")
      ) {
        e.conflictGroupId = group;
      }
    }
  }

  return entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function buildDurationFacts(
  claimType: ClaimType,
  execution: ShipmentExecution | null,
  milestones: ShipmentMilestone[],
  observations: ShipmentObservation[],
): ClaimDurationFact[] {
  const facts: ClaimDurationFact[] = [];
  if (!execution) return facts;

  const planned = execution.plannedEta;
  const arrived = execution.actualArrivedAt;
  if (planned && arrived) {
    const ms = elapsedMs(planned, arrived);
    if (ms != null) {
      facts.push({
        id: newId("cdf"),
        label: "planned_vs_actual_arrival",
        displayLabel: "Observed arrival difference",
        startAt: planned,
        endAt: arrived,
        elapsedMs: ms,
        elapsedLabel: elapsedLabel(ms),
        note: "Elapsed-time calculation between confirmed/planned ETA and confirmed arrival. Not a compensable-delay determination.",
      });
    }
  }

  if (execution.actualLoadedAt && execution.actualDepartedAt) {
    const ms = elapsedMs(execution.actualLoadedAt, execution.actualDepartedAt);
    if (ms != null) {
      facts.push({
        id: newId("cdf"),
        label: "loaded_to_departure",
        displayLabel: "Elapsed loaded → departure",
        startAt: execution.actualLoadedAt,
        endAt: execution.actualDepartedAt,
        elapsedMs: ms,
        elapsedLabel: unsignedElapsedLabel(ms),
      });
    }
  }

  if (execution.actualArrivedAt && execution.actualDischargedAt) {
    const ms = elapsedMs(
      execution.actualArrivedAt,
      execution.actualDischargedAt,
    );
    if (ms != null) {
      facts.push({
        id: newId("cdf"),
        label: "arrival_to_discharge",
        displayLabel: "Elapsed arrival → discharge",
        startAt: execution.actualArrivedAt,
        endAt: execution.actualDischargedAt,
        elapsedMs: ms,
        elapsedLabel: unsignedElapsedLabel(ms),
      });
    }
  }

  // Departure timing discrepancy (broker candidate vs AIS)
  const dep = milestones.find(
    (m) => m.type === "DEPARTED" && m.status === "CONFIRMED",
  );
  const left = observations
    .filter((o) => o.kind === "LEFT_ORIGIN_AREA")
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))[0];
  const stillNear = observations
    .filter((o) => o.kind === "NEAR_ORIGIN")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];

  if (dep?.occurredAt && left) {
    const ms = elapsedMs(dep.occurredAt, left.observedAt);
    if (ms != null && Math.abs(ms) >= 30 * 60_000) {
      facts.push({
        id: newId("cdf"),
        label: "departure_timing_discrepancy",
        displayLabel: "Potential timing discrepancy",
        startAt: dep.occurredAt,
        endAt: left.observedAt,
        elapsedMs: ms,
        elapsedLabel: `approximately ${unsignedElapsedLabel(ms)}`,
        note: "Broker/confirmed departure and AIS origin-exit times differ. No source is declared correct.",
      });
    }
  } else if (dep?.occurredAt && stillNear) {
    const ms = elapsedMs(dep.occurredAt, stillNear.observedAt);
    if (ms != null && ms > 0) {
      facts.push({
        id: newId("cdf"),
        label: "departure_vs_near_origin",
        displayLabel: "Potential timing discrepancy",
        startAt: dep.occurredAt,
        endAt: stillNear.observedAt,
        elapsedMs: ms,
        elapsedLabel: `approximately ${unsignedElapsedLabel(ms)}`,
        note: "Confirmed departure time and later near-origin AIS observation differ. No source is declared correct.",
      });
    }
  }

  if (
    claimType === "DEMURRAGE_PREPARATION" &&
    !facts.some((f) => f.label === "arrival_to_discharge")
  ) {
    // already handled above when both timestamps exist
  }

  return facts;
}

function buildMissingEvidence(
  claimType: ClaimType,
  _booking: Booking,
  docs: { documentType: string }[],
  execution: ShipmentExecution | null,
): ClaimMissingEvidence[] {
  const missing: ClaimMissingEvidence[] = [];
  const types = new Set(docs.map((d) => d.documentType));

  const need = (id: string, label: string, reason: string) => {
    missing.push({ id, label, reason });
  };

  if (![...types].some((t) => /BILL_OF_LADING|BL|BOL/i.test(t))) {
    need(
      "bl",
      "Signed bill of lading not available",
      "Potentially relevant evidence not currently available in CargoConnect.",
    );
  }
  if (![...types].some((t) => /NOR|NOTICE_OF_READINESS/i.test(t))) {
    need(
      "nor",
      "Notice of Readiness not uploaded",
      "Potentially relevant evidence not currently available in CargoConnect.",
    );
  }

  if (claimType === "DELAY" || claimType === "DEMURRAGE_PREPARATION") {
    need(
      "demurrage_rate",
      "Contractual demurrage / free-time terms not captured",
      "Potentially relevant evidence not currently available. No payable amount was calculated.",
    );
  }

  if (claimType === "DELAY") {
    need(
      "delay_terms",
      "Contractual delay/compensation terms not captured",
      "Potentially relevant evidence not currently available in CargoConnect.",
    );
  }

  if (
    (claimType === "DEMURRAGE_PREPARATION" || claimType === "DELIVERY_DELAY") &&
    execution &&
    !execution.actualDischargedAt
  ) {
    need(
      "discharge_complete",
      "Discharge completion evidence unavailable",
      "Potentially relevant evidence not currently available.",
    );
  }

  if (
    claimType === "DELIVERY_DELAY" &&
    execution &&
    !execution.actualDeliveredAt
  ) {
    need(
      "delivery_ack",
      "Delivery acknowledgment not uploaded",
      "Potentially relevant evidence not currently available.",
    );
  }

  return missing;
}

function buildWarnings(
  items: ClaimEvidenceItem[],
  execution: ShipmentExecution | null,
  exceptions: OperationalException[],
): string[] {
  const warnings = [
    "AIS is observational evidence only and does not prove cargo events.",
    "Reference corridor is approximate and is not a navigational safety route.",
    "CargoConnect prepares an evidence package and does not determine contractual or legal liability.",
  ];
  if (items.some((i) => i.type === "AIS_OBSERVATION")) {
    warnings.push(
      "AIS-reported ETA is not treated as a contractual promise unless separately identified as such.",
    );
  }
  if (exceptions.some((e) => e.type === "SOURCE_CONFLICT")) {
    warnings.push("Broker email and AIS timing differ for at least one milestone.");
  }
  if (
    !items.some((i) => i.type === "COMMERCIAL_SNAPSHOT") &&
    !execution
  ) {
    warnings.push("Contract text may not be fully available in CargoConnect.");
  }
  return warnings;
}

export function mapExceptionToClaimType(
  type: string,
): ClaimType {
  switch (type) {
    case "ETA_SLIPPAGE":
      return "DELAY";
    case "VESSEL_SUBSTITUTION":
      return "VESSEL_SUBSTITUTION";
    case "SOURCE_CONFLICT":
    case "MILESTONE_OVERDUE":
      return "MILESTONE_DISPUTE";
    case "DOCUMENT_REGRESSION":
      return "DOCUMENT_DISPUTE";
    case "ORIGIN_DWELL":
    case "DESTINATION_DWELL":
      return "DEMURRAGE_PREPARATION";
    default:
      return "OTHER";
  }
}
