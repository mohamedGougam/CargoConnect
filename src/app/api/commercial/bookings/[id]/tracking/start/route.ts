import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { startShipmentTracking } from "@/server/execution/startTracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — Start Shipment Tracking */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await startShipmentTracking({
    bookingId: booking.id,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      {
        status:
          result.code === "not_found"
            ? 404
            : result.code === "not_ready" || result.code === "handoff_required"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    execution: result.execution,
    alreadyStarted: result.alreadyStarted ?? false,
    vesselAssociationPending: result.vesselAssociationPending ?? false,
    vesselCandidates: result.vesselCandidates ?? null,
  });
}
