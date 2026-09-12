import { Resend } from "resend";

export interface ReceivedEmailContent {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string | null;
  messageId: string | null;
  headers: Record<string, string>;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

/**
 * Fetch full received email from Resend Receiving API.
 * Webhook payloads are metadata-only.
 */
export async function fetchResendReceivedEmail(
  emailId: string,
): Promise<ReceivedEmailContent | null> {
  const key = process.env.EMAIL_API_KEY?.trim();
  if (!key) return null;

  const resend = new Resend(key);
  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) {
    console.error(
      "[CargoConnect inbound]",
      error?.message ?? "receiving.get failed",
    );
    return null;
  }

  const headers: Record<string, string> = {};
  if (data.headers && typeof data.headers === "object") {
    for (const [k, v] of Object.entries(data.headers)) {
      if (typeof v === "string") headers[k.toLowerCase()] = v;
    }
  }

  const attachments =
    data.attachments?.map((a) => ({
      id: a.id,
      filename: a.filename ?? "attachment",
      contentType: a.content_type ?? "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
    })) ?? [];

  return {
    id: data.id,
    from: typeof data.from === "string" ? data.from : String(data.from ?? ""),
    to: Array.isArray(data.to) ? data.to.map(String) : [],
    cc: Array.isArray(data.cc) ? data.cc.map(String) : [],
    subject: data.subject ?? "",
    text: data.text ?? "",
    html: data.html ?? null,
    messageId: data.message_id ?? headers["message-id"] ?? null,
    headers,
    attachments,
  };
}
