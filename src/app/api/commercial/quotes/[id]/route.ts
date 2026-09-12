import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { correctCommercialQuote } from "@/server/commercial/comparison/correctQuote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/commercial/quotes/:id
 * Body: { patch: { freightRate?: number, currency?: string, ... } }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { patch?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "patch required" }, { status: 400 });
  }

  // Never trust client-supplied recommendation scores
  const sanitized = { ...body.patch };
  delete sanitized.score;
  delete sanitized.rank;
  delete sanitized.extractionConfidence;

  const result = await correctCommercialQuote({
    quoteId: id,
    userId: user.id,
    patch: sanitized,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 : result.code === "validation" ? 400 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ quote: result.quote });
}
