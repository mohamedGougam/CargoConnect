import type { CommercialRequest } from "@/domain/commercial/types";
import type { InboundSenderTrust } from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import type { InboundCorrelationMethod } from "@/server/commercial/repos/types";
import {
  extractReplyTokenFromAddresses,
} from "./replyAddress";

export interface CorrelationResult {
  request: CommercialRequest | null;
  method: InboundCorrelationMethod;
}

export async function correlateInboundToRequest(input: {
  toAddresses: string[];
  inReplyTo?: string | null;
  referencesHeader?: string | null;
}): Promise<CorrelationResult> {
  const repos = getRepositories();

  const token = extractReplyTokenFromAddresses(input.toAddresses);
  if (token) {
    const byToken = await repos.requests.findByReplyToken(token);
    if (byToken) {
      return { request: byToken, method: "reply_token" };
    }
  }

  const candidates = [
    ...(input.inReplyTo ? [input.inReplyTo] : []),
    ...parseReferences(input.referencesHeader),
  ];

  for (const ref of candidates) {
    const normalized = normalizeMessageId(ref);
    if (!normalized) continue;
    const outbound = await repos.messages.findByInternetMessageId(normalized);
    if (outbound?.direction === "OUTBOUND" && outbound.commercialRequestId) {
      const req = await repos.requests.get(outbound.commercialRequestId);
      if (req) {
        return {
          request: req,
          method: input.inReplyTo && normalizeMessageId(input.inReplyTo) === normalized
            ? "in_reply_to"
            : "references",
        };
      }
    }
  }

  return { request: null, method: "unmatched" };
}

export function evaluateSenderTrust(input: {
  fromAddress: string;
  request: CommercialRequest | null;
}): InboundSenderTrust {
  if (!input.request?.recipient?.email) return "UNKNOWN";
  const from = normalizeEmail(input.fromAddress);
  const expected = normalizeEmail(input.request.recipient.email);
  if (!from || !expected) return "UNKNOWN";
  if (from === expected) return "EXPECTED_SENDER";
  const fromDomain = from.split("@")[1];
  const expectedDomain = expected.split("@")[1];
  if (fromDomain && expectedDomain && fromDomain === expectedDomain) {
    return "OTHER_SENDER";
  }
  return "OTHER_SENDER";
}

function parseReferences(header?: string | null): string[] {
  if (!header) return [];
  return header.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

export function normalizeMessageId(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("<") && t.endsWith(">")) return t.toLowerCase();
  return `<${t}>`.toLowerCase();
}

function normalizeEmail(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  return (angle?.[1] ?? raw).trim().toLowerCase();
}
