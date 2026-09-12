import type {
  Booking,
  BookingDocument,
  BookingDocumentRequirement,
  ShipmentExecution,
  ShipmentMilestone,
  ShipmentMilestoneCandidate,
  ShipmentObservation,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import {
  buildMaritimeCorridor,
  distancePointToPolylineKm,
} from "@/lib/search/buildCorridor";
import {
  buildPortGeofence,
  isInsideGeofence,
  resolvePortByNameOrId,
} from "@/server/execution/geofence";
import { classifyAisFreshness } from "@/server/execution/freshness";
import {
  applyExceptionDraft,
  type ExceptionDraft,
} from "@/server/exceptions/upsertException";
import {
  exceptionThresholds,
  formatDuration,
} from "@/server/exceptions/thresholds";

export interface EvaluateExceptionsSummary {
  evaluated: boolean;
  created: number;
  updated: number;
  autoResolved: number;
}

/**
 * Deterministic exception evaluation for one shipment execution.
 * Never auto-confirms milestones or changes vessel association.
 */
export async function evaluateShipmentExceptions(input: {
  executionId: string;
  nowMs?: number;
}): Promise<EvaluateExceptionsSummary> {
  const repos = getRepositories();
  const summary: EvaluateExceptionsSummary = {
    evaluated: false,
    created: 0,
    updated: 0,
    autoResolved: 0,
  };

  const execution = await repos.shipmentExecutions.get(input.executionId);
  if (!execution) return summary;

  const booking = await repos.bookings.get(execution.bookingId);
  if (!booking) return summary;

  // Completed: preserve history; do not create new live AIS/ETA/route exceptions
  if (execution.status === "COMPLETED") {
    return summary;
  }

  summary.evaluated = true;
  const nowMs = input.nowMs ?? Date.now();
  const thresholds = exceptionThresholds();

  const [observations, milestones, candidates, requirements, documents] =
    await Promise.all([
      repos.shipmentObservations.listForExecution(execution.id, 40),
      repos.shipmentMilestones.listForExecution(execution.id),
      repos.shipmentMilestoneCandidates.listPendingForExecution(execution.id),
      repos.documentRequirements.listForBooking(booking.id),
      repos.bookingDocuments.listForBooking(booking.id),
    ]);

  const latest = observations[0] ?? null;
  const drafts: ExceptionDraft[] = [];

  drafts.push(
    ...buildAisStaleDraft(execution, latest, thresholds.aisStaleMinutes, nowMs),
  );
  drafts.push(
    ...buildEtaSlippageDraft(execution, thresholds.etaSlippageMinutes),
  );
  drafts.push(
    ...buildRouteDeviationDraft(
      execution,
      latest,
      thresholds.routeDeviationKm,
    ),
  );
  drafts.push(
    ...buildOriginDwellDraft(
      execution,
      latest,
      thresholds.originDwellHours,
      nowMs,
    ),
  );
  drafts.push(
    ...buildDestinationDwellDraft(
      execution,
      thresholds.destinationDwellHours,
      nowMs,
    ),
  );
  drafts.push(
    ...buildMilestoneOverdueDrafts(
      execution,
      milestones,
      thresholds.milestoneGraceMinutes,
      nowMs,
    ),
  );
  drafts.push(...buildSourceConflictDrafts(execution, candidates, latest));
  drafts.push(
    ...buildDocumentRegressionDrafts(
      booking,
      execution,
      requirements,
      documents,
    ),
  );

  // Ensure inactive drafts for auto-resolvable types that didn't fire
  const activeTypes = new Set(drafts.filter((d) => d.active).map((d) => d.type));
  for (const type of [
    "AIS_STALE",
    "ETA_SLIPPAGE",
    "ROUTE_DEVIATION",
    "ORIGIN_DWELL",
    "DESTINATION_DWELL",
  ] as const) {
    if (!activeTypes.has(type)) {
      drafts.push({
        type,
        logicalKey: `${execution.id}:${type}`,
        severity: "INFO",
        title: type,
        explanation: "",
        evidence: [],
        source: "SYSTEM",
        active: false,
      });
    }
  }

  for (const draft of drafts) {
    const result = await applyExceptionDraft({
      shipmentExecutionId: execution.id,
      bookingId: booking.id,
      commercialRequestId: booking.commercialRequestId,
      draft,
    });
    if (result.created) summary.created += 1;
    if (result.updated) summary.updated += 1;
    if (result.autoResolved) summary.autoResolved += 1;
  }

  return summary;
}

function buildAisStaleDraft(
  execution: ShipmentExecution,
  latest: ShipmentObservation | null,
  staleMinutes: number,
  nowMs: number,
): ExceptionDraft[] {
  const key = `${execution.id}:AIS_STALE`;
  const inOps =
    execution.status === "IN_TRANSIT" ||
    execution.status === "LOADED" ||
    execution.status === "ARRIVED";
  if (!inOps || !latest) {
    return [
      {
        type: "AIS_STALE",
        logicalKey: key,
        severity: "INFO",
        title: "AIS position delayed",
        explanation: "",
        evidence: [],
        source: "AIS",
        active: false,
      },
    ];
  }

  const ageMs = nowMs - new Date(latest.observedAt).getTime();
  const freshness = classifyAisFreshness(latest.observedAt, nowMs);
  const active = ageMs >= staleMinutes * 60_000;

  if (!active) {
    return [
      {
        type: "AIS_STALE",
        logicalKey: key,
        severity: "INFO",
        title: "AIS position delayed",
        explanation: "",
        evidence: [],
        source: "AIS",
        active: false,
      },
    ];
  }

  const vessel = execution.vesselName ?? "the associated vessel";
  const severity =
    ageMs >= staleMinutes * 60_000 * 2 ? "WARNING" : "INFO";

  return [
    {
      type: "AIS_STALE",
      logicalKey: key,
      severity,
      title: "AIS position delayed",
      explanation: `No recent AIS position has been received for ${vessel}. Last observation was ${formatDuration(ageMs)} ago.`,
      evidence: [
        { label: "Last AIS observation", value: latest.observedAt },
        { label: "Freshness", value: freshness },
        {
          label: "Age",
          value: formatDuration(ageMs),
        },
      ],
      source: "AIS",
      active: true,
    },
  ];
}

function buildEtaSlippageDraft(
  execution: ShipmentExecution,
  slippageMinutes: number,
): ExceptionDraft[] {
  const key = `${execution.id}:ETA_SLIPPAGE`;
  const planned = execution.plannedEta;
  const aisEta = execution.latestObservedEta;
  if (!planned || !aisEta) {
    return [
      {
        type: "ETA_SLIPPAGE",
        logicalKey: key,
        severity: "INFO",
        title: "ETA difference",
        explanation: "",
        evidence: [],
        source: "AIS",
        active: false,
      },
    ];
  }

  const plannedMs = Date.parse(planned);
  const aisMs = Date.parse(aisEta);
  if (!Number.isFinite(plannedMs) || !Number.isFinite(aisMs)) {
    return [
      {
        type: "ETA_SLIPPAGE",
        logicalKey: key,
        severity: "INFO",
        title: "ETA difference",
        explanation: "",
        evidence: [],
        source: "AIS",
        active: false,
      },
    ];
  }

  const deltaMs = aisMs - plannedMs;
  const active = Math.abs(deltaMs) >= slippageMinutes * 60_000;
  if (!active) {
    return [
      {
        type: "ETA_SLIPPAGE",
        logicalKey: key,
        severity: "INFO",
        title: "ETA difference",
        explanation: "",
        evidence: [],
        source: "AIS",
        active: false,
      },
    ];
  }

  const sign = deltaMs >= 0 ? "+" : "−";
  return [
    {
      type: "ETA_SLIPPAGE",
      logicalKey: key,
      severity: Math.abs(deltaMs) >= slippageMinutes * 60_000 * 2 ? "WARNING" : "INFO",
      title: `ETA moved by ${sign}${formatDuration(deltaMs)}`,
      explanation: `The AIS-reported ETA differs from the confirmed ETA by ${sign}${formatDuration(deltaMs)}. This is an observation difference, not a prediction.`,
      evidence: [
        { label: "Confirmed ETA", value: planned },
        { label: "Latest AIS ETA", value: aisEta },
        { label: "Difference", value: `${sign}${formatDuration(deltaMs)}` },
      ],
      source: "AIS",
      active: true,
    },
  ];
}

function buildRouteDeviationDraft(
  execution: ShipmentExecution,
  latest: ShipmentObservation | null,
  thresholdKm: number,
): ExceptionDraft[] {
  const key = `${execution.id}:ROUTE_DEVIATION`;
  const inactive = (): ExceptionDraft[] => [
    {
      type: "ROUTE_DEVIATION",
      logicalKey: key,
      severity: "WARNING",
      title: "Outside reference corridor",
      explanation: "",
      evidence: [],
      source: "AIS",
      active: false,
    },
  ];

  if (
    !latest ||
    execution.status === "READY_FOR_OPERATIONS" ||
    execution.status === "LOADING_PLANNED"
  ) {
    return inactive();
  }

  const origin = resolvePortByNameOrId(execution.originPortId);
  const destination = resolvePortByNameOrId(execution.destinationPortId);
  if (!origin || !destination) return inactive();

  const corridor = buildMaritimeCorridor(origin, destination);
  const distanceKm = distancePointToPolylineKm(
    { latitude: latest.latitude, longitude: latest.longitude },
    corridor.waypoints,
  );

  if (distanceKm <= thresholdKm) return inactive();

  const vessel = execution.vesselName ?? "Associated vessel";
  return [
    {
      type: "ROUTE_DEVIATION",
      logicalKey: key,
      severity: "WARNING",
      title: "Outside shipment reference corridor",
      explanation: `${vessel} is approximately ${Math.round(distanceKm)} km from the shipment reference corridor.`,
      evidence: [
        {
          label: "Distance from corridor",
          value: `${Math.round(distanceKm)} km`,
        },
        {
          label: "Observation",
          value: `${latest.latitude.toFixed(3)}, ${latest.longitude.toFixed(3)} at ${latest.observedAt}`,
        },
        {
          label: "Note",
          value:
            "Reference corridor is not a navigational safety route.",
        },
      ],
      source: "AIS",
      active: true,
    },
  ];
}

function buildOriginDwellDraft(
  execution: ShipmentExecution,
  latest: ShipmentObservation | null,
  dwellHours: number,
  nowMs: number,
): ExceptionDraft[] {
  const key = `${execution.id}:ORIGIN_DWELL`;
  const inactive = (): ExceptionDraft[] => [
    {
      type: "ORIGIN_DWELL",
      logicalKey: key,
      severity: "WARNING",
      title: "Extended time near origin",
      explanation: "",
      evidence: [],
      source: "SYSTEM",
      active: false,
    },
  ];

  if (execution.status !== "LOADED" || execution.actualDepartedAt) {
    return inactive();
  }
  if (!execution.actualLoadedAt) return inactive();

  const loadedMs = Date.parse(execution.actualLoadedAt);
  if (!Number.isFinite(loadedMs)) return inactive();
  const elapsed = nowMs - loadedMs;
  if (elapsed < dwellHours * 3_600_000) return inactive();

  const origin = resolvePortByNameOrId(execution.originPortId);
  let nearOrigin = latest?.kind === "NEAR_ORIGIN";
  if (origin && latest) {
    nearOrigin =
      nearOrigin ||
      isInsideGeofence(
        { latitude: latest.latitude, longitude: latest.longitude },
        buildPortGeofence(origin),
      );
  }
  if (!nearOrigin) return inactive();

  const portName = origin?.name ?? "origin";
  return [
    {
      type: "ORIGIN_DWELL",
      logicalKey: key,
      severity: "WARNING",
      title: "Extended time near origin after loading",
      explanation: `Cargo was marked loaded ${formatDuration(elapsed)} ago and the associated vessel remains near ${portName}.`,
      evidence: [
        { label: "Loaded at", value: execution.actualLoadedAt },
        {
          label: "Elapsed",
          value: formatDuration(elapsed),
        },
        {
          label: "Note",
          value:
            "This is a workflow observation, not a labeled commercial delay.",
        },
      ],
      source: "SYSTEM",
      active: true,
    },
  ];
}

function buildDestinationDwellDraft(
  execution: ShipmentExecution,
  dwellHours: number,
  nowMs: number,
): ExceptionDraft[] {
  const key = `${execution.id}:DESTINATION_DWELL`;
  const inactive = (): ExceptionDraft[] => [
    {
      type: "DESTINATION_DWELL",
      logicalKey: key,
      severity: "WARNING",
      title: "Discharge still unconfirmed",
      explanation: "",
      evidence: [],
      source: "SYSTEM",
      active: false,
    },
  ];

  if (execution.status !== "ARRIVED" || execution.actualDischargedAt) {
    return inactive();
  }
  if (!execution.actualArrivedAt) return inactive();

  const arrivedMs = Date.parse(execution.actualArrivedAt);
  if (!Number.isFinite(arrivedMs)) return inactive();
  const elapsed = nowMs - arrivedMs;
  if (elapsed < dwellHours * 3_600_000) return inactive();

  return [
    {
      type: "DESTINATION_DWELL",
      logicalKey: key,
      severity: "WARNING",
      title: "Discharge still unconfirmed after arrival",
      explanation: `Shipment arrival was confirmed ${formatDuration(elapsed)} ago and discharge is still unconfirmed.`,
      evidence: [
        { label: "Arrived at", value: execution.actualArrivedAt },
        { label: "Elapsed", value: formatDuration(elapsed) },
        {
          label: "Note",
          value: "Workflow exception — not proof of operational delay.",
        },
      ],
      source: "SYSTEM",
      active: true,
    },
  ];
}

function buildMilestoneOverdueDrafts(
  execution: ShipmentExecution,
  milestones: ShipmentMilestone[],
  graceMinutes: number,
  nowMs: number,
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];
  const planned = milestones.filter(
    (m) =>
      m.status === "PLANNED" &&
      m.expectedAt &&
      (m.type === "DEPARTED" || m.type === "ARRIVED" || m.type === "LOADED"),
  );

  for (const m of planned) {
    const key = `${execution.id}:MILESTONE_OVERDUE:${m.type}`;
    const expectedMs = Date.parse(m.expectedAt!);
    if (!Number.isFinite(expectedMs)) continue;
    const confirmed = milestones.find(
      (x) => x.type === m.type && x.status === "CONFIRMED",
    );
    if (confirmed) {
      drafts.push({
        type: "MILESTONE_OVERDUE",
        logicalKey: key,
        severity: "WARNING",
        title: `${m.type} overdue`,
        explanation: "",
        evidence: [],
        source: "SYSTEM",
        active: false,
      });
      continue;
    }
    const overdue = nowMs - expectedMs >= graceMinutes * 60_000;
    if (!overdue) {
      drafts.push({
        type: "MILESTONE_OVERDUE",
        logicalKey: key,
        severity: "WARNING",
        title: `${m.type} overdue`,
        explanation: "",
        evidence: [],
        source: "SYSTEM",
        active: false,
      });
      continue;
    }
    drafts.push({
      type: "MILESTONE_OVERDUE",
      logicalKey: key,
      severity: "WARNING",
      title: `Planned ${m.type.replace(/_/g, " ").toLowerCase()} passed`,
      explanation: `A planned ${m.type.replace(/_/g, " ").toLowerCase()} timestamp has passed without confirmation.`,
      evidence: [
        { label: "Planned time", value: m.expectedAt! },
        {
          label: "Grace",
          value: `${graceMinutes} minutes`,
        },
      ],
      source: "SYSTEM",
      active: true,
    });
  }
  return drafts;
}

