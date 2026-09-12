import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { completeShipmentExecution } from "@/server/execution/completeShipment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — explicit Complete Shipment */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    acknowledgedComplete?: boolean;
  };
  if (!body.acknowledgedComplete) {
    return NextResponse.json(
      {
        error: "Explicit completion acknowledgement required",
        code: "acknowledgements_required",
      },
      { status: 400 },
    );
  }

  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await completeShipmentExecution({
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
            : result.code === "invalid_order"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    execution: result.execution,
    alreadyCompleted: result.alreadyCompleted ?? false,
  });
}
