import { getMaritimeServerConfig } from "@/server/maritime/config";
import { getRepositories } from "@/server/commercial/repos";
import { buildMaritimeCorridor } from "@/lib/search/buildCorridor";
import { resolvePortByNameOrId } from "@/server/execution/geofence";
import { classifyAisFreshness } from "@/server/execution/freshness";
import { getExecutionAisFixture } from "@/server/execution/aisFixtures";

function liveTrackingSourceLabel(): string {
  const cfg = getMaritimeServerConfig();
  if (cfg.canConnectAis) {
    return "Development AIS feed";
  }
  if (process.env.LICENSED_AIS_PROVIDER?.trim()) {
    return "Licensed production AIS provider";
  }
  return "Development AIS feed (cache/fixtures)";
}

export async function getShipmentTrackingPayload(input: {
  bookingId: string;
  userId: string;
}) {
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(input.bookingId)) ??
    (await repos.bookings.getByReference(input.bookingId));
  if (!booking || booking.userId !== input.userId) {
    return { ok: false as const, error: "Not found", code: "not_found" };
  }

  const handoff = await repos.handoffs.getLatestForBooking(booking.id);
  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution) {
    return {
      ok: true as const,
      booking: {
        id: booking.id,
        bookingReference: booking.bookingReference,
        status: booking.status,
        origin: booking.origin,
        destination: booking.destination,
      },
      handoff: handoff
        ? {
            id: handoff.id,
            status: handoff.status,
            handoffReference: handoff.handoffReference,
          }
        : null,
      execution: null,
      canStart:
        booking.status === "READY_FOR_OPERATIONS" &&
        handoff?.status === "FINALIZED",
      aisLicensingNote:
        "AISStream remains prototype/development unless commercial/public-display licensing is confirmed. Production tracking may require a licensed AIS provider.",
    };
  }

  const [milestones, associations, observations, candidates, exceptions] =
    await Promise.all([
      repos.shipmentMilestones.listForExecution(execution.id),
      repos.shipmentVesselAssociations.listForExecution(execution.id),
      repos.shipmentObservations.listForExecution(execution.id, 48),
      repos.shipmentMilestoneCandidates.listPendingForExecution(execution.id),
      repos.operationalExceptions.listForExecution(execution.id),
    ]);

  const origin = resolvePortByNameOrId(execution.originPortId);
  const destination = resolvePortByNameOrId(execution.destinationPortId);
  const corridor =
    origin && destination ? buildMaritimeCorridor(origin, destination) : null;

  const latest = observations[0] ?? null;
  const freshness = latest
    ? classifyAisFreshness(latest.observedAt)
    : null;

  const fixture = getExecutionAisFixture(execution.id);

  const warnings: string[] = [];
  if (freshness === "stale") {
    warnings.push(
      "AIS signal is stale. Current vessel position may be outdated.",
    );
  }
  const leftObs = milestones.find(
    (m) => m.type === "VESSEL_LEFT_ORIGIN_AREA" && m.status === "PLANNED",
  );
  const departed = milestones.find(
    (m) => m.type === "DEPARTED" && m.status === "CONFIRMED",
  );
  if (leftObs && departed && leftObs.occurredAt && departed.occurredAt) {
    const delta =
      Math.abs(
        new Date(leftObs.occurredAt).getTime() -
          new Date(departed.occurredAt).getTime(),
      ) /
      60_000;
    if (delta > 120) {
      warnings.push("Departure timing may require review.");
    }
  }

  for (const c of candidates) {
    if (c.conflictWarning) warnings.push(c.conflictWarning);
  }

  const openExceptions = exceptions.filter(
    (e) => e.status === "OPEN" || e.status === "ACKNOWLEDGED",
  );

  return {
    ok: true as const,
    booking: {
      id: booking.id,
      bookingReference: booking.bookingReference,
      status: booking.status,
      origin: booking.origin,
      destination: booking.destination,
    },
    handoff: handoff
      ? {
          id: handoff.id,
          status: handoff.status,
          handoffReference: handoff.handoffReference,
        }
      : null,
    execution,
    milestones,
    associations,
    observations,
    candidates,
    exceptions,
    openExceptions,
    latestObservation: latest,
    freshness,
    confirmedEta: execution.plannedEta,
    aisReportedEta: execution.latestObservedEta ?? latest?.aisEta ?? null,
    originPort: origin
      ? {
          id: origin.id,
          name: origin.name,
          latitude: origin.position.latitude,
          longitude: origin.position.longitude,
        }
      : null,
    destinationPort: destination
      ? {
          id: destination.id,
          name: destination.name,
          latitude: destination.position.latitude,
          longitude: destination.position.longitude,
        }
      : null,
    corridor,
    fixtureVessel: fixture ?? null,
    warnings,
    canStart: false,
    liveTrackingSource: liveTrackingSourceLabel(),
    aisLicensingNote:
      "AISStream remains prototype/development unless commercial/public-display licensing is confirmed. Production tracking may require a licensed AIS provider.",
    disclaimer:
      "AIS observations are not proof that cargo was loaded, discharged, or commercially completed.",
  };
}
