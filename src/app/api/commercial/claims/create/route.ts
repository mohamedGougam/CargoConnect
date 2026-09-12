import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { createClaimPreparation } from "@/server/claims/createClaim";
import type { ClaimType } from "@/domain/commercial/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set([
  "DELAY",
  "DEMURRAGE_PREPARATION",
  "VESSEL_SUBSTITUTION",
  "MILESTONE_DISPUTE",
  "DOCUMENT_DISPUTE",
  "DELIVERY_DELAY",
  "OTHER",
]);

/** POST /api/commercial/claims/create */
export async function POST(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    bookingId?: string;
    claimType?: string;
    exceptionId?: string;
    title?: string;
    description?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.bookingId) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }
  if (body.claimType && !TYPES.has(body.claimType)) {
    return NextResponse.json({ error: "Invalid claimType" }, { status: 400 });
  }

  const result = await createClaimPreparation({
    bookingId: body.bookingId,
    userId: user.id,
    claimType: body.claimType as ClaimType | undefined,
    exceptionId: body.exceptionId,
    title: body.title,
    description: body.description,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "not_applicable"
          ? 400
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, claim: result.claim });
}
