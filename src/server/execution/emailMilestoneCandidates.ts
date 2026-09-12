import type {
  ShipmentMilestoneCandidate,
  ShipmentMilestoneType,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import { haversineKm } from "@/lib/search/buildCorridor";
import {
  buildPortGeofence,
  isInsideGeofence,
  resolvePortByNameOrId,
} from "@/server/execution/geofence";

interface DetectedPhrase {
  type: ShipmentMilestoneType;
  confidence: number;
  evidenceText: string;
  proposedOccurredAt?: string | null;
}

const PATTERNS: Array<{
  type: ShipmentMilestoneType;
  re: RegExp;
  confidence: number;
}> = [
  {
    type: "LOADED",
    re: /\b(cargo\s+loading\s+completed|cargo\s+loaded|loading\s+completed)\b/i,
    confidence: 0.82,
  },
  {
    type: "DEPARTED",
    re: /\b(vessel\s+sailed|sailed\s+\w+|departed(?:\s+at)?|has\s+sailed)\b/i,
    confidence: 0.85,
  },
  {
    type: "ARRIVED",
    re: /\b(vessel\s+arrived|arrived\s+\w+|has\s+arrived)\b/i,
    confidence: 0.85,
  },
  {
    type: "DISCHARGED",
    re: /\b(discharging\s+completed|cargo\s+discharged|discharge\s+completed)\b/i,
    confidence: 0.84,
  },
  {
    type: "DELIVERED",
    re: /\b(cargo\s+delivered|delivery\s+completed|delivered\s+to\s+consignee)\b/i,
    confidence: 0.84,
  },
];

function extractTimeHint(text: string): string | null {
  const m = text.match(
    /\bat\s+(\d{1,2}:\d{2})(?:\s*(UTC|LT|local))?/i,
  );
  if (!m) return null;
  // Keep as clock hint — full ISO attached by caller with today's date if needed
  return m[1];
}

export function detectOperationalMilestonePhrases(
  text: string,
): DetectedPhrase[] {
  const found: DetectedPhrase[] = [];
  for (const p of PATTERNS) {
    const match = text.match(p.re);
    if (!match) continue;
    const start = Math.max(0, (match.index ?? 0) - 40);
    const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 60);
    const evidenceText = text.slice(start, end).replace(/\s+/g, " ").trim();
    found.push({
      type: p.type,
      confidence: p.confidence,
      evidenceText,
      proposedOccurredAt: extractTimeHint(text),
    });
  }
  return found;
}

/**
 * Create PENDING broker-email milestone candidates. Never auto-confirms.
 */
export async function createEmailMilestoneCandidates(input: {
  commercialRequestId: string;
  inboundMessageId: string;
  fromAddress: string;
  senderTrust?: string | null;
  textBody: string;
}): Promise<ShipmentMilestoneCandidate[]> {
  const repos = getRepositories();
  const booking = await repos.bookings.getForRequest(input.commercialRequestId);
  if (!booking) return [];

  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution || execution.status === "COMPLETED") return [];

  const detected = detectOperationalMilestonePhrases(input.textBody);
  if (!detected.length) return [];

  const created: ShipmentMilestoneCandidate[] = [];
  const now = new Date().toISOString();

  for (const d of detected) {
    // Skip if already confirmed operationally
    const confirmed = await repos.shipmentMilestones.getLatestConfirmed(
      execution.id,
      d.type,
    );
    if (confirmed) continue;

    const pending = await repos.shipmentMilestoneCandidates.listPendingForExecution(
      execution.id,
    );
    if (pending.some((c) => c.proposedType === d.type)) continue;

    const { conflictWarning, corroborationNote } = await evaluateEvidence({
      executionId: execution.id,
      type: d.type,
      proposedClock: d.proposedOccurredAt,
    });

    const candidate: ShipmentMilestoneCandidate = {
      id: newId("mscand"),
      shipmentExecutionId: execution.id,
      proposedType: d.type,
      source: "BROKER_EMAIL",
      sourceReference: input.inboundMessageId,
      inboundMessageId: input.inboundMessageId,
      proposedOccurredAt: d.proposedOccurredAt,
      confidence: d.confidence,
      evidenceText: d.evidenceText,
      senderTrust: input.senderTrust ?? null,
      fromAddress: input.fromAddress,
      status: "PENDING",
      conflictWarning,
      corroborationNote,
      createdAt: now,
    };
    await repos.shipmentMilestoneCandidates.create(candidate);
    created.push(candidate);

    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: input.commercialRequestId,
      eventType: "MILESTONE_CANDIDATE_FROM_EMAIL",
      metadata: {
        executionId: execution.id,
        candidateId: candidate.id,
        proposedType: d.type,
        inboundMessageId: input.inboundMessageId,
        confidence: d.confidence,
      },
      createdAt: now,
    });

    if (corroborationNote) {
      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: input.commercialRequestId,
        eventType: "MILESTONE_EVIDENCE_CORROBORATED",
        metadata: {
          candidateId: candidate.id,
          note: corroborationNote,
        },
        createdAt: now,
      });
    }
    if (conflictWarning) {
      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: input.commercialRequestId,
        eventType: "MILESTONE_SOURCE_CONFLICT",
        metadata: {
          candidateId: candidate.id,
          warning: conflictWarning,
        },
        createdAt: now,
      });
    }
  }

  return created;
}

async function evaluateEvidence(input: {
  executionId: string;
  type: ShipmentMilestoneType;
  proposedClock?: string | null;
}): Promise<{ conflictWarning: string | null; corroborationNote: string | null }> {
  const repos = getRepositories();
  const execution = await repos.shipmentExecutions.get(input.executionId);
  if (!execution) return { conflictWarning: null, corroborationNote: null };

  const observations = await repos.shipmentObservations.listForExecution(
    execution.id,
    30,
  );
  const milestones = await repos.shipmentMilestones.listForExecution(
    execution.id,
  );

  let conflictWarning: string | null = null;
  let corroborationNote: string | null = null;

  if (input.type === "DEPARTED") {
    const left = milestones.find(
      (m) => m.type === "VESSEL_LEFT_ORIGIN_AREA",
    );
    const stillNear = observations[0]?.kind === "NEAR_ORIGIN";
    const origin = resolvePortByNameOrId(execution.originPortId);
    if (origin && observations[0]) {
      const fence = buildPortGeofence(origin);
      const inside = isInsideGeofence(
        {
          latitude: observations[0].latitude,
          longitude: observations[0].longitude,
        },
        fence,
      );
      if (inside || stillNear) {
        conflictWarning =
          "Reported departure time may conflict with AIS observation.";
      }
    }
    if (left) {
      corroborationNote =
        "Broker departure update is supported by AIS movement.";
    }
  }

  if (input.type === "ARRIVED") {
    const atDest = milestones.find(
      (m) => m.type === "VESSEL_AT_DESTINATION",
    );
    if (atDest || observations[0]?.kind === "AT_DESTINATION") {
      corroborationNote =
        "Broker arrival update is supported by AIS destination proximity.";
    }
  }

  // Distance sanity for departure conflict when vessel still near origin center
  if (input.type === "DEPARTED" && observations[0] && execution.originPortId) {
    const origin = resolvePortByNameOrId(execution.originPortId);
    if (origin) {
      const d = haversineKm(
        {
          latitude: observations[0].latitude,
          longitude: observations[0].longitude,
        },
        origin.position,
      );
      if (d < 15 && !corroborationNote) {
        conflictWarning =
          conflictWarning ??
          "Reported departure time differs from AIS observation.";
      }
    }
  }

  return { conflictWarning, corroborationNote };
}
