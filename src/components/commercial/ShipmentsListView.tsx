"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CommercialShell } from "@/components/commercial/CommercialShell";

interface ShipmentRow {
  id: string;
  bookingId: string;
  bookingReference: string;
  origin?: string | null;
  destination?: string | null;
  vesselName?: string | null;
  status: string;
  lastObservedAt?: string | null;
  lastSog?: number | null;
  nextMilestone?: string | null;
  pendingCandidates: number;
  openExceptionCount?: number;
  openExceptionSummary?: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
  }>;
  needsAttention?: boolean;
  completedAt?: string | null;
}

type Filter = "all" | "attention" | "active" | "completed";

export function ShipmentsListView() {
  const [active, setActive] = useState<ShipmentRow[]>([]);
  const [completed, setCompleted] = useState<ShipmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    void fetch("/api/commercial/shipments")
      .then(async (r) => {
        const json = (await r.json()) as {
          active?: ShipmentRow[];
          completed?: ShipmentRow[];
          error?: string;
        };
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        setActive(json.active ?? []);
        setCompleted(json.completed ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (filter === "completed") return completed;
    if (filter === "active") return active;
    if (filter === "attention") {
      return active.filter((s) => s.needsAttention || (s.openExceptionCount ?? 0) > 0);
    }
    return [...active, ...completed];
  }, [filter, active, completed]);

  return (
    <CommercialShell
      title="My Shipments"
      subtitle="Active and completed shipment executions"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["attention", "Needs Attention"],
            ["active", "Active"],
            ["completed", "Completed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
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
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No shipments in this view.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <ShipmentItem key={s.id} s={s} />
          ))}
        </ul>
      )}
      <Link
        href="/commercial/bookings"
        className="mt-6 inline-block text-sm text-teal-300"
      >
        ← My Bookings
      </Link>
    </CommercialShell>
  );
}

function ShipmentItem({ s }: { s: ShipmentRow }) {
  const openCount = s.openExceptionCount ?? 0;
  return (
    <li className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <Link
        href={`/commercial/bookings/${s.bookingId}/tracking`}
        className="text-sm font-medium text-teal-200 hover:underline"
      >
        {s.bookingReference}
      </Link>
      <p className="mt-1 text-sm text-white">
        {s.origin ?? "—"} → {s.destination ?? "—"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {s.vesselName ?? "Vessel TBD"} · {s.status.replace(/_/g, " ")}
        {s.nextMilestone ? ` · Next: ${s.nextMilestone}` : ""}
        {openCount > 0
          ? ` · ${openCount} open exception${openCount === 1 ? "" : "s"}`
          : ""}
        {s.pendingCandidates > 0
          ? ` · ${s.pendingCandidates} broker update(s)`
          : ""}
        {s.lastObservedAt
          ? ` · Last AIS ${new Date(s.lastObservedAt).toLocaleString()}`
          : ""}
      </p>
      {s.openExceptionSummary && s.openExceptionSummary.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-amber-100/80">
          {s.openExceptionSummary.map((ex) => (
            <li key={ex.id}>
              {ex.severity}: {ex.title}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
