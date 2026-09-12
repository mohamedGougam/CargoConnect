/**
 * Client-safe demo flags. Never returns secrets.
 * GET /api/demo/status
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const demoMode = (process.env.DEMO_MODE ?? "").trim().toLowerCase() === "true";
  return NextResponse.json({
    demoMode,
    persistence: demoMode ? "memory_demo" : "standard",
    brokerFixturesAvailable: demoMode,
  });
}
