import { randomBytes } from "crypto";

export function isInboundEmailEnabled(): boolean {
  return (process.env.EMAIL_INBOUND_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function getInboundDomain(): string {
  return (
    process.env.EMAIL_INBOUND_DOMAIN?.trim() ||
    process.env.EMAIL_REPLY_DOMAIN?.trim() ||
    ""
  );
}

/** Cryptographically strong, non-sequential reply correlation token. */
export function generateReplyToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Plus-address Reply-To for capture:
 * request+{token}@{EMAIL_INBOUND_DOMAIN}
 */
export function buildRequestReplyAddress(replyToken: string): string | null {
  const domain = getInboundDomain();
  if (!domain || !replyToken) return null;
  return `request+${replyToken}@${domain}`;
}

export function extractReplyTokenFromAddress(address: string): string | null {
  const email = address.trim();
  // Preserve token case — only the scheme/local prefix is matched case-insensitively.
  const match = email.match(/^request\+([A-Za-z0-9_-]+)@/i);
  return match?.[1] ?? null;
}

export function extractReplyTokenFromAddresses(addresses: string[]): string | null {
  for (const addr of addresses) {
    const token = extractReplyTokenFromAddress(addr);
    if (token) return token;
  }
  return null;
}

export function buildOutboundInternetMessageId(replyToken: string): string {
  const domain = getInboundDomain() || "cargoconnect.local";
  return `<cc-${replyToken}@${domain}>`;
}
