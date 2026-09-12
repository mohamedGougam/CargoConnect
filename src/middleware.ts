import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "cc_session";
const REQUEST_ID_HEADER = "x-request-id";

function secret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (raw.length >= 32) {
    return new TextEncoder().encode(raw);
  }
  const demoMode =
    (process.env.DEMO_MODE ?? "").trim().toLowerCase() === "true";
  if (process.env.NODE_ENV === "production" && raw.length < 32 && !demoMode) {
    return new TextEncoder().encode("__invalid_production_secret__");
  }
  return new TextEncoder().encode(
    raw || "cargo-connect-dev-auth-secret-change-me-32+",
  );
}

function generateRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `req_${hex}`;
}

function resolveIncomingRequestId(headerValue: string | null): string {
  const raw = headerValue?.trim() ?? "";
  if (/^req_[a-f0-9]{16,64}$/i.test(raw) || /^[a-f0-9-]{8,64}$/i.test(raw)) {
    return raw.slice(0, 64);
  }
  return generateRequestId();
}

function applySecurityHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  res.headers.set("X-Frame-Options", "DENY");
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://tiles.openfreemap.org",
    "connect-src 'self' https: wss: blob:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return res;
}

export async function middleware(request: NextRequest) {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming
    ? resolveIncomingRequestId(incoming)
    : generateRequestId();

  const { pathname } = request.nextUrl;

  if (pathname === "/api/health/live" || pathname === "/api/health") {
    const res = NextResponse.next();
    return applySecurityHeaders(res, requestId);
  }

  if (!pathname.startsWith("/commercial")) {
    const res = NextResponse.next();
    return applySecurityHeaders(res, requestId);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const next = `${pathname}${request.nextUrl.search}`;
    const url = new URL("/auth", request.url);
    url.searchParams.set("next", next);
    const res = NextResponse.redirect(url);
    return applySecurityHeaders(res, requestId);
  }

  try {
    await jwtVerify(token, secret());
    const res = NextResponse.next();
    return applySecurityHeaders(res, requestId);
  } catch {
    const next = `${pathname}${request.nextUrl.search}`;
    const url = new URL("/auth", request.url);
    url.searchParams.set("next", next);
    const res = NextResponse.redirect(url);
    res.cookies.set(SESSION_COOKIE, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return applySecurityHeaders(res, requestId);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
