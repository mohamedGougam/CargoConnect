import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { finalizeOperationalHandoff } from "@/server/handoff/finalizeHandoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — explicit finalization with acknowledgements */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    handoffId?: string;
    acknowledgedReview?: boolean;
    acknowledgedNotCarrierDocument?: boolean;
  };

  if (!body.handoffId) {
    return NextResponse.json({ error: "handoffId required" }, { status: 400 });
  }
  if (!body.acknowledgedReview || !body.acknowledgedNotCarrierDocument) {
    return NextResponse.json(
      {
        error: "Explicit acknowledgements are required",
        code: "acknowledgements_required",
      },
      { status: 400 },
    );
  }

  const result = await finalizeOperationalHandoff({
    bookingId: booking.id,
    handoffId: body.handoffId,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      {
        status:
          result.code === "not_found"
            ? 404
            : result.code === "HANDOFF_NOT_READY"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    handoff: result.handoff,
    alreadyFinalized: result.alreadyFinalized ?? false,
    message: result.alreadyFinalized
      ? "Handoff already finalized."
      : "Operational handoff finalized.",
  });
}
