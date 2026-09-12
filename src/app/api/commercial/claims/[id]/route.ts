import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getClaimPreparation } from "@/server/claims/manageClaim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/claims/:id */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  const result = await getClaimPreparation({ claimId: id, userId: user.id });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    claim: result.claim,
    evidence: result.evidence ?? [],
  });
}
