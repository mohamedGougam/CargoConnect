import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Legacy health endpoint — aliases liveness for existing Render healthCheckPath.
 * Prefer /api/health/live and /api/health/ready.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "live",
    service: "cargo-connect",
    timestamp: new Date().toISOString(),
  });
}
