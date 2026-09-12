"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";

interface BookingDetail {
  booking: {
    id: string;
    bookingReference: string;
    status: string;
    origin?: string | null;
    destination?: string | null;
    cargoSnapshot: { description?: string; weightTons?: number };
    commercialSnapshot: {
      rate?: number | null;
      currency?: string | null;
      rateUnit?: string | null;
      estimatedFreight?: number | null;
      departure?: string | null;
      transit?: string | null;
      organization: string;
      excludedCharges?: string | null;
    };
    vesselSnapshot?: { vesselName?: string | null } | null;
    externalBookingReference?: string | null;
    brokerOrganization?: string | null;
    confirmedAt: string;
    documentsReadyAt?: string | null;
  };
  confirmation: {
    id: string;
    bookingReference?: string | null;
    vesselName?: string | null;
    inboundMessageId: string;
  } | null;
  request: { id: string; status: string } | null;
  handoff: {
    id: string;
    handoffReference: string;
    status: string;
    version: number;
    finalizedAt?: string | null;
  } | null;
}

export function BookingDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/commercial/bookings/${id}`)
      .then(async (r) => {
        const json = (await r.json()) as BookingDetail & { error?: string };
        if (!r.ok) throw new Error(json.error ?? "Not found");
        setData(json);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [id]);

  if (error) {
    return (
      <CommercialShell title="Booking">
        <p className="text-sm text-rose-200">{error}</p>
        <Link href="/commercial/bookings" className="mt-3 inline-block text-sm text-teal-300">
          My Bookings
        </Link>
      </CommercialShell>
    );
  }

  if (!data) {
    return (
      <CommercialShell title="Booking">
        <p className="text-sm text-slate-400">Loading…</p>
      </CommercialShell>
    );
  }

  const b = data.booking;
  const snap = b.commercialSnapshot;
  const handoffLabel = !data.handoff
    ? "Not created"
    : data.handoff.status === "FINALIZED"
      ? "Finalized"
      : "Draft";

  return (
    <CommercialShell
      title="Booking"
      subtitle={`${b.bookingReference} · ${bookingStatusLabel(b.status)}`}
    >
      <CommercialSection title="Status">
        <p className="text-sm text-teal-100">{bookingStatusLabel(b.status)}</p>
        <p className="mt-1 text-xs text-slate-500">
          Confirmed {new Date(b.confirmedAt).toLocaleString()}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Not a payment or shipment execution status.
        </p>
        <ol className="mt-4 space-y-1 text-xs text-slate-400">
          <li>● Commercially Confirmed</li>
          <li>
            {b.status === "DOCUMENTS_PENDING" ||
            b.status === "READY_FOR_OPERATIONS"
              ? "●"
              : "○"}{" "}
            Documents Complete
          </li>
          <li>
            {b.status === "READY_FOR_OPERATIONS" ? "●" : "○"} Ready for
            Operations
          </li>
          <li>
            {data.handoff?.status === "FINALIZED" ? "●" : "○"} Operational
            Handoff
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Handoff: {handoffLabel}
          {data.handoff ? ` (${data.handoff.handoffReference})` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/commercial/bookings/${b.id}/documents`}
            className="inline-flex rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Manage Documents
          </Link>
          {b.status === "READY_FOR_OPERATIONS" ||
          b.status === "IN_EXECUTION" ? (
            <>
              <Link
                href={`/commercial/bookings/${b.id}/handoff`}
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs text-teal-100"
              >
                {!data.handoff
                  ? "Create Handoff"
                  : "Review Handoff"}
              </Link>
              <Link
                href={`/commercial/bookings/${b.id}/tracking`}
                className="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs text-teal-100"
              >
                {b.status === "IN_EXECUTION"
                  ? "Shipment Tracking"
                  : "Start Shipment Tracking"}
              </Link>
              <button
                type="button"
                className="inline-flex rounded-full border border-amber-300/40 px-4 py-2 text-xs text-amber-100"
                onClick={() => {
                  void fetch("/api/commercial/claims/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      bookingId: b.id,
                      claimType: "OTHER",
                      title: `Claim preparation · ${b.bookingReference}`,
                    }),
                  })
                    .then(async (r) => {
                      const json = (await r.json()) as {
                        claim?: { id: string };
                        error?: string;
                      };
                      if (!r.ok) throw new Error(json.error ?? "Failed");
                      if (json.claim?.id) {
                        router.push(`/commercial/claims/${json.claim.id}`);
                      }
                    })
                    .catch(() => undefined);
                }}
              >
                Create Claim Preparation
              </button>
            </>
          ) : null}
          {data.handoff ? (
            <a
              href={`/api/commercial/bookings/${b.id}/handoff/pdf?handoffId=${data.handoff.id}`}
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs text-teal-100"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      </CommercialSection>

      <CommercialSection title="Route">
        <p className="text-lg text-white">
          {b.origin ?? "—"} → {b.destination ?? "—"}
        </p>
      </CommercialSection>

      <CommercialSection title="Cargo">
        <p className="text-sm text-slate-300">
          {b.cargoSnapshot.description ?? "—"}
          {b.cargoSnapshot.weightTons != null
            ? ` · ${b.cargoSnapshot.weightTons.toLocaleString("en-US")} MT`
            : ""}
        </p>
      </CommercialSection>

      <CommercialSection title="Selected commercial terms">
        <p className="text-sm text-slate-300">
          {snap.currency} {snap.rate}
          {snap.rateUnit ? ` / ${snap.rateUnit}` : ""}
          {snap.estimatedFreight != null
            ? ` · est. ${snap.currency} ${snap.estimatedFreight.toLocaleString("en-US")}`
            : ""}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Laycan {snap.departure ?? "—"} · Transit {snap.transit ?? "—"}
        </p>
        {snap.excludedCharges ? (
          <p className="mt-1 text-xs text-amber-100/70">{snap.excludedCharges}</p>
        ) : null}
      </CommercialSection>

      <CommercialSection title="Broker / carrier">
        <p className="text-sm text-white">{b.brokerOrganization ?? snap.organization}</p>
        {b.externalBookingReference ? (
          <p className="mt-1 text-xs text-slate-400">
            External reference: {b.externalBookingReference}
          </p>
        ) : null}
      </CommercialSection>

      <CommercialSection title="Vessel">
        <p className="text-sm text-slate-300">
          {b.vesselSnapshot?.vesselName ?? "—"}
        </p>
      </CommercialSection>

      <CommercialSection title="Commercial history">
        <ul className="space-y-1 text-xs text-slate-400">
          <li>Selected quote terms frozen in booking snapshot</li>
          <li>Proceed request linked</li>
          <li>Broker confirmation acknowledged</li>
        </ul>
        {data.request ? (
          <Link
            href={`/commercial/requests/${data.request.id}`}
            className="mt-3 inline-block text-sm text-teal-300"
          >
            View commercial request
          </Link>
        ) : null}
        {data.confirmation ? (
          <Link
            href={`/commercial/requests/${data.request?.id}/confirmation`}
            className="mt-2 block text-sm text-teal-300"
          >
            View confirmation review
          </Link>
        ) : null}
      </CommercialSection>

      <Link href="/commercial/bookings" className="text-sm text-teal-300">
        ← My Bookings
      </Link>
    </CommercialShell>
  );
}

function bookingStatusLabel(status: string): string {
  switch (status) {
    case "READY_FOR_OPERATIONS":
      return "Ready for Operations";
    case "IN_EXECUTION":
      return "In Execution";
    case "DOCUMENTS_PENDING":
      return "Documents Pending";
    case "COMMERCIALLY_CONFIRMED":
      return "Commercially Confirmed";
    default:
      return status;
  }
}
