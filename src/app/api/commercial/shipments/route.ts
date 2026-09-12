import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/shipments — My Shipments list */
export async function GET() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const repos = getRepositories();
  const executions = await repos.shipmentExecutions.listForUser(user.id);
  const rows = await Promise.all(
    executions.map(async (e) => {
      const booking = await repos.bookings.get(e.bookingId);
      const latest = await repos.shipmentObservations.getLatest(e.id);
      const pending = await repos.shipmentMilestoneCandidates.listPendingForExecution(
        e.id,
      );
      const openExceptions =
        await repos.operationalExceptions.listOpenForExecution(e.id);
      const nextMilestone =
        e.status === "LOADED" || e.status === "LOADING_PLANNED"
          ? "Departure"
          : e.status === "IN_TRANSIT"
            ? "Arrival"
            : e.status === "ARRIVED"
              ? "Discharge"
              : e.status === "DISCHARGED"
                ? "Delivery"
                : e.status === "DELIVERED"
                  ? "Complete"
                  : e.status === "COMPLETED"
                    ? null
                    : "Loaded";

      return {
        id: e.id,
        bookingId: e.bookingId,
        bookingReference: booking?.bookingReference ?? e.bookingId,
        origin: booking?.origin ?? null,
        destination: booking?.destination ?? null,
        vesselName: e.vesselName,
        status: e.status,
        lastObservedAt: latest?.observedAt ?? null,
        lastSog: latest?.sog ?? null,
        nextMilestone,
        pendingCandidates: pending.length,
        openExceptionCount: openExceptions.length,
        openExceptionSummary: openExceptions.slice(0, 3).map((x) => ({
          id: x.id,
          type: x.type,
          severity: x.severity,
          title: x.title,
        })),
        needsAttention: openExceptions.length > 0 || pending.length > 0,
        completedAt: e.completedAt ?? null,
      };
    }),
  );

  return NextResponse.json({
    active: rows.filter((r) => r.status !== "COMPLETED"),
    completed: rows.filter((r) => r.status === "COMPLETED"),
  });
}
