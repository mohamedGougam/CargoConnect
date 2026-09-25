"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommercialShell } from "@/components/commercial/CommercialShell";

interface RequestRow {
  id: string;
  type: string;
  status: string;
  origin?: string;
  destination?: string;
  recipient?: string;
  createdAt: string;
  sentAt?: string | null;
}

export function MyRequestsView() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/commercial/requests/list")
      .then(async (r) => {
        const data = (await r.json()) as { requests?: RequestRow[]; error?: string };
        if (!r.ok) throw new Error(data.error ?? "Failed to load");
        setRows(data.requests ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <CommercialShell
      title="My Requests"
      subtitle="Quote and reservation requests you prepared in CargoConnect."
    >
      {loading ? (
        <p className="text-sm" style={{ color: "var(--cc-muted)" }}>
          Loading…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-400/25 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <div
          className="rounded-xl border px-4 py-6"
          style={{
            borderColor: "var(--cc-panel-border)",
            background: "var(--cc-panel)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--cc-page-fg)" }}>
            No commercial requests yet.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--cc-muted)" }}>
            Start from the map with a route search, then request an up-to-date
            quote.
          </p>
          <Link href="/" className="cc-nav-chip cc-nav-chip--accent mt-4">
            Open map
          </Link>
        </div>
      ) : null}
      <div className="space-y-2">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/commercial/requests/${row.id}`}
            className="block rounded-xl border px-4 py-3 transition hover:border-[color:var(--cc-teal)]"
            style={{
              borderColor: "var(--cc-panel-border)",
              background: "var(--cc-panel)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--cc-title)" }}
              >
                {row.origin ?? "—"} → {row.destination ?? "—"}
              </p>
              <div className="flex items-center gap-2">
                {row.status === "RESPONSE_RECEIVED" ? (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px]"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--cc-teal) 35%, transparent)",
                      background: "var(--cc-accent-soft)",
                      color: "var(--cc-section-label)",
                    }}
                  >
                    New response
                  </span>
                ) : null}
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase"
                  style={{
                    borderColor: "var(--cc-panel-border)",
                    color: "var(--cc-nav-fg)",
                  }}
                >
                  {row.status}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "var(--cc-muted)" }}>
              {row.type} · {row.recipient ?? "No recipient"} ·{" "}
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </CommercialShell>
  );
}
