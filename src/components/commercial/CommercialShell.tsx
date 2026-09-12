"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";

export function CommercialShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<{
    email: string;
    emailVerifiedAt: string | null;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then(
        (data: {
          user?: { email?: string; emailVerifiedAt?: string | null } | null;
        }) => {
          if (data.user?.email) {
            setUser({
              email: data.user.email,
              emailVerifiedAt: data.user.emailVerifiedAt ?? null,
            });
          } else {
            setUser(null);
          }
        },
      )
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/");
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-[#071018] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[rgba(7,16,24,0.92)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <Link
              href="/"
              className="font-[family-name:var(--font-fraunces)] text-[15px] text-white/90"
            >
              CargoConnect
            </Link>
            <p className="truncate text-[11px] text-slate-500">{title}</p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <span className="hidden max-w-[220px] truncate text-[11px] text-slate-400 sm:inline">
                {user.email}
                <span className="ml-1.5 text-slate-600">
                  · {user.emailVerifiedAt ? "Verified" : "Not verified"}
                </span>
              </span>
            ) : null}
            <Link
              href="/commercial/requests"
              className="rounded-full border border-white/12 px-3 py-1 text-[11px] text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Requests
            </Link>
            <Link
              href="/commercial/bookings"
              className="rounded-full border border-white/12 px-3 py-1 text-[11px] text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Bookings
            </Link>
            <Link
              href="/commercial/shipments"
              className="rounded-full border border-white/12 px-3 py-1 text-[11px] text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Shipments
            </Link>
            <Link
              href="/commercial/claims"
              className="hidden rounded-full border border-white/12 px-3 py-1 text-[11px] text-slate-300 transition hover:border-white/25 hover:text-white sm:inline-flex"
            >
              Claims
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-full border border-white/12 px-3 py-1 text-[11px] text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Log out
            </button>
            <Link
              href="/"
              className="rounded-full border border-teal-300/25 bg-teal-400/10 px-3 py-1 text-[11px] text-teal-100 transition hover:bg-teal-400/15"
            >
              Map
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <EmailVerificationBanner />
        {children}
      </main>
    </div>
  );
}

export function CommercialSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-white/8 bg-[rgba(12,20,32,0.65)] p-5 sm:p-6">
      <h2 className="mb-4 text-[11px] font-semibold tracking-[0.16em] text-teal-300/85 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
