/**
 * DEMO_MODE only: ingest deterministic broker quote fixtures for a request.
 * Uses processInboundEmail — does not bypass domain rules.
 * Never available when DATABASE_URL / postgres persistence is configured.
 */
import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import {
  getCommercialPersistenceMode,
  getRepositories,
} from "@/server/commercial/repos";
import { processInboundEmail } from "@/server/commercial/inbound/processInbound";
import { buildRequestReplyAddress } from "@/server/commercial/inbound/replyAddress";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";
import { hasDatabaseUrl } from "@/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURES = [
  {
    fromAddress: "desk.a@demo-broker.example",
    fromName: "Demo Broker A",
    textBody: `We can offer USD 42/MT for 2,000 MT steel Rotterdam/Alexandria,
transit about 9 days, laycan next week. Validity 7 days.
Includes ocean freight. Excludes local charges.`,
  },
  {
    fromAddress: "desk.b@demo-broker.example",
    fromName: "Demo Broker B",
    textBody: `Quote: USD 45 per MT, 2,000 MT steel Rdam/Alexandria.
Transit approx 7 days. Faster schedule. Validity 5 days.
Ocean freight only.`,
  },
  {
    fromAddress: "desk.c@demo-broker.example",
    fromName: "Demo Broker C",
    textBody: `Lump sum EUR 80,000 for the full 2,000 MT steel cargo
Rotterdam to Alexandria. Transit about 10 days.
Validity 10 days. Subject to space.`,
  },
] as const;

export async function POST(request: Request) {
  if ((process.env.DEMO_MODE ?? "").trim().toLowerCase() !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    hasDatabaseUrl() ||
    getCommercialPersistenceMode() === "postgres" ||
    (process.env.COMMERCIAL_PERSISTENCE ?? "").trim().toLowerCase() ===
      "postgres"
  ) {
    return NextResponse.json(
      {
        error: {
          code: "DEMO_REFUSED",
          message: "Demo fixtures refuse Postgres-backed environments",
        },
      },
      { status: 409 },
    );
  }

  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    policy: "inbound_fixture",
    identityParts: [hashRateLimitIdentity(user.id)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  let body: { requestId?: string };
  try {
    body = (await request.json()) as { requestId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId = body.requestId?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  const repos = getRepositories();
  const commercial = await repos.requests.get(requestId);
  if (!commercial || commercial.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!commercial.replyToken) {
    return NextResponse.json(
      { error: "Request has no reply token — send/simulate RFQ first" },
      { status: 400 },
    );
  }
  const to =
    buildRequestReplyAddress(commercial.replyToken) ??
    `request+${commercial.replyToken}@demo.cargoconnect.local`;

  const results = [];
  for (const [i, fixture] of FIXTURES.entries()) {
    const result = await processInboundEmail({
      provider: "fixture",
      providerMessageId: `demo_quote_${requestId}_${i}_${Date.now()}`,
      fromAddress: fixture.fromAddress,
      fromName: fixture.fromName,
      toAddresses: [to],
      subject: `Re: ${commercial.aiDraft?.subject ?? "Freight quotation request"}`,
      textBody: fixture.textBody,
      rawMetadata: { source: "demo_broker_fixtures" },
    });
    results.push({
      ok: result.ok,
      duplicate: result.ok ? Boolean(result.duplicate) : false,
      quoteId: result.ok && result.quote ? result.quote.id : null,
      organization: fixture.fromName,
    });
  }

  // Presentation: surface quote inbox after simulated RFQ (log mode)
  if (results.some((r) => r.ok)) {
    await promoteDemoRequestStatus(requestId);
  }

  return NextResponse.json({
    ok: true,
    requestId,
    loaded: results.filter((r) => r.ok).length,
    results,
    note: "Deterministic demo broker responses ingested through normal inbound processing.",
  });
}

async function promoteDemoRequestStatus(requestId: string) {
  const repos = getRepositories();
  const commercial = await repos.requests.get(requestId);
  if (!commercial) return;
  if (
    commercial.status === "DELIVERY_SIMULATED" ||
    commercial.status === "SENT"
  ) {
    await repos.requests.save({
      ...commercial,
      status: "RESPONSE_RECEIVED",
      updatedAt: new Date().toISOString(),
    });
  }
}
