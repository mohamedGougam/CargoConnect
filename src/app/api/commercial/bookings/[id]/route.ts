import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/bookings/:id */
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

  const [request, proceed, confirmation, latestHandoff] = await Promise.all([
    repos.requests.get(booking.commercialRequestId),
    repos.proceedRequests.get(booking.proceedRequestId),
    repos.confirmations.get(booking.confirmationId),
    repos.handoffs.getLatestForBooking(booking.id),
  ]);

  return NextResponse.json({
    booking,
    request: request
      ? {
          id: request.id,
          status: request.status,
          type: request.type,
        }
      : null,
    proceed: proceed
      ? {
          id: proceed.id,
          sentAt: proceed.sentAt,
          subject: proceed.subject,
        }
      : null,
    confirmation: confirmation
      ? {
          id: confirmation.id,
          classification: confirmation.classification,
          bookingReference: confirmation.bookingReference,
          vesselName: confirmation.vesselName,
          confirmedRate: confirmation.confirmedRate,
          currency: confirmation.currency,
          inboundMessageId: confirmation.inboundMessageId,
        }
      : null,
    handoff: latestHandoff
      ? {
          id: latestHandoff.id,
          handoffReference: latestHandoff.handoffReference,
          status: latestHandoff.status,
          version: latestHandoff.version,
          finalizedAt: latestHandoff.finalizedAt ?? null,
        }
      : null,
  });
}
