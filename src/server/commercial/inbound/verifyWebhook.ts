import { Webhook } from "svix";

export type ResendInboundWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    message_id?: string;
    attachments?: Array<{
      id: string;
      filename: string;
      content_type: string;
      content_disposition?: string | null;
      content_id?: string | null;
      size?: number;
    }>;
  };
};

/**
 * Verify Resend/Svix webhook signature using the raw body.
 * Throws / returns invalid when signature fails.
 */
export function verifyResendWebhook(input: {
  rawBody: string;
  headers: {
    id?: string | null;
    timestamp?: string | null;
    signature?: string | null;
  };
  secret: string;
}): { ok: true; event: ResendInboundWebhookEvent } | { ok: false; error: string } {
  if (!input.secret) {
    return { ok: false, error: "missing_secret" };
  }
  if (!input.headers.id || !input.headers.timestamp || !input.headers.signature) {
    return { ok: false, error: "missing_headers" };
  }
  try {
    const wh = new Webhook(input.secret);
    const event = wh.verify(input.rawBody, {
      "svix-id": input.headers.id,
      "svix-timestamp": input.headers.timestamp,
      "svix-signature": input.headers.signature,
    }) as unknown as ResendInboundWebhookEvent;
    return { ok: true, event };
  } catch {
    return { ok: false, error: "invalid_signature" };
  }
}

export function getWebhookSecret(): string {
  return (
    process.env.EMAIL_WEBHOOK_SECRET?.trim() ||
    process.env.RESEND_WEBHOOK_SECRET?.trim() ||
    ""
  );
}
