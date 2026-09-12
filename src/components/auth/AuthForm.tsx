"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Mode = "signup" | "login";

export function AuthForm({
  initialMode = "signup",
  nextPath = "/",
}: {
  initialMode?: Mode;
  nextPath?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupPendingVerify, setSignupPendingVerify] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user?: unknown }) => {
        if (data.user && !signupPendingVerify) router.replace(nextPath);
      })
      .catch(() => undefined);
  }, [nextPath, router, signupPendingVerify]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? {
                action: "signup",
                fullName,
                email,
                password,
                companyName: companyName || undefined,
                phone: phone || undefined,
              }
            : { action: "login", email, password },
        ),
      });
      const raw = await res.text();
      let data: {
        error?: string | { message?: string; code?: string };
        user?: unknown;
      } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        setError(
          res.ok
            ? "Unexpected server response"
            : `Authentication failed (${res.status})`,
        );
        return;
      }
      if (!res.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || "Authentication failed";
        setError(message);
        return;
      }
      if (mode === "signup") {
        setSignupPendingVerify(true);
        return;
      }
      router.replace(nextPath);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (signupPendingVerify) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="font-[family-name:var(--font-fraunces)] text-lg text-white/90"
          >
            CargoConnect
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,18,28,0.88)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <h1 className="font-[family-name:var(--font-fraunces)] text-2xl text-white">
            Verify your email
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Account created. We sent a verification link to{" "}
            <span className="text-white">{email}</span>.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            You can explore the platform now. Live commercial sending unlocks after
            you verify.
          </p>
          <button
            type="button"
            onClick={() => router.replace(nextPath)}
            className="mt-6 w-full rounded-full bg-teal-400/90 py-2.5 text-sm font-semibold text-slate-950"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 text-center">
        <Link
          href="/"
          className="font-[family-name:var(--font-fraunces)] text-lg text-white/90"
        >
          CargoConnect
        </Link>
        <p className="mt-2 text-sm text-slate-400">
          {mode === "signup"
            ? "Create an account to continue your commercial request"
            : "Log in to continue your commercial request"}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-white/10 bg-[rgba(10,18,28,0.88)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md"
      >
        <div className="mb-5 flex rounded-full border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition ${
              mode === "signup"
                ? "bg-teal-400/90 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition ${
              mode === "login"
                ? "bg-teal-400/90 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Log in
          </button>
        </div>

        {mode === "signup" ? (
          <Field label="Full name" required>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              autoComplete="name"
              required
            />
          </Field>
        ) : null}

        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password" required>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </Field>

        {mode === "signup" ? (
          <>
            <Field label="Company (optional)">
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
                autoComplete="organization"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                autoComplete="tel"
              />
            </Field>
          </>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-lg border border-rose-400/25 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 w-full rounded-full bg-teal-400/90 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Your route search context is preserved through this step.
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400 uppercase">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-teal-300/40";
