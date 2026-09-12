import type {
  ShipmentExecution,
  ShipmentVesselAssociation,
} from "@/domain/commercial/types";
import type { Vessel } from "@/domain/models";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

export type AssociateVesselResult =
  | {
      ok: true;
      association: ShipmentVesselAssociation;
      execution: ShipmentExecution;
      alreadyAssociated?: boolean;
      requiresConfirmation?: false;
    }
  | {
      ok: true;
      requiresConfirmation: true;
      candidates: Array<{
        vesselId: string;
        name: string;
        mmsi?: string;
        imo?: string;
        flag?: string;
        latitude?: number;
        longitude?: number;
      }>;
      message: string;
    }
  | { ok: false; error: string; code: string };

/**
 * Association preference: MMSI → IMO → confirmed vessel name.
 * Never auto-pick among ambiguous name matches.
 */
export async function associateVesselToExecution(input: {
  executionId: string;
  userId: string;
  bookingCommercialRequestId: string | null;
  /** Explicit confirmation of a candidate when name was ambiguous. */
  confirmVessel?: {
    vesselId?: string | null;
    mmsi?: string | null;
    imo?: string | null;
    name?: string | null;
  } | null;
  /** Live/fixture candidates for name search. */
  nameSearchCandidates?: Vessel[];
  reportedChange?: {
    vesselName?: string | null;
    mmsi?: string | null;
    imo?: string | null;
  } | null;
}): Promise<AssociateVesselResult> {
  const repos = getRepositories();
  const execution = await repos.shipmentExecutions.get(input.executionId);
  if (!execution || execution.userId !== input.userId) {
    return { ok: false, error: "Execution not found", code: "not_found" };
  }

  const active = await repos.shipmentVesselAssociations.getActive(execution.id);

  // Vessel change detection — never silent replace
  if (input.reportedChange && active) {
    const reportedMmsi = input.reportedChange.mmsi?.trim() || null;
    const reportedImo = input.reportedChange.imo?.trim() || null;
    const reportedName = input.reportedChange.vesselName?.trim() || null;
    const mmsiConflict =
      reportedMmsi &&
      active.vesselMmsi &&
      reportedMmsi !== active.vesselMmsi;
    const imoConflict =
      reportedImo && active.vesselImo && reportedImo !== active.vesselImo;
    const nameConflict =
      reportedName &&
      active.vesselName &&
      reportedName.toLowerCase() !== active.vesselName.toLowerCase() &&
      !reportedMmsi &&
      !reportedImo;
    if (mmsiConflict || imoConflict || nameConflict) {
      return {
        ok: true,
        requiresConfirmation: true,
        candidates: [
          {
            vesselId: active.vesselId ?? `assoc:${active.id}`,
            name: active.vesselName ?? "Current",
            mmsi: active.vesselMmsi ?? undefined,
            imo: active.vesselImo ?? undefined,
          },
          {
            vesselId: "reported",
            name: reportedName ?? "Reported vessel",
            mmsi: reportedMmsi ?? undefined,
            imo: reportedImo ?? undefined,
          },
        ],
        message: "Vessel change detected. Confirm the correct vessel before association.",
      };
    }
  }

  if (input.confirmVessel) {
    return persistAssociation({
      execution,
      userId: input.userId,
      bookingCommercialRequestId: input.bookingCommercialRequestId,
      vesselId: input.confirmVessel.vesselId ?? null,
      mmsi: input.confirmVessel.mmsi ?? null,
      imo: input.confirmVessel.imo ?? null,
      name: input.confirmVessel.name ?? null,
      method: input.confirmVessel.mmsi
        ? "MMSI"
        : input.confirmVessel.imo
          ? "IMO"
          : "NAME_CONFIRMED",
      previous: active,
    });
  }

  // Prefer MMSI on execution / booking snapshot
  if (execution.vesselMmsi) {
    if (active?.vesselMmsi === execution.vesselMmsi && active.active) {
      return {
        ok: true,
        association: active,
        execution,
        alreadyAssociated: true,
      };
    }
    return persistAssociation({
      execution,
      userId: input.userId,
      bookingCommercialRequestId: input.bookingCommercialRequestId,
      vesselId: execution.vesselId ?? `mmsi:${execution.vesselMmsi}`,
      mmsi: execution.vesselMmsi,
      imo: execution.vesselImo ?? null,
      name: execution.vesselName ?? null,
      method: "MMSI",
      previous: active,
    });
  }

  if (execution.vesselImo) {
    return persistAssociation({
      execution,
      userId: input.userId,
      bookingCommercialRequestId: input.bookingCommercialRequestId,
      vesselId: execution.vesselId ?? `imo:${execution.vesselImo}`,
      mmsi: null,
      imo: execution.vesselImo,
      name: execution.vesselName ?? null,
      method: "IMO",
      previous: active,
    });
  }

  if (execution.vesselName) {
    const candidates = (input.nameSearchCandidates ?? []).filter((v) =>
      v.name.toLowerCase().includes(execution.vesselName!.toLowerCase()),
    );
    if (candidates.length > 1) {
      return {
        ok: true,
        requiresConfirmation: true,
        candidates: candidates.map((v) => ({
          vesselId: v.id,
          name: v.name,
          mmsi: v.mmsi,
          imo: v.imo,
          flag: v.flag,
          latitude: v.position.latitude,
          longitude: v.position.longitude,
        })),
        message:
          "Multiple vessels match this name. Confirm the correct vessel before association.",
      };
    }
    if (candidates.length === 1) {
      const v = candidates[0];
      return persistAssociation({
        execution,
        userId: input.userId,
        bookingCommercialRequestId: input.bookingCommercialRequestId,
        vesselId: v.id,
        mmsi: v.mmsi ?? null,
        imo: v.imo ?? null,
        name: v.name,
        method: "NAME_CONFIRMED",
        previous: active,
      });
    }
    // Name only from handoff — soft association without MMSI
    return persistAssociation({
      execution,
      userId: input.userId,
      bookingCommercialRequestId: input.bookingCommercialRequestId,
      vesselId: null,
      mmsi: null,
      imo: null,
      name: execution.vesselName,
      method: "HANDOFF_SNAPSHOT",
      previous: active,
    });
  }

  return {
    ok: false,
    error: "No vessel identity available to associate",
    code: "no_vessel",
  };
}

