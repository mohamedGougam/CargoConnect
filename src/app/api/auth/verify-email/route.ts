import { NextResponse } from "next/server";
import { consumeEmailVerificationToken } from "@/server/commercial/emailVerification";
import { publicUser } from "@/server/commercial/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify-email
 * Body: { token: string }
 */
export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired verification link.", code: "invalid" },
      { status: 400 },
    );
  }

  const result = await consumeEmailVerificationToken(body.token ?? "");
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: publicUser(result.user),
    message: "Email verified. You can send commercial requests.",
  });
}
