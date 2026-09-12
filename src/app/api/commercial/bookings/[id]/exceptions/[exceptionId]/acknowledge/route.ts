import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { acknowledgeOperationalException } from "@/server/exceptions/manageException";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/commercial/bookings/:id/exceptions/:exceptionId/acknowledge */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; exceptionId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id, exceptionId } = await context.params;
  const result = await acknowledgeOperationalException({
    bookingId: id,
    exceptionId,
    userId: user.id,
  });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "invalid_state"
          ? 409
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }
  return NextResponse.json({ ok: true, exception: result.exception });
}
