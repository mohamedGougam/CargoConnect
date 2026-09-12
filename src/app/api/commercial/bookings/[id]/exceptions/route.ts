import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/bookings/:id/exceptions */
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
    return NextResponse.json({
      bookingId: booking.id,
      exceptions: [],
      open: [],
    });
  }

  const all = await repos.operationalExceptions.listForExecution(execution.id);
  const open = all.filter(
    (e) => e.status === "OPEN" || e.status === "ACKNOWLEDGED",
  );

  return NextResponse.json({
    bookingId: booking.id,
    executionId: execution.id,
    exceptions: all,
    open,
  });
}
