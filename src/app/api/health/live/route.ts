import { NextResponse } from "next/server";
import { checkLive } from "@/server/ops/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness — process is up; no dependency checks. */
export async function GET() {
  const live = await checkLive();
  return NextResponse.json(live);
}
