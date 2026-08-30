"use client";

import { useEffect, type ReactNode } from "react";

export type DetailDrawerKind = "vessel" | "port";

interface DetailDrawerProps {
  open: boolean;
  kind: DetailDrawerKind;
  title: string;
  subtitle?: string;
  status?: string;
  onClose: () => void;
  children: ReactNode;
  footerHint?: string;
}

/**
 * Premium contextual details drawer.
 * Overlays the map from the right; scrolls internally; no page overflow.
 */
export function DetailDrawer({
  open,
  kind,
  title,
  subtitle,
  status,
  onClose,
  children,
  footerHint,
}: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const kindLabel = kind === "vessel" ? "Vessel" : "Port";
  const accent = kind === "vessel" ? "text-teal-300/85" : "text-sky-300/85";

  return (
    <aside
      className={`pointer-events-none absolute inset-y-0 right-0 z-40 flex justify-end transition-[visibility] duration-200 ${
        open ? "visible" : "invisible delay-200"
      }`}
      aria-hidden={!open}
    >
      <div
        className={`pointer-events-auto flex h-full w-[min(420px,90vw)] max-w-[460px] flex-col overflow-hidden border-l border-white/10 bg-[rgba(9,15,24,0.94)] shadow-[-24px_0_60px_rgba(0,0,0,0.4)] transition-transform duration-[220ms] ease-out sm:w-[min(440px,92vw)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="false"
        aria-label={`${kindLabel} details`}
      >
        <header className="shrink-0 border-b border-white/[0.08] px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p
                className={`text-[10px] font-semibold tracking-[0.2em] uppercase ${accent}`}
              >
                Details · {kindLabel}
              </p>
              <h2 className="mt-2 break-words font-[family-name:var(--font-fraunces)] text-[1.65rem] leading-tight text-white">
                {title || "—"}
              </h2>
              {subtitle ? (
                <p className="mt-1.5 text-[13px] leading-snug text-slate-300/85">
                  {subtitle}
                </p>
              ) : null}
              {status ? (
                <span className="mt-3 inline-flex items-center rounded-full border border-teal-300/25 bg-teal-400/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-teal-100/95">
                  {status}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              aria-label="Close details"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="cc-drawer-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footerHint ? (
          <footer className="shrink-0 border-t border-white/[0.08] px-6 py-3.5 text-[11px] leading-relaxed text-slate-500">
            {footerHint}
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

interface DetailSectionProps {
  title: string;
  children: ReactNode;
  accent?: "teal" | "sky";
}

export function DetailSection({ title, children, accent = "teal" }: DetailSectionProps) {
  const titleColor = accent === "sky" ? "text-sky-300/80" : "text-teal-300/80";
  return (
    <section className="mb-7 last:mb-2">
      <h3
        className={`mb-3 text-[11px] font-semibold tracking-[0.16em] uppercase ${titleColor}`}
      >
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

interface DetailFieldProps {
  label: string;
  value?: string | number | null;
  /** Show a muted placeholder when value is empty */
  fallback?: string;
}

export function DetailField({ label, value, fallback }: DetailFieldProps) {
  const empty = value === undefined || value === null || value === "" || value === "—";
  if (empty && fallback === undefined) return null;

  return (
    <div className="grid grid-cols-[minmax(0,38%)_minmax(0,62%)] items-start gap-x-4 gap-y-1 rounded-lg px-2.5 py-2.5 hover:bg-white/[0.025]">
      <dt className="pt-0.5 text-[12px] leading-snug text-slate-400">{label}</dt>
      <dd
        className={`break-words text-right text-[13.5px] leading-snug ${
          empty ? "text-slate-500" : "font-medium text-slate-100"
        }`}
      >
        {empty ? fallback : value}
      </dd>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
