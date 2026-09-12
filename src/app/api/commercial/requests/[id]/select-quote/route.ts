import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import {
  deselectCommercialQuote,
  selectCommercialQuote,
} from "@/server/commercial/proceed/selectQuote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/commercial/requests/:id/select-quote */
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
    quoteId?: string;
    preferenceSnapshot?: string;
    selectionReason?: string;
    action?: "select" | "deselect";
  };

  if (body.action === "deselect") {
    const result = await deselectCommercialQuote({
      requestId: id,
      userId: user.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        {
          status:
            result.code === "not_found"
              ? 404
              : result.code === "selection_locked"
                ? 409
                : 400,
        },
      );
    }
    return NextResponse.json({
      deselected: true,
      request: result.request,
    });
  }

  if (!body.quoteId) {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }

  const result = await selectCommercialQuote({
    requestId: id,
    quoteId: body.quoteId,
    userId: user.id,
    preferenceSnapshot: body.preferenceSnapshot ?? null,
    selectionReason: body.selectionReason ?? null,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "selection_locked" ||
            result.code === "quote_expired" ||
            result.code === "quote_superseded"
          ? 409
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    selection: result.selection,
    request: result.request,
    quote: {
      id: result.quote.id,
      organizationName: result.quote.organizationName,
      version: result.quote.version,
    },
  });
}
