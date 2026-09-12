import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/requests/:id — detail + audit + conversation + quotes */
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
  const req = await repos.requests.get(id);
  if (!req || req.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [audits, messages, quotes, attachments, selection, proceed, confirmation, booking] =
    await Promise.all([
      repos.audits.listForRequest(id),
      repos.messages.listForRequest(id),
      repos.quotes.listForRequest(id),
      repos.attachments.listForRequest(id),
      repos.selections.getActiveForRequest(id),
      repos.proceedRequests.getLatestForRequest(id),
      repos.confirmations.getLatestForRequest(id),
      repos.bookings.getForRequest(id),
    ]);

  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const a of attachments) {
    const list = attachmentsByMessage.get(a.commercialMessageId) ?? [];
    list.push(a);
    attachmentsByMessage.set(a.commercialMessageId, list);
  }

  return NextResponse.json({
    request: req,
    audits,
    quotes,
    selection: selection ?? null,
    proceed: proceed
      ? {
          id: proceed.id,
          status: proceed.status,
          commercialQuoteId: proceed.commercialQuoteId,
          sentAt: proceed.sentAt,
          recipientEmail: proceed.recipientEmail,
          recipientOrganization: proceed.recipientOrganization,
          snapshot: proceed.snapshot,
        }
      : null,
    confirmation: confirmation
      ? {
          id: confirmation.id,
          classification: confirmation.classification,
          termsChanged: confirmation.termsChanged,
          reviewStatus: confirmation.reviewStatus,
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
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      messageKind: m.messageKind ?? null,
      provider: m.provider,
      providerMessageId: m.providerMessageId,
      fromAddress: m.fromAddress,
      fromName: m.fromName,
      toAddress: m.toAddress,
      replyTo: m.replyTo,
      subject: m.subject,
      bodySnapshot: m.bodySnapshot,
      htmlSnapshot: m.htmlSnapshot,
      deliveryStatus: m.deliveryStatus,
      senderTrust: m.senderTrust,
      correlationMethod: m.correlationMethod,
      responseClassification: m.responseClassification,
      createdAt: m.createdAt,
      sentAt: m.sentAt,
      receivedAt: m.receivedAt,
      attachments: (attachmentsByMessage.get(m.id) ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
      })),
    })),
  });
}
