import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { dismissMilestoneCandidate } from "@/server/execution/confirmMilestone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — dismiss a pending broker/AIS milestone candidate */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; candidateId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id, candidateId } = await context.params;
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await dismissMilestoneCandidate({
    bookingId: booking.id,
    userId: user.id,
    candidateId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
