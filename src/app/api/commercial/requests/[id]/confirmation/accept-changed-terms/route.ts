import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { acceptChangedCommercialTerms } from "@/server/documents/acceptChangedTerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — explicit acceptance of broker-changed commercial terms */
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
    acknowledgedAgreement?: boolean;
  };

  if (!body.confirmationId) {
    return NextResponse.json({ error: "confirmationId required" }, { status: 400 });
  }
  if (!body.acknowledgedReview || !body.acknowledgedAgreement) {
    return NextResponse.json(
      {
        error: "Explicit acknowledgements are required",
        code: "acknowledgements_required",
      },
      { status: 400 },
    );
  }

  const result = await acceptChangedCommercialTerms({
    requestId: id,
    confirmationId: body.confirmationId,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, request: result.request ?? null },
      {
        status:
          result.code === "not_found"
            ? 404
            : result.code === "invalid_status"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    request: result.request,
    booking: result.booking,
    acceptedSnapshot: {
      id: result.acceptedSnapshot.id,
      acceptedAt: result.acceptedSnapshot.acceptedAt,
      previousRate: result.acceptedSnapshot.previousProceedSnapshot.rate,
      acceptedRate: result.acceptedSnapshot.acceptedTerms.rate,
    },
    alreadyAccepted: result.alreadyAccepted ?? false,
    message: result.alreadyAccepted
      ? "Changed terms were already accepted."
      : "Changed terms accepted. Booking created.",
  });
}
