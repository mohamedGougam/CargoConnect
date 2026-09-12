import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { associateVesselToExecution } from "@/server/execution/associateVessel";
import { buildAisFixtureVessel } from "@/server/execution/aisFixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — confirm / change vessel association */
export async function POST(
  request: Request,
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

  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution) {
    return NextResponse.json(
      { error: "Shipment execution not started", code: "no_execution" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirmVessel?: {
      vesselId?: string | null;
      mmsi?: string | null;
      imo?: string | null;
      name?: string | null;
    };
    reportedChange?: {
      vesselName?: string | null;
      mmsi?: string | null;
      imo?: string | null;
    };
    /** Test/demo only: include sample name-search candidates */
    includeFixtureCandidates?: boolean;
  };

  // Reject client-injected "trusted AIS" ownership hijacks
  if (
    body.confirmVessel?.mmsi &&
    typeof body.confirmVessel.mmsi === "string" &&
    body.confirmVessel.mmsi.includes("..")
  ) {
    return NextResponse.json(
      { error: "Invalid vessel identity", code: "rejected" },
      { status: 400 },
    );
  }

  const candidates = body.includeFixtureCandidates
    ? [
        buildAisFixtureVessel("NEAR_ROTTERDAM"),
        buildAisFixtureVessel("VESSEL_CHANGE_ORION"),
      ]
    : [];

  const result = await associateVesselToExecution({
    executionId: execution.id,
    userId: user.id,
    bookingCommercialRequestId: booking.commercialRequestId,
    confirmVessel: body.confirmVessel ?? null,
    reportedChange: body.reportedChange ?? null,
    nameSearchCandidates: candidates,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "not_found" ? 404 : 400 },
    );
  }

  if ("requiresConfirmation" in result && result.requiresConfirmation) {
    return NextResponse.json({
      requiresConfirmation: true,
      message: result.message,
      candidates: result.candidates,
    });
  }

  return NextResponse.json({
    association: result.association,
    execution: result.execution,
    alreadyAssociated: result.alreadyAssociated ?? false,
  });
}
