import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import {
  closeClaimPreparation,
  createClaimVersion,
  finalizeClaimPreparation,
  setClaimEvidenceIncluded,
  updateClaimAmount,
  updateClaimNotes,
} from "@/server/claims/manageClaim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/commercial/claims/:id/actions */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: {
    action?: string;
    evidenceId?: string;
    included?: boolean;
    userNotes?: string;
    currency?: string | null;
    amount?: number | null;
    note?: string | null;
    acknowledgedReview?: boolean;
    acknowledgedNoLiability?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  let result;
  switch (action) {
    case "set_evidence_included":
      if (!body.evidenceId || typeof body.included !== "boolean") {
        return NextResponse.json({ error: "Invalid evidence toggle" }, { status: 400 });
      }
      result = await setClaimEvidenceIncluded({
        claimId: id,
        evidenceId: body.evidenceId,
        userId: user.id,
        included: body.included,
      });
      break;
    case "update_notes":
      result = await updateClaimNotes({
        claimId: id,
        userId: user.id,
        userNotes: body.userNotes ?? "",
      });
      break;
    case "update_amount":
      result = await updateClaimAmount({
        claimId: id,
        userId: user.id,
        currency: body.currency ?? null,
        amount: body.amount ?? null,
        note: body.note,
      });
      break;
    case "finalize":
      result = await finalizeClaimPreparation({
        claimId: id,
        userId: user.id,
        acknowledgedReview: Boolean(body.acknowledgedReview),
        acknowledgedNoLiability: Boolean(body.acknowledgedNoLiability),
      });
      break;
    case "close":
      result = await closeClaimPreparation({ claimId: id, userId: user.id });
      break;
    case "new_version":
      result = await createClaimVersion({ claimId: id, userId: user.id });
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "immutable" || result.code === "invalid_state"
          ? 409
          : result.code === "ack_required"
            ? 400
            : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    claim: result.claim,
    evidence: result.evidence,
  });
}
