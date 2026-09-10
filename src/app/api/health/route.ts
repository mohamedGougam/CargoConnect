import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight health check for Render / load balancers.
 * Does not expose secrets or AIS credentials.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "cargo-connect",
    timestamp: new Date().toISOString(),
  });
}
