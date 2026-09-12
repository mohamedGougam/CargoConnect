import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { acknowledgeCommercialConfirmation } from "@/server/commercial/confirmation/acknowledgeConfirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/commercial/requests/:id/confirmation/acknowledge
 * Explicit user confirmation of commercial agreement — never auto.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    confirmationId?: string;
    acknowledgedReview?: boolean;
    acknowledgedTermsMatch?: boolean;
  };

  if (!body.confirmationId) {
    return NextResponse.json({ error: "confirmationId required" }, { status: 400 });
  }
  if (!body.acknowledgedReview || !body.acknowledgedTermsMatch) {
    return NextResponse.json(
      {
        error: "Explicit acknowledgements are required",
        code: "acknowledgements_required",
      },
      { status: 400 },
    );
  }

  const result = await acknowledgeCommercialConfirmation({
    requestId: id,
    confirmationId: body.confirmationId,
    userId: user.id,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "terms_changed"
          ? 409
          : 400;
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        request: result.request ?? null,
      },
      { status },
    );
  }

  return NextResponse.json({
    request: result.request,
    booking: result.booking,
    alreadyConfirmed: result.alreadyConfirmed ?? false,
    message: result.alreadyConfirmed
      ? "Commercial agreement was already confirmed."
      : "Commercially Confirmed. Booking record created.",
  });
}
