"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { AppearanceToggle } from "@/components/ui/AppearanceToggle";

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
    <div
      className="relative min-h-dvh overflow-y-auto"
      style={{
        backgroundColor: "var(--cc-page, #071018)",
        color: "var(--cc-page-fg, #e8eef5)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, var(--cc-page-glow, transparent), transparent 70%)",
        }}
      />
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--cc-panel-border, rgba(255,255,255,0.08))",
          backgroundColor: "var(--cc-header-bg, rgba(7,16,24,0.92))",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <Link
              href="/"
              className="font-[family-name:var(--font-fraunces)] text-[15px]"
              style={{ color: "var(--cc-title, #fff)" }}
            >
              CargoConnect
            </Link>
            <p
              className="truncate text-[11px]"
              style={{ color: "var(--cc-muted-soft, #64748b)" }}
            >
              {title}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <AppearanceToggle compact />
            {user ? (
              <span
                className="hidden max-w-[180px] truncate text-[11px] lg:inline"
                style={{ color: "var(--cc-muted, #94a3b8)" }}
              >
                {user.email}
                <span
                  className="ml-1.5"
                  style={{ color: "var(--cc-muted-soft, #64748b)" }}
                >
                  · {user.emailVerifiedAt ? "Verified" : "Not verified"}
                </span>
              </span>
            ) : null}
            <Link href="/commercial/requests" className="cc-nav-chip">
              Requests
            </Link>
            <Link href="/commercial/bookings" className="cc-nav-chip">
              Bookings
            </Link>
            <Link href="/commercial/shipments" className="cc-nav-chip">
              Shipments
            </Link>
            <Link
              href="/commercial/claims"
              className="cc-nav-chip hidden sm:inline-flex"
            >
              Claims
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="cc-nav-chip"
            >
              Log out
            </button>
            <Link href="/" className="cc-nav-chip cc-nav-chip--accent">
              Map
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1
            className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight sm:text-4xl"
            style={{ color: "var(--cc-title, #fff)" }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className="mt-2 max-w-2xl text-sm leading-relaxed"
              style={{ color: "var(--cc-muted, #94a3b8)" }}
            >
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
    <section
      className="mb-8 rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: "var(--cc-panel-border, rgba(255,255,255,0.08))",
        backgroundColor: "var(--cc-panel, rgba(12,20,32,0.65))",
      }}
    >
      <h2
        className="mb-4 text-[11px] font-semibold tracking-[0.16em] uppercase"
        style={{ color: "var(--cc-section-label, rgba(94,234,212,0.85))" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
