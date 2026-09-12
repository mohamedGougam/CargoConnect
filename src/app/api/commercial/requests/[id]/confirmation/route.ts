import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/requests/:id/confirmation — review payload */
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
  const request = await repos.requests.get(id);
  if (!request || request.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const confirmation =
    (request.activeConfirmationId
      ? await repos.confirmations.get(request.activeConfirmationId)
      : null) ?? (await repos.confirmations.getLatestForRequest(id));

  if (!confirmation) {
    return NextResponse.json(
      { error: "No confirmation received yet", code: "no_confirmation" },
      { status: 404 },
    );
  }

  const [proceed, message, booking, selection] = await Promise.all([
    repos.proceedRequests.get(confirmation.proceedRequestId),
    repos.messages.get(confirmation.inboundMessageId),
    repos.bookings.getForRequest(id),
    repos.selections.getActiveForRequest(id),
  ]);

  return NextResponse.json({
    request: {
      id: request.id,
      status: request.status,
      confirmationStatus: request.confirmationStatus,
      origin: request.origin?.name,
      destination: request.destination?.name,
      cargo: request.cargo,
      bookingId: request.bookingId,
    },
    confirmation,
    proceed: proceed
      ? {
          id: proceed.id,
          status: proceed.status,
          subject: proceed.subject,
          body: proceed.body,
          snapshot: proceed.snapshot,
          sentAt: proceed.sentAt,
          recipientEmail: proceed.recipientEmail,
          recipientOrganization: proceed.recipientOrganization,
        }
      : null,
    sourceMessage: message
      ? {
          id: message.id,
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          subject: message.subject,
          bodySnapshot: message.bodySnapshot,
          senderTrust: message.senderTrust,
          receivedAt: message.receivedAt ?? message.createdAt,
        }
      : null,
    booking: booking
      ? {
          id: booking.id,
          bookingReference: booking.bookingReference,
          status: booking.status,
          confirmedAt: booking.confirmedAt,
        }
      : null,
    selectionId: selection?.id ?? null,
  });
}
