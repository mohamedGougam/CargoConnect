import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import {
  setExecutionAisFixture,
  buildAisFixtureVessel,
  type AisFixtureScenario,
} from "@/server/execution/aisFixtures";
import { applyAisFixtureToExecution } from "@/server/execution/observeVessel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — recent observations for booking execution */
export async function GET(
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

  const execution = await repos.shipmentExecutions.getForBooking(booking.id);
  if (!execution) {
    return NextResponse.json({ observations: [] });
  }

  const observations = await repos.shipmentObservations.listForExecution(
    execution.id,
    48,
  );
  return NextResponse.json({ observations });
}

/**
 * POST — apply deterministic AIS fixture (dev/tests only).
 * Never available when NODE_ENV=production unless explicitly enabled.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.SHIPMENT_AIS_FIXTURES !== "true"
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
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
    return NextResponse.json({ error: "No execution" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    scenario?: AisFixtureScenario;
  };

  const scenario = body.scenario ?? "NEAR_ROTTERDAM";
  const vessel = buildAisFixtureVessel(scenario);
  if (scenario !== "VESSEL_CHANGE_ORION" && execution.vesselMmsi) {
    vessel.mmsi = execution.vesselMmsi;
    vessel.id = `mmsi:${execution.vesselMmsi}`;
  }
  setExecutionAisFixture(execution.id, vessel);

  const applied = await applyAisFixtureToExecution({
    executionId: execution.id,
    userId: user.id,
    bookingCommercialRequestId: booking.commercialRequestId,
  });

  if (!applied.ok) {
    return NextResponse.json(
      { error: applied.error, code: applied.code },
      { status: 400 },
    );
  }

  return NextResponse.json({
    messages: applied.messages,
    observation: applied.observation,
    vessel: {
      name: vessel.name,
      mmsi: vessel.mmsi,
      imo: vessel.imo,
      latitude: vessel.position.latitude,
      longitude: vessel.position.longitude,
      speed: vessel.speed,
    },
  });
}
