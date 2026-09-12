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
      {loading ? <p className="text-sm text-slate-400">Loading…</p> : null}
      {error ? (
        <p className="rounded-xl border border-rose-400/25 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-6">
          <p className="text-sm text-slate-300">No commercial requests yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Start from the map with a route search, then request an up-to-date
            quote.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-full border border-teal-300/30 px-3 py-1.5 text-xs text-teal-100"
          >
            Open map
          </Link>
        </div>
      ) : null}
      <div className="space-y-2">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/commercial/requests/${row.id}`}
            className="block rounded-xl border border-white/10 bg-[rgba(12,20,32,0.65)] px-4 py-3 transition hover:border-teal-300/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">
                {row.origin ?? "—"} → {row.destination ?? "—"}
              </p>
              <div className="flex items-center gap-2">
                {row.status === "RESPONSE_RECEIVED" ? (
                  <span className="rounded-full border border-teal-300/30 bg-teal-400/10 px-2 py-0.5 text-[10px] text-teal-100">
                    New response
                  </span>
                ) : null}
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-wide text-slate-300 uppercase">
                  {row.status}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {row.type} · {row.recipient ?? "No recipient"} ·{" "}
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </CommercialShell>
  );
}
