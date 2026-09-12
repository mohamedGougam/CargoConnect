import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { resolveOperationalException } from "@/server/exceptions/manageException";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/commercial/bookings/:id/exceptions/:exceptionId/resolve */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; exceptionId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id, exceptionId } = await context.params;
  let note: string | null = null;
  try {
    const body = (await request.json()) as { note?: string };
    note = body.note ?? null;
  } catch {
    note = null;
  }

  const result = await resolveOperationalException({
    bookingId: id,
    exceptionId,
    userId: user.id,
    note,
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
