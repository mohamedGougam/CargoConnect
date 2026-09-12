import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import {
  ensureAisIngestStarted,
  getVesselSnapshot,
  getAisIngestDiagnostics,
} from "@/server/maritime/ais/ingest";
import { getVesselStateStore } from "@/server/maritime/store/VesselStateStore";
import { vesselStateToUiVessel } from "@/server/maritime/ais/toUiVessel";
import {
  getExecutionAisFixture,
} from "@/server/execution/aisFixtures";
import {
  ingestVesselObservation,
  vesselToObservationInput,
} from "@/server/execution/observeVessel";
import { isMeaningfulObservationChange } from "@/server/execution/meaningfulChange";
import { getMaritimeServerConfig } from "@/server/maritime/config";
import { evaluateShipmentExceptions } from "@/server/exceptions/evaluateExceptions";

export interface WatcherRunSummary {
  activeExecutions: number;
  matchedVessels: number;
  observationsIngested: number;
  observationsSkipped: number;
  exceptionsCreated: number;
  exceptionsUpdated: number;
  exceptionsAutoResolved: number;
  providerAvailable: boolean;
  providerNote: string;
  errors: string[];
}

/**
 * Shared maritime snapshot → match active executions → meaningful ingest.
 * Provider-independent; fixtures used when live cache empty (tests/dev).
 */
export async function runShipmentObservationWatcher(): Promise<WatcherRunSummary> {
  const repos = getRepositories();
  const summary: WatcherRunSummary = {
    activeExecutions: 0,
    matchedVessels: 0,
    observationsIngested: 0,
    observationsSkipped: 0,
    exceptionsCreated: 0,
    exceptionsUpdated: 0,
    exceptionsAutoResolved: 0,
    providerAvailable: false,
    providerNote: "",
    errors: [],
  };

  const config = getMaritimeServerConfig();
  summary.providerNote = config.canConnectAis
    ? "Development AIS feed (AISStream) — not a licensed commercial tracking product unless rights are confirmed."
    : "Live AIS ingest disabled or unavailable; using cache/fixtures when present.";

  try {
    await ensureAisIngestStarted();
  } catch (err) {
    summary.errors.push(
      err instanceof Error ? err.message : "AIS ingest start failed",
    );
  }

  const diagnostics = getAisIngestDiagnostics();
  summary.providerAvailable =
    diagnostics.connectionState === "connected" ||
    diagnostics.vesselsInCache > 0;

  const active = await repos.shipmentExecutions.listActiveForWatcher();
  summary.activeExecutions = active.length;

  // One shared snapshot for all executions
  let snapshotVessels = getVesselSnapshot({ freshness: "all" });
  if (snapshotVessels.length === 0) {
    // Fall back to store enumeration
    const store = getVesselStateStore();
    snapshotVessels = store
      .list()
      .map((s) => vesselStateToUiVessel(s))
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
  }

  for (const execution of active) {
    try {
      let vessel =
        (execution.vesselMmsi
          ? snapshotVessels.find((v) => v.mmsi === execution.vesselMmsi)
          : undefined) ??
        (execution.vesselImo
          ? snapshotVessels.find((v) => v.imo === execution.vesselImo)
          : undefined) ??
        getExecutionAisFixture(execution.id);

      if (!vessel && execution.vesselMmsi) {
        const state = getVesselStateStore().get(execution.vesselMmsi);
        vessel = state ? vesselStateToUiVessel(state) ?? undefined : undefined;
      }

      if (!vessel) {
        continue;
      }
      summary.matchedVessels += 1;

      const booking = await repos.bookings.get(execution.bookingId);
      const observation = vesselToObservationInput(
        vessel,
        summary.providerAvailable ? "maritime_provider" : "ais_fixture",
      );

      const previous = await repos.shipmentObservations.getLatest(execution.id);
      if (
        !isMeaningfulObservationChange({
          previous,
          next: observation,
        })
      ) {
        summary.observationsSkipped += 1;
        continue;
      }

      await ingestVesselObservation({
        execution,
        observation,
        bookingCommercialRequestId: booking?.commercialRequestId ?? null,
        userId: execution.userId,
      });
      summary.observationsIngested += 1;

      await repos.audits.append({
        id: newId("audit"),
        commercialRequestId: booking?.commercialRequestId ?? null,
        userId: execution.userId,
        eventType: "LIVE_AIS_OBSERVATION_INGESTED",
        metadata: {
          executionId: execution.id,
          mmsi: execution.vesselMmsi,
          observedAt: observation.observedAt,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      summary.errors.push(
        `${execution.id}: ${err instanceof Error ? err.message : "ingest failed"}`,
      );
    }
  }

  // Evaluate exceptions after shared ingest pass (including executions with no new obs)
  for (const execution of active) {
    try {
      const ex = await evaluateShipmentExceptions({
        executionId: execution.id,
      });
      summary.exceptionsCreated += ex.created;
      summary.exceptionsUpdated += ex.updated;
      summary.exceptionsAutoResolved += ex.autoResolved;
    } catch (err) {
      summary.errors.push(
        `${execution.id}: exceptions ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  return summary;
}
