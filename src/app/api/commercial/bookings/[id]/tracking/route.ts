import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { getShipmentTrackingPayload } from "@/server/execution/getTracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — shipment tracking snapshot */
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

  const payload = await getShipmentTrackingPayload({
    bookingId: booking.id,
    userId: user.id,
  });

  if (!payload.ok) {
    return NextResponse.json({ error: payload.error }, { status: 404 });
  }

  return NextResponse.json(payload);
}
