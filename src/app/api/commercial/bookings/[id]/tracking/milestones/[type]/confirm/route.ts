import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { confirmShipmentMilestone } from "@/server/execution/confirmMilestone";
import type { ShipmentMilestoneType } from "@/domain/commercial/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: ShipmentMilestoneType[] = [
  "LOADING_PLANNED",
  "LOADED",
  "DEPARTED",
  "ARRIVED",
  "DISCHARGED",
  "DELIVERED",
];

/** POST — explicit milestone confirmation */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; type: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id, type: rawType } = await context.params;
  const type = rawType.toUpperCase() as ShipmentMilestoneType;
  if (!ALLOWED.includes(type)) {
    return NextResponse.json({ error: "Invalid milestone type" }, { status: 400 });
  }

  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    occurredAt?: string;
    notes?: string;
    acknowledged?: boolean;
    candidateId?: string;
  };

  if (!body.acknowledged) {
    return NextResponse.json(
      {
        error: "Confirmation acknowledgement required",
        code: "acknowledgements_required",
      },
      { status: 400 },
    );
  }

  const result = await confirmShipmentMilestone({
    bookingId: booking.id,
    userId: user.id,
    type,
    occurredAt: body.occurredAt,
    notes: body.notes,
    candidateId: body.candidateId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      {
        status:
          result.code === "not_found"
            ? 404
            : result.code === "invalid_order" || result.code === "immutable"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    milestone: result.milestone,
    execution: result.execution,
    alreadyConfirmed: result.alreadyConfirmed ?? false,
  });
}
