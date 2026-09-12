"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Discreet operator controls — only when server DEMO_MODE=true.
 * Never shown as a customer "demo tour" overlay.
 */
export function DemoOperatorControls({
  variant = "map",
  requestId,
}: {
  variant?: "map" | "shell" | "request";
  requestId?: string;
}) {
  const router = useRouter();
  const [demoMode, setDemoMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/status")
      .then((r) => r.json())
      .then((data: { demoMode?: boolean }) => {
        if (!cancelled) setDemoMode(Boolean(data.demoMode));
      })
      .catch(() => {
        if (!cancelled) setDemoMode(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetDemo = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const secret = window.sessionStorage.getItem("cc_demo_reset_secret");
      if (!secret) {
        setMsg("Set sessionStorage cc_demo_reset_secret (operator) to reset remotely.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/internal/demo/reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setMsg(data.error?.message ?? "Reset refused");
      } else {
        setMsg("Demo state cleared. Reload to continue.");
      }
    } catch {
      setMsg("We couldn't reset demo state right now.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadBrokers = useCallback(async () => {
    if (!requestId) {
      setMsg("Open a commercial request to load broker responses.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/demo/broker-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        loaded?: number;
        error?: string | { message?: string };
      };
      if (!res.ok) {
        const err =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ?? "Could not load responses";
        setMsg(err);
      } else {
        setMsg(`Loaded ${data.loaded ?? 0} demo broker responses.`);
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch {
      setMsg("We couldn't load demo broker responses.");
    } finally {
      setBusy(false);
    }
  }, [requestId]);

  if (!demoMode) return null;

  const panelClass =
    variant === "map"
      ? "pointer-events-auto absolute bottom-4 left-4 z-30 max-w-[16rem]"
      : "mb-4";

  return (
    <div className={panelClass}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-white/10 bg-[rgba(8,16,28,0.75)] px-2.5 py-1 text-[10px] tracking-wide text-slate-400/90 backdrop-blur-sm transition hover:border-white/20 hover:text-slate-200"
        aria-expanded={open}
        aria-label="Operator controls"
      >
        Operator
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-[rgba(8,16,28,0.92)] p-3 text-[11px] text-slate-300 shadow-lg backdrop-blur-md">
          <p className="text-[10px] leading-relaxed text-slate-500">
            Presentation controls. Not customer-facing product features.
          </p>
          {requestId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadBrokers()}
              className="w-full rounded-lg border border-teal-300/20 bg-teal-400/10 px-2.5 py-1.5 text-left text-teal-100/90 transition hover:bg-teal-400/15 disabled:opacity-50"
            >
              Load demo broker responses
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetDemo()}
            className="w-full rounded-lg border border-white/12 px-2.5 py-1.5 text-left text-slate-300 transition hover:border-white/25 disabled:opacity-50"
          >
            Reset demo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              router.push(
                "/?q=" +
                  encodeURIComponent(
                    "2,000 MT steel from Rotterdam to Alexandria",
                  ),
              );
            }}
            className="w-full rounded-lg border border-white/12 px-2.5 py-1.5 text-left text-slate-300 transition hover:border-white/25 disabled:opacity-50"
          >
            Open flagship search
          </button>
          {msg ? <p className="text-[10px] text-slate-400">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
