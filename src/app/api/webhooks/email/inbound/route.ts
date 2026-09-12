import { NextResponse } from "next/server";
import { fetchResendReceivedEmail } from "@/server/commercial/inbound/fetchReceived";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import {
  getWebhookSecret,
  verifyResendWebhook,
} from "@/server/commercial/inbound/verifyWebhook";
import { isInboundEmailEnabled } from "@/server/commercial/inbound/replyAddress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * POST /api/webhooks/email/inbound
 * Resend email.received webhook — signature required in production.
 */
export async function POST(request: Request) {
  if (!isInboundEmailEnabled()) {
    return NextResponse.json({ error: "Inbound email disabled" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const secret = getWebhookSecret();
  const verified = verifyResendWebhook({
    rawBody,
    headers: {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  });

  if (!verified.ok) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }

  const event = verified.event;
  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  // Prefer full content from Receiving API; fall back to webhook metadata.
  const full = await fetchResendReceivedEmail(emailId);
  const from = full?.from ?? event.data?.from ?? "";
  const to = full?.to?.length
    ? full.to
    : Array.isArray(event.data?.to)
      ? event.data!.to!
      : [];
  const subject = full?.subject ?? event.data?.subject ?? "";
  const textBody = full?.text ?? "";
  const htmlBody = full?.html ?? null;
  const headers = full?.headers ?? {};
  const internetMessageId =
    full?.messageId ?? event.data?.message_id ?? headers["message-id"] ?? null;
  const inReplyTo = headers["in-reply-to"] ?? null;
  const referencesHeader = headers.references ?? null;

  const attachments =
    full?.attachments?.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.size,
    })) ??
    event.data?.attachments?.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.content_type,
      sizeBytes: a.size ?? 0,
    })) ??
    [];

  const result = await processInboundEmail({
    provider: "resend",
    providerMessageId: emailId,
    fromAddress: from,
    toAddresses: to,
    ccAddresses: full?.cc ?? event.data?.cc,
    subject,
    textBody,
    htmlBody,
    internetMessageId,
    inReplyTo,
    referencesHeader,
    attachments,
    rawMetadata: { eventType: event.type },
  });

  if (!result.ok) {
    const status = result.code === "malformed" ? 400 : 500;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  // Respond quickly — work already done synchronously for MVP reliability.
  return NextResponse.json({
    ok: true,
    duplicate: Boolean(result.duplicate),
    unmatched: Boolean(result.unmatched),
    messageId: result.message.id,
    requestId: result.message.commercialRequestId,
  });
}
