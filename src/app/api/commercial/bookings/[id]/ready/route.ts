import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { markBookingReadyForOperations } from "@/server/documents/markReady";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — explicit Mark Ready for Operations */
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
    acknowledgedReview?: boolean;
    acknowledgedReady?: boolean;
  };

  if (!body.acknowledgedReview || !body.acknowledgedReady) {
    return NextResponse.json(
      {
        error: "Explicit acknowledgements are required",
        code: "acknowledgements_required",
      },
      { status: 400 },
    );
  }

  const result = await markBookingReadyForOperations({
    bookingId: id,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        completeness: result.completeness ?? null,
      },
      {
        status:
          result.code === "not_found"
            ? 404
            : result.code === "incomplete"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    booking: result.booking,
    alreadyReady: result.alreadyReady ?? false,
    message: result.alreadyReady
      ? "Already marked ready for operations."
      : "Document package marked ready for operations.",
  });
}
