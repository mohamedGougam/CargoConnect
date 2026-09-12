import { NextResponse } from "next/server";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dev-only fixture endpoint for inbound email simulation.
 * Never available when NODE_ENV=production.
 *
 * Enable with EMAIL_INBOUND_DEV_FIXTURES=true
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((process.env.EMAIL_INBOUND_DEV_FIXTURES ?? "").trim() !== "true") {
    return NextResponse.json(
      { error: "Dev fixtures disabled. Set EMAIL_INBOUND_DEV_FIXTURES=true" },
      { status: 403 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await enforceRateLimit({
    policy: "inbound_fixture",
    identityParts: [hashRateLimitIdentity(ip)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  let body: {
    providerMessageId?: string;
    fromAddress?: string;
    fromName?: string;
    toAddresses?: string[];
    subject?: string;
    textBody?: string;
    htmlBody?: string;
    internetMessageId?: string;
    inReplyTo?: string;
    referencesHeader?: string;
    attachments?: Array<{
      id?: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
    }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await processInboundEmail({
    provider: "fixture",
    providerMessageId:
      body.providerMessageId ?? `fixture_${Date.now()}`,
    fromAddress: body.fromAddress ?? "broker@example.com",
    fromName: body.fromName,
    toAddresses: body.toAddresses ?? [],
    subject: body.subject ?? "(no subject)",
    textBody: body.textBody ?? "",
    htmlBody: body.htmlBody,
    internetMessageId: body.internetMessageId,
    inReplyTo: body.inReplyTo,
    referencesHeader: body.referencesHeader,
    attachments: body.attachments,
    rawMetadata: { source: "dev_fixture" },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    duplicate: Boolean(result.duplicate),
    unmatched: Boolean(result.unmatched),
    message: {
      id: result.message.id,
      commercialRequestId: result.message.commercialRequestId,
      senderTrust: result.message.senderTrust,
      correlationMethod: result.message.correlationMethod,
      responseClassification: result.message.responseClassification,
    },
    quote: result.quote
      ? {
          id: result.quote.id,
          freightRate: result.quote.freightRate,
          currency: result.quote.currency,
          rateUnit: result.quote.rateUnit,
          transitTime: result.quote.transitTime,
          validityUntil: result.quote.validityUntil,
          responseClassification: result.quote.responseClassification,
        }
      : null,
  });
}
