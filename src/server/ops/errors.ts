import { NextResponse } from "next/server";
import { getRequestId } from "@/server/ops/correlation";
import { logger } from "@/server/ops/logger";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function apiErrorResponse(
  error: unknown,
  fallback: { code: string; message: string; status?: number } = {
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
    status: 500,
  },
): NextResponse {
  const requestId = getRequestId();
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.details ?? {}),
        },
      },
      {
        status: error.status,
        headers: requestId ? { "X-Request-ID": requestId } : undefined,
      },
    );
  }

  logger.error("api.unhandled_error", {
    code: fallback.code,
    message: error instanceof Error ? error.message : "unknown",
  });

  return NextResponse.json(
    {
      error: {
        code: fallback.code,
        message: fallback.message,
        requestId,
      },
    },
    {
      status: fallback.status ?? 500,
      headers: requestId ? { "X-Request-ID": requestId } : undefined,
    },
  );
}

export function jsonOk(
  body: Record<string, unknown>,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  const requestId = getRequestId();
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      ...(requestId ? { "X-Request-ID": requestId } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export function rateLimitedResponse(retryAfterSeconds?: number): NextResponse {
  const requestId = getRequestId();
  const headers: Record<string, string> = {};
  if (requestId) headers["X-Request-ID"] = requestId;
  if (retryAfterSeconds != null) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfterSeconds)));
  }
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        requestId,
        retryAfterSeconds: retryAfterSeconds ?? null,
      },
    },
    { status: 429, headers },
  );
}
