/**
 * CSRF posture for CargoConnect.
 *
 * Authenticated mutating APIs use HttpOnly session cookies with SameSite=Lax.
 * Browser cross-site POSTs from foreign origins do not include the cookie under Lax,
 * which covers classic CSRF for our same-origin SPA + fetch model.
 *
 * Additional Origin/Referer checks are applied on high-risk auth and upload routes
 * when an Origin header is present (browsers send it for CORS/fetch).
 *
 * We intentionally do not add CSRF tokens to every JSON API call — the request model
 * is cookie-auth + same-site SPA, not multi-form server-rendered POSTs.
 */

export function assertTrustedOrigin(
  request: Request,
): { ok: true } | { ok: false; error: string; code: string } {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients / same-origin navigations may omit Origin.
    return { ok: true };
  }
  const allowed = allowedOrigins();
  if (allowed.length === 0) return { ok: true };
  try {
    const o = new URL(origin);
    if (allowed.some((a) => a === o.origin)) return { ok: true };
  } catch {
    return { ok: false, error: "Invalid origin", code: "INVALID_ORIGIN" };
  }
  return { ok: false, error: "Origin not allowed", code: "INVALID_ORIGIN" };
}

function allowedOrigins(): string[] {
  const bases: string[] = [];
  const app = process.env.APP_BASE_URL?.trim();
  if (app) {
    try {
      bases.push(new URL(app).origin);
    } catch {
      /* ignore */
    }
  }
  if (process.env.NODE_ENV !== "production") {
    bases.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  const extra = process.env.TRUSTED_ORIGINS?.split(",") ?? [];
  for (const e of extra) {
    const t = e.trim();
    if (!t) continue;
    try {
      bases.push(new URL(t).origin);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(bases)];
}
