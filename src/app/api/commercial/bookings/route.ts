import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/bookings — My Bookings list */
export async function GET() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const bookings = await getRepositories().bookings.listForUser(user.id);
  const repos = getRepositories();
  const rows = await Promise.all(
    bookings.map(async (b) => {
      const handoff = await repos.handoffs.getLatestForBooking(b.id);
      return {
        id: b.id,
        bookingReference: b.bookingReference,
        status: b.status,
        origin: b.origin,
        destination: b.destination,
        brokerOrganization: b.brokerOrganization,
        vesselName: b.vesselSnapshot?.vesselName ?? null,
        externalBookingReference: b.externalBookingReference,
        confirmedAt: b.confirmedAt,
        handoffStatus: handoff?.status ?? null,
        handoffReference: handoff?.handoffReference ?? null,
      };
    }),
  );
  return NextResponse.json({ bookings: rows });
}
