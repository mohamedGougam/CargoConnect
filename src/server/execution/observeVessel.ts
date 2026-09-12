import type {
  ShipmentExecution,
  ShipmentMilestone,
  ShipmentObservation,
  ShipmentObservationKind,
} from "@/domain/commercial/types";
import type { Vessel } from "@/domain/models";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  buildPortGeofence,
  isInsideGeofence,
  resolvePortByNameOrId,
} from "@/server/execution/geofence";
import {
  classifyAisFreshness,
  maxShipmentObservations,
  periodicObservationMinIntervalMs,
} from "@/server/execution/freshness";
import { getExecutionAisFixture } from "@/server/execution/aisFixtures";

export interface VesselObservationInput {
  latitude: number;
  longitude: number;
  sog?: number | null;
  cog?: number | null;
  heading?: number | null;
  navStatus?: string | null;
  aisDestination?: string | null;
  aisEta?: string | null;
  observedAt: string;
  source: string;
  vesselName?: string | null;
  vesselMmsi?: string | null;
  vesselImo?: string | null;
}

/**
 * Provider-independent vessel observation layer.
 * AIS must never auto-confirm cargo LOADED / DEPARTED / ARRIVED.
 */
export async function ingestVesselObservation(input: {
  execution: ShipmentExecution;
  observation: VesselObservationInput;
  bookingCommercialRequestId: string | null;
  userId: string;
}): Promise<{
  observation: ShipmentObservation;
  aisMilestones: ShipmentMilestone[];
  messages: string[];
}> {
  const repos = getRepositories();
  const freshness = classifyAisFreshness(input.observation.observedAt);
  const origin = resolvePortByNameOrId(input.execution.originPortId);
  const dest = resolvePortByNameOrId(input.execution.destinationPortId);
  const point = {
    latitude: input.observation.latitude,
    longitude: input.observation.longitude,
  };

  let kind: ShipmentObservationKind = "POSITION";
  const messages: string[] = [];
  const aisMilestones: ShipmentMilestone[] = [];

  if (freshness === "stale") {
    kind = "STALE";
    messages.push(
      "AIS signal is stale. Current vessel position may be outdated.",
    );
  } else if (origin) {
    const fence = buildPortGeofence(origin);
    if (isInsideGeofence(point, fence)) {
      kind = "NEAR_ORIGIN";
      messages.push("Vessel observed near origin port");
    } else {
      const priorNear = (
        await repos.shipmentObservations.listForExecution(input.execution.id, 20)
      ).some((o) => o.kind === "NEAR_ORIGIN" || o.kind === "LEFT_ORIGIN_AREA");
      if (priorNear || (input.observation.sog ?? 0) > 3) {
        const alreadyLeft = await repos.shipmentMilestones.getLatestConfirmed(
          input.execution.id,
          "VESSEL_LEFT_ORIGIN_AREA",
        );
        const leftCandidate = (
          await repos.shipmentMilestones.listForExecution(input.execution.id)
        ).find(
          (m) =>
            m.type === "VESSEL_LEFT_ORIGIN_AREA" && m.status === "PLANNED",
        );
        if (!isInsideGeofence(point, fence) && priorNear) {
          kind = "LEFT_ORIGIN_AREA";
          messages.push("Vessel appears to have departed the origin area.");
          if (!alreadyLeft && !leftCandidate) {
            const m = await createAisMilestone({
              executionId: input.execution.id,
              type: "VESSEL_LEFT_ORIGIN_AREA",
              notes: "AIS: vessel outside origin geofence after near-origin observation",
              observedAt: input.observation.observedAt,
              context: {
                latitude: point.latitude,
                longitude: point.longitude,
              },
            });
            aisMilestones.push(m);
          }
        }
      }
    }
  }

  if (dest && freshness !== "stale") {
    const fence = buildPortGeofence(dest);
    if (isInsideGeofence(point, fence)) {
      kind = "AT_DESTINATION";
      messages.push("Vessel observed near destination.");
      const existing = (
        await repos.shipmentMilestones.listForExecution(input.execution.id)
      ).find(
        (m) =>
          m.type === "VESSEL_AT_DESTINATION" &&
          (m.status === "PLANNED" || m.status === "CONFIRMED"),
      );
      if (!existing) {
        aisMilestones.push(
          await createAisMilestone({
            executionId: input.execution.id,
            type: "VESSEL_AT_DESTINATION",
            notes: "AIS: vessel inside destination approximate geofence",
            observedAt: input.observation.observedAt,
            context: {
              latitude: point.latitude,
              longitude: point.longitude,
            },
          }),
        );
      }
    } else if (kind === "POSITION" && (input.observation.sog ?? 0) > 3) {
      kind = "UNDERWAY";
      messages.push("Vessel underway (AIS observation)");
    }
  }

  if (kind === "NEAR_ORIGIN") {
    const existing = (
      await repos.shipmentMilestones.listForExecution(input.execution.id)
    ).find((m) => m.type === "VESSEL_AT_ORIGIN");
    if (!existing) {
      aisMilestones.push(
        await createAisMilestone({
          executionId: input.execution.id,
          type: "VESSEL_AT_ORIGIN",
          notes: "AIS: vessel inside origin approximate geofence",
          observedAt: input.observation.observedAt,
          context: { latitude: point.latitude, longitude: point.longitude },
        }),
      );
    }
  }

  // Throttle pure periodic tracks
  if (kind === "POSITION" || kind === "UNDERWAY") {
    const latest = await repos.shipmentObservations.getLatest(
      input.execution.id,
    );
    if (
      latest &&
      Date.now() - new Date(latest.observedAt).getTime() <
        periodicObservationMinIntervalMs() &&
      latest.kind === kind
    ) {
      // Still update ETA on execution without new observation row
      if (input.observation.aisEta) {
        await repos.shipmentExecutions.update({
          ...input.execution,
          latestObservedEta: input.observation.aisEta,
          updatedAt: new Date().toISOString(),
        });
      }
      return {
        observation: latest,
        aisMilestones,
        messages,
      };
    }
    if (kind === "POSITION") kind = "PERIODIC_TRACK";
  }

  const now = new Date().toISOString();
  const observation: ShipmentObservation = {
    id: newId("obs"),
    shipmentExecutionId: input.execution.id,
    kind,
    latitude: input.observation.latitude,
    longitude: input.observation.longitude,
    sog: input.observation.sog ?? null,
    cog: input.observation.cog ?? null,
    heading: input.observation.heading ?? null,
    navStatus: input.observation.navStatus ?? null,
    aisDestination: input.observation.aisDestination ?? null,
    aisEta: input.observation.aisEta ?? null,
    observedAt: input.observation.observedAt,
    source: input.observation.source,
    freshnessLabel: freshness,
    createdAt: now,
  };

  await repos.shipmentObservations.create(observation);
  await repos.shipmentObservations.deleteOldest(
    input.execution.id,
    maxShipmentObservations(),
  );

  if (input.observation.aisEta) {
    await repos.shipmentExecutions.update({
      ...input.execution,
      latestObservedEta: input.observation.aisEta,
      updatedAt: now,
    });
  }

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: input.bookingCommercialRequestId,
    userId: input.userId,
    eventType:
      freshness === "stale" ? "AIS_SIGNAL_STALE" : "AIS_OBSERVATION_RECORDED",
    metadata: {
      executionId: input.execution.id,
      kind,
      freshness,
      observedAt: observation.observedAt,
    },
    createdAt: now,
  });

  return { observation, aisMilestones, messages };
}

