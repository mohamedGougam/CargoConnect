"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommercialShell } from "@/components/commercial/CommercialShell";

interface BookingRow {
  id: string;
  bookingReference: string;
  status: string;
  origin?: string | null;
  destination?: string | null;
  brokerOrganization?: string | null;
  vesselName?: string | null;
  confirmedAt: string;
  handoffStatus?: string | null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "READY_FOR_OPERATIONS":
      return "Ready for Operations";
    case "DOCUMENTS_PENDING":
      return "Documents Pending";
    case "COMMERCIALLY_CONFIRMED":
      return "Commercially Confirmed";
    default:
      return status;
  }
}

function handoffLabel(status?: string | null): string {
  if (!status) return "Not created";
  if (status === "FINALIZED") return "Finalized";
  return "Draft";
}

export function BookingsListView() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/commercial/bookings")
      .then(async (r) => {
        const json = (await r.json()) as {
          bookings?: BookingRow[];
          error?: string;
        };
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        setBookings(json.bookings ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <CommercialShell title="My Bookings" subtitle="Commercially confirmed arrangements">
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-rose-200">{error}</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-slate-400">No bookings yet.</p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <Link
                href={`/commercial/bookings/${b.id}`}
                className="text-sm font-medium text-teal-200 hover:underline"
              >
                {b.bookingReference}
              </Link>
              <p className="mt-1 text-sm text-white">
                {b.origin ?? "—"} → {b.destination ?? "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {b.brokerOrganization ?? "—"}
                {b.vesselName ? ` · ${b.vesselName}` : ""} ·{" "}
                {statusLabel(b.status)} · Handoff: {handoffLabel(b.handoffStatus)}{" "}
                · {new Date(b.confirmedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link href="/commercial/shipments" className="mt-6 mr-4 inline-block text-sm text-teal-300">
        My Shipments
      </Link>
      <Link href="/commercial/requests" className="mt-6 inline-block text-sm text-teal-300">
        ← My Requests
      </Link>
    </CommercialShell>
  );
}