async function persistAssociation(input: {
  execution: ShipmentExecution;
  userId: string;
  bookingCommercialRequestId: string | null;
  vesselId: string | null;
  mmsi: string | null;
  imo: string | null;
  name: string | null;
  method: ShipmentVesselAssociation["associationMethod"];
  previous?: ShipmentVesselAssociation;
}): Promise<AssociateVesselResult> {
  const repos = getRepositories();
  const now = new Date().toISOString();

  if (input.previous?.active) {
    await repos.shipmentVesselAssociations.update({
      ...input.previous,
      active: false,
      supersededAt: now,
    });
  }

  const association: ShipmentVesselAssociation = {
    id: newId("vass"),
    shipmentExecutionId: input.execution.id,
    vesselId: input.vesselId,
    vesselMmsi: input.mmsi,
    vesselImo: input.imo,
    vesselName: input.name,
    associationMethod: input.method,
    active: true,
    confirmedByUserId: input.userId,
    confirmedAt: now,
    createdAt: now,
  };
  await repos.shipmentVesselAssociations.create(association);

  const updated: ShipmentExecution = {
    ...input.execution,
    vesselId: input.vesselId,
    vesselMmsi: input.mmsi,
    vesselImo: input.imo,
    vesselName: input.name,
    updatedAt: now,
  };
  await repos.shipmentExecutions.update(updated);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: input.bookingCommercialRequestId,
    userId: input.userId,
    eventType: input.previous
      ? "VESSEL_ASSOCIATION_CHANGED"
      : "VESSEL_ASSOCIATED",
    metadata: {
      executionId: input.execution.id,
      method: input.method,
      mmsi: input.mmsi,
      imo: input.imo,
      name: input.name,
    },
    createdAt: now,
  });

  return { ok: true, association, execution: updated };
}
