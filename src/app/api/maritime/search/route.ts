import { NextResponse } from "next/server";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import type { Vessel } from "@/domain/models";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/maritime/search
 * Body: { query: string, vessels?: Vessel[] }
 */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const rl = await enforceRateLimit({
    policy: "search",
    identityParts: [hashRateLimitIdentity(ip)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  let body: { query?: string; vessels?: Vessel[] };
  try {
    body = (await request.json()) as { query?: string; vessels?: Vessel[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const vessels = Array.isArray(body.vessels) ? body.vessels.slice(0, 2500) : [];
  const search = runMaritimeRouteSearch({ query, vessels });

  return NextResponse.json({
    search,
    disclaimer:
      "Highlighted vessels are corridor-relevant detections, not commercially available offers.",
  });
}
