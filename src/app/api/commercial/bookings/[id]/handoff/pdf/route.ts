import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { generateHandoffPdf } from "@/server/handoff/generatePdf";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";
import { metrics } from "@/server/ops/metrics";
import { logger } from "@/server/ops/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — download handoff PDF (ownership enforced) */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    policy: "handoff_pdf",
    identityParts: [hashRateLimitIdentity(user.id)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  const { id } = await context.params;
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const handoffId = url.searchParams.get("handoffId");
  const handoff = handoffId
    ? await repos.handoffs.get(handoffId)
    : await repos.handoffs.getLatestForBooking(booking.id);

  if (
    !handoff ||
    handoff.bookingId !== booking.id ||
    handoff.userId !== user.id
  ) {
    return NextResponse.json({ error: "Handoff not found" }, { status: 404 });
  }

  try {
    const { bytes, filename } = await generateHandoffPdf({
      handoff,
      userId: user.id,
    });
    metrics.handoffPdfSuccess();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    metrics.handoffPdfFailure();
    logger.error("pdf.handoff_failed", {
      event: "pdf.handoff_failed",
      message: err instanceof Error ? err.message : "failed",
    });
    return NextResponse.json(
      {
        error: {
          code: "PDF_GENERATION_FAILED",
          message: "Could not generate handoff PDF",
        },
      },
      { status: 500 },
    );
  }
}