async function createAisMilestone(input: {
  executionId: string;
  type: ShipmentMilestone["type"];
  notes: string;
  observedAt: string;
  context: Record<string, unknown>;
}): Promise<ShipmentMilestone> {
  const repos = getRepositories();
  const milestone: ShipmentMilestone = {
    id: newId("ms"),
    shipmentExecutionId: input.executionId,
    type: input.type,
    status: "PLANNED",
    occurredAt: input.observedAt,
    source: "AIS_OBSERVATION",
    notes: input.notes,
    observationContext: input.context,
    createdAt: new Date().toISOString(),
  };
  await repos.shipmentMilestones.create(milestone);
  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: null,
    eventType: "MILESTONE_CANDIDATE_CREATED",
    metadata: {
      executionId: input.executionId,
      type: input.type,
      source: "AIS_OBSERVATION",
    },
    createdAt: milestone.createdAt,
  });
  return milestone;
}

export function vesselToObservationInput(
  vessel: Vessel,
  source = "ais_fixture",
): VesselObservationInput {
  const observedAt =
    vessel.meta?.sourceTimestamp ?? new Date().toISOString();
  return {
    latitude: vessel.position.latitude,
    longitude: vessel.position.longitude,
    sog: vessel.speed ?? null,
    cog: vessel.course ?? null,
    heading: vessel.heading ?? null,
    navStatus: vessel.navStatus ?? null,
    aisDestination: vessel.destinationRaw ?? null,
    aisEta: vessel.eta ?? null,
    observedAt,
    source,
    vesselName: vessel.name,
    vesselMmsi: vessel.mmsi ?? null,
    vesselImo: vessel.imo ?? null,
  };
}

/** Apply fixture vessel (tests / demo) — never treats AIS as cargo confirmation. */
export async function applyAisFixtureToExecution(input: {
  executionId: string;
  userId: string;
  bookingCommercialRequestId: string | null;
}): Promise<{
  ok: true;
  messages: string[];
  observation: ShipmentObservation;
} | { ok: false; error: string; code: string }> {
  const repos = getRepositories();
  const execution = await repos.shipmentExecutions.get(input.executionId);
  if (!execution || execution.userId !== input.userId) {
    return { ok: false, error: "Execution not found", code: "not_found" };
  }
  const vessel = getExecutionAisFixture(execution.id);
  if (!vessel) {
    return { ok: false, error: "No AIS fixture set", code: "no_fixture" };
  }
  const result = await ingestVesselObservation({
    execution,
    observation: vesselToObservationInput(vessel),
    bookingCommercialRequestId: input.bookingCommercialRequestId,
    userId: input.userId,
  });
  return {
    ok: true,
    messages: result.messages,
    observation: result.observation,
  };
}
