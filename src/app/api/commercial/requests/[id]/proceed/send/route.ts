import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { sendProceedRequest } from "@/server/commercial/proceed/sendProceed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/commercial/requests/:id/proceed/send
 * Explicit user-confirmed proceed send — never auto-triggered.
 */
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
    proceedId?: string;
    subject?: string;
    body?: string;
  };

  if (!body.proceedId) {
    return NextResponse.json({ error: "proceedId required" }, { status: 400 });
  }

  const result = await sendProceedRequest({
    requestId: id,
    proceedId: body.proceedId,
    user,
    subject: body.subject,
    body: body.body,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "rate_limited"
          ? 429
          : result.code === "EMAIL_VERIFICATION_REQUIRED"
            ? 403
            : result.code === "QUOTE_EXPIRED" ||
                result.code === "quote_superseded" ||
                result.code === "send_in_progress"
              ? 409
              : result.code === "invalid_status" ||
                  result.code === "validation" ||
                  result.code === "missing_recipient" ||
                  result.code === "invalid_recipient"
                ? 400
                : 502;
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        request: result.request ?? null,
        proceed: result.proceed ?? null,
      },
      { status },
    );
  }

  return NextResponse.json({
    request: result.request,
    proceed: result.proceed,
    simulated: result.simulated,
    alreadySent: result.alreadySent ?? false,
    message: result.simulated
      ? "Proceed delivery simulated (EMAIL_DELIVERY_MODE=log). No real email was sent. Status: Awaiting Broker Confirmation."
      : result.alreadySent
        ? "Proceed request was already sent."
        : "Proceed request sent. Awaiting Broker Confirmation.",
  });
}
