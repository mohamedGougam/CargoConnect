import { NextResponse } from "next/server";
import {
  loginUser,
  readSessionUser,
  setSessionCookie,
  signupUser,
  clearSessionCookie,
} from "@/server/commercial/auth";
import { assertTrustedOrigin } from "@/server/ops/csrf";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse, jsonOk, apiErrorResponse } from "@/server/ops/errors";
import {
  resolveIncomingRequestId,
  runWithRequestIdAsync,
  REQUEST_ID_HEADER,
} from "@/server/ops/correlation";
import { metrics } from "@/server/ops/metrics";
import { logger } from "@/server/ops/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function GET(request: Request) {
  const requestId = resolveIncomingRequestId(
    request.headers.get(REQUEST_ID_HEADER),
  );
  return runWithRequestIdAsync(requestId, async () => {
    const user = await readSessionUser();
    return jsonOk({ user });
  });
}

export async function POST(request: Request) {
  const requestId = resolveIncomingRequestId(
    request.headers.get(REQUEST_ID_HEADER),
  );
  return runWithRequestIdAsync(requestId, async () => {
    try {
      const originCheck = assertTrustedOrigin(request);
      if (!originCheck.ok) {
        return NextResponse.json(
          {
            error: {
              code: originCheck.code,
              message: originCheck.error,
              requestId,
            },
          },
          { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
        );
      }

      let body: {
        action?: string;
        fullName?: string;
        email?: string;
        password?: string;
        companyName?: string;
        phone?: string;
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return NextResponse.json(
          {
            error: { code: "INVALID_JSON", message: "Invalid JSON", requestId },
          },
          { status: 400, headers: { [REQUEST_ID_HEADER]: requestId } },
        );
      }

      const action = body.action;
      const ip = clientIp(request);
      const email = (body.email ?? "").trim().toLowerCase();

      if (action === "signup") {
        const rl = await enforceRateLimit({
          policy: "signup",
          identityParts: [
            hashRateLimitIdentity(ip),
            hashRateLimitIdentity(email || "none"),
          ],
        });
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

        const result = await signupUser({
          fullName: body.fullName ?? "",
          email: body.email ?? "",
          password: body.password ?? "",
          companyName: body.companyName,
          phone: body.phone,
        });
        if ("error" in result) {
          return NextResponse.json(
            {
              error: {
                code: "SIGNUP_FAILED",
                message: result.error,
                requestId,
              },
            },
            { status: 400, headers: { [REQUEST_ID_HEADER]: requestId } },
          );
        }
        metrics.authSignup();
        await setSessionCookie(result.user.id);
        logger.info("auth.signup", { userId: result.user.id });
        return jsonOk({ user: result.user });
      }

      if (action === "login") {
        const rl = await enforceRateLimit({
          policy: "login",
          identityParts: [
            hashRateLimitIdentity(ip),
            hashRateLimitIdentity(email || "none"),
          ],
        });
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

        const result = await loginUser({
          email: body.email ?? "",
          password: body.password ?? "",
        });
        if ("error" in result) {
          metrics.authLoginFailure();
          logger.warn("auth.login_failure", {
            event: "auth.login_failure",
            // hashed identity only
            identity: hashRateLimitIdentity(email || ip),
          });
          return NextResponse.json(
            {
              error: {
                code: "INVALID_CREDENTIALS",
                message: result.error,
                requestId,
              },
            },
            { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } },
          );
        }
        metrics.authLoginSuccess();
        await setSessionCookie(result.user.id);
        return jsonOk({ user: result.user });
      }

      if (action === "logout") {
        await clearSessionCookie();
        return jsonOk({ ok: true });
      }

      return NextResponse.json(
        {
          error: {
            code: "UNKNOWN_ACTION",
            message: "Unknown action",
            requestId,
          },
        },
        { status: 400, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    } catch (error) {
      const message =
        error instanceof Error && /AUTH_SECRET/i.test(error.message)
          ? "Server auth is misconfigured (AUTH_SECRET). Set it in Render env and redeploy."
          : "Authentication failed due to a server error";
      return apiErrorResponse(error, {
        code: "AUTH_INTERNAL",
        message,
        status: 500,
      });
    }
  });
}
