import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { sendCommercialRequest } from "@/server/commercial/sendRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/commercial/requests/:id/send
 * Explicit user-confirmed send — never auto-triggered.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const result = await sendCommercialRequest({ requestId: id, user });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "rate_limited"
          ? 429
          : result.code === "EMAIL_VERIFICATION_REQUIRED"
            ? 403
            : result.code === "invalid_status" || result.code === "validation"
              ? 400
              : 502;
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        request: result.request ?? null,
      },
      { status },
    );
  }

  return NextResponse.json({
    request: result.request,
    simulated: result.simulated,
    alreadySent: result.alreadySent ?? false,
    message: result.simulated
      ? "Delivery simulated (EMAIL_DELIVERY_MODE=log). No real email was sent."
      : result.alreadySent
        ? "Request was already sent."
        : "Request sent.",
  });
}
