import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { generateClaimPdf } from "@/server/claims/generatePdf";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";
import { metrics } from "@/server/ops/metrics";
import { logger } from "@/server/ops/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/claims/:id/pdf */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    policy: "claim_pdf",
    identityParts: [hashRateLimitIdentity(user.id)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  const { id } = await context.params;
  try {
    const { bytes, filename } = await generateClaimPdf({
      claimId: id,
      userId: user.id,
    });
    metrics.claimPdfSuccess();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    metrics.claimPdfFailure();
    logger.error("pdf.claim_failed", {
      event: "pdf.claim_failed",
      message: err instanceof Error ? err.message : "failed",
    });
    return NextResponse.json(
      {
        error: {
          code: "PDF_GENERATION_FAILED",
          message: "Could not generate claim PDF",
        },
      },
      { status: 404 },
    );
  }
}
