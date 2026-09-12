import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { issueEmailVerification } from "@/server/commercial/emailVerification";
import { findUserById } from "@/server/commercial/store";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";
import { metrics } from "@/server/ops/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/resend-verification
 * Authenticated only. Rate-limited. No-op friendly if already verified.
 */
export async function POST() {
  const session = await readSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    policy: "verification_resend",
    identityParts: [hashRateLimitIdentity(session.id)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  const user = await findUserById(session.id);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const result = await issueEmailVerification(user);
  if (!result.ok) {
    const status =
      result.code === "already_verified"
        ? 400
        : result.code === "rate_limited" || result.code === "cooldown"
          ? 429
          : 502;
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        cooldownSeconds: result.cooldownSeconds,
      },
      { status },
    );
  }

  metrics.verificationSend();
  return NextResponse.json({
    ok: true,
    simulated: result.simulated,
    message: result.simulated
      ? "Verification email logged (EMAIL_DELIVERY_MODE=log). Check server logs for the link."
      : "Verification email sent.",
  });
}
