"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommercialShell } from "@/components/commercial/CommercialShell";

interface ClaimRow {
  id: string;
  reference: string;
  bookingId: string;
  bookingReference: string;
  origin?: string | null;
  destination?: string | null;
  claimType: string;
  status: string;
  version: number;
  claimedAmount?: number | null;
  claimedCurrency?: string | null;
  updatedAt: string;
  title: string;
}

type Filter = "all" | "DRAFT" | "FINALIZED" | "CLOSED";

export function ClaimsListView() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    void fetch(`/api/commercial/claims${q}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          claims?: ClaimRow[];
          error?: string;
        };
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        setClaims(json.claims ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <CommercialShell
      title="Claim Preparations"
      subtitle="Evidence packages — not liability determinations"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["DRAFT", "Draft"],
            ["FINALIZED", "Finalized"],
            ["CLOSED", "Closed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setLoading(true);
              setFilter(id);
            }}
            className={`rounded-full px-3 py-1 text-xs ${
              filter === id
                ? "bg-teal-400/90 font-semibold text-slate-950"
                : "border border-white/15 text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-rose-200">{error}</p>
      ) : claims.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-6">
          <p className="text-sm text-slate-300">No claim preparations yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Open a shipment with an operational exception, then prepare claim
            evidence from tracking.
          </p>
          <Link
            href="/commercial/shipments"
            className="mt-4 inline-flex rounded-full border border-teal-300/30 px-3 py-1.5 text-xs text-teal-100"
          >
            View shipments
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {claims.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <Link
                href={`/commercial/claims/${c.id}`}
                className="text-sm font-medium text-teal-200 hover:underline"
              >
                {c.reference}
              </Link>
              <p className="mt-1 text-sm text-white">{c.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {c.bookingReference} · {c.origin ?? "—"} → {c.destination ?? "—"}{" "}
                · {c.claimType.replace(/_/g, " ")} · {c.status} · v{c.version}
                {c.claimedAmount != null
                  ? ` · ${c.claimedCurrency ?? ""} ${c.claimedAmount}`.trim()
                  : ""}
                · Updated {new Date(c.updatedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/commercial/shipments"
        className="mt-6 inline-block text-sm text-teal-300"
      >
        ← My Shipments
      </Link>
    </CommercialShell>
  );
}