function buildSourceConflictDrafts(
  execution: ShipmentExecution,
  candidates: ShipmentMilestoneCandidate[],
  latest: ShipmentObservation | null,
): ExceptionDraft[] {
  const drafts: ExceptionDraft[] = [];
  for (const c of candidates) {
    if (!c.conflictWarning) continue;
    const key = `${execution.id}:SOURCE_CONFLICT:${c.id}`;
    drafts.push({
      type: "SOURCE_CONFLICT",
      logicalKey: key,
      severity: c.confidence >= 0.85 ? "HIGH" : "WARNING",
      title: "Broker update may conflict with AIS",
      explanation: c.conflictWarning,
      evidence: [
        {
          label: "Broker update",
          value: c.evidenceText ?? c.proposedType,
          reference: c.inboundMessageId ?? null,
        },
        {
          label: "Proposed time hint",
          value: c.proposedOccurredAt ?? "not extracted",
        },
        {
          label: "Latest AIS kind",
          value: latest?.kind ?? "none",
        },
        {
          label: "Latest AIS time",
          value: latest?.observedAt ?? "none",
        },
      ],
      source: "EMAIL",
      active: true,
    });
  }
  return drafts;
}

function buildDocumentRegressionDrafts(
  booking: Booking,
  execution: ShipmentExecution,
  requirements: BookingDocumentRequirement[],
  documents: BookingDocument[],
): ExceptionDraft[] {
  const packageWasReady =
    booking.status === "READY_FOR_OPERATIONS" ||
    booking.status === "IN_EXECUTION" ||
    Boolean(execution.handoffId);
  if (!packageWasReady) return [];

  const drafts: ExceptionDraft[] = [];
  for (const req of requirements.filter((r) => r.required)) {
    const current = documents
      .filter((d) => d.documentType === req.documentType && d.isCurrent)
      .sort((a, b) => b.version - a.version)[0];

    const key = `${execution.id}:DOCUMENT_REGRESSION:${req.documentType}`;
    const invalid =
      !current ||
      current.validationStatus === "FAIL" ||
      req.status === "REJECTED" ||
      req.status === "MISSING";

    if (!invalid) continue;

    drafts.push({
      type: "DOCUMENT_REGRESSION",
      logicalKey: key,
      severity: "HIGH",
      title: "Required document needs attention",
      explanation: `A required ${req.documentType.replace(/_/g, " ").toLowerCase()} document is missing, rejected, or failed validation while the shipment is operationally active.`,
      evidence: [
        { label: "Document type", value: req.documentType },
        {
          label: "Requirement status",
          value: req.status,
        },
        {
          label: "Current validation",
          value: current?.validationStatus ?? "missing",
        },
      ],
      source: "DOCUMENT",
      active: true,
    });
  }
  return drafts;
}

/** Evaluate exceptions for a booking's active execution (email/document hooks). */
export async function evaluateExceptionsForBooking(
  bookingId: string,
): Promise<EvaluateExceptionsSummary> {
  const repos = getRepositories();
  const execution = await repos.shipmentExecutions.getForBooking(bookingId);
  if (!execution || execution.status === "COMPLETED") {
    return { evaluated: false, created: 0, updated: 0, autoResolved: 0 };
  }
  return evaluateShipmentExceptions({ executionId: execution.id });
}
