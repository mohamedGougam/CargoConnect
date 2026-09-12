import { NextResponse } from "next/server";
import { checkReady } from "@/server/ops/health";
import { snapshotMetrics } from "@/server/ops/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Readiness — essential dependencies.
 * Optional internal secret: Authorization: Bearer $INTERNAL_OPS_SECRET
 * When set, includes metric counters (no secrets).
 */
export async function GET(request: Request) {
  const { report, httpStatus } = await checkReady();

  const secret = process.env.INTERNAL_OPS_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const includeMetrics =
    Boolean(secret && secret.length >= 16 && token === secret);

  return NextResponse.json(
    {
      ...report,
      ...(includeMetrics ? { metrics: snapshotMetrics() } : {}),
    },
    { status: httpStatus },
  );
}
