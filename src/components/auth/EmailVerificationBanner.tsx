"use client";

import { useCallback, useEffect, useState } from "react";

type SessionSnapshot = {
  email: string;
  emailVerifiedAt: string | null;
};

/**
 * Restrained banner: shown when authenticated but email not verified.
 */
export function EmailVerificationBanner() {
  const [user, setUser] = useState<SessionSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user?: SessionSnapshot | null }) => {
        if (data.user?.email) {
          setUser({
            email: data.user.email,
            emailVerifiedAt: data.user.emailVerifiedAt ?? null,
          });
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!user || user.emailVerifiedAt) return null;

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        cooldownSeconds?: number;
      };
      if (!res.ok) {
        setMessage(
          data.error ??
            (typeof data.cooldownSeconds === "number"
              ? `Please wait ${data.cooldownSeconds}s before requesting another email.`
              : "Could not resend."),
        );
        return;
      }
      setMessage(data.message ?? "Verification email sent.");
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-300/25 bg-amber-950/35 px-4 py-3 text-sm text-amber-50">
      <p className="font-medium">Verify your email to send commercial requests.</p>
      <p className="mt-1 text-xs text-amber-100/75">
        We sent a verification link to <span className="text-amber-50">{user.email}</span>.
        You can still browse, search, and prepare requests.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className="rounded-full border border-amber-200/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-400/20 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Resend verification email"}
        </button>
        {message ? <span className="text-[11px] text-amber-100/70">{message}</span> : null}
      </div>
    </div>
  );
}
