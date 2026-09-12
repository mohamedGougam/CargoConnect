"use client";

import Link from "next/link";
import { useState } from "react";

export function VerifyEmailClient({
  initialStatus,
  message,
  email,
}: {
  initialStatus: "success" | "failed" | "missing";
  message: string;
  email?: string;
}) {
  const [status] = useState(initialStatus);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setResendMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        cooldownSeconds?: number;
      };
      if (!res.ok) {
        setResendMsg(
          data.error ??
            (data.cooldownSeconds
              ? `Please wait ${data.cooldownSeconds}s before trying again.`
              : "Could not resend verification email."),
        );
        return;
      }
      setResendMsg(data.message ?? "Verification email sent.");
    } catch {
      setResendMsg("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(10,18,28,0.88)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <h1 className="font-[family-name:var(--font-fraunces)] text-2xl text-white">
        {status === "success" ? "Email verified" : "Verification needed"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{message}</p>
      {email ? (
        <p className="mt-2 text-xs text-slate-500">{email}</p>
      ) : null}

      {status === "success" ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/commercial/requests"
            className="rounded-full bg-teal-400/90 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            My requests
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200"
          >
            Map
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-xs text-slate-500">
            If you are logged in, you can request a new verification email.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="rounded-full border border-teal-300/40 bg-teal-400/15 px-4 py-2 text-sm text-teal-100 hover:bg-teal-400/25 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Resend verification email"}
          </button>
          {resendMsg ? (
            <p className="text-xs text-slate-400">{resendMsg}</p>
          ) : null}
          <div>
            <Link href="/auth?mode=login" className="text-xs text-teal-200 underline">
              Log in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
