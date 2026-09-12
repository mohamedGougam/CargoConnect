"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OperationalHandoff } from "@/domain/commercial/types";
import {
  CommercialSection,
  CommercialShell,
} from "@/components/commercial/CommercialShell";

interface HandoffPayload {
  booking: {
    id: string;
    bookingReference: string;
    status: string;
    origin?: string | null;
    destination?: string | null;
  };
  handoffs: Array<{
    id: string;
    handoffReference: string;
    status: string;
    version: number;
    generatedAt: string;
    finalizedAt?: string | null;
  }>;
  latest: OperationalHandoff | null;
  newerDocumentsThanLatest: boolean;
  disclaimer: string;
}

async function fetchHandoff(bookingId: string): Promise<HandoffPayload> {
  const res = await fetch(`/api/commercial/bookings/${bookingId}/handoff`);
  const json = (await res.json()) as HandoffPayload & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to load handoff");
  return json;
}

export function BookingHandoffView({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<HandoffPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [opsName, setOpsName] = useState("");
  const [opsEmail, setOpsEmail] = useState("");
  const [opsPhone, setOpsPhone] = useState("");
  const [ackReview, setAckReview] = useState(false);
  const [ackNotCarrier, setAckNotCarrier] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchHandoff(bookingId)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        if (json.latest) {
          setNotes(json.latest.operationalNotes ?? "");
          setOpsName(json.latest.operationsContactName ?? "");
          setOpsEmail(json.latest.operationsContactEmail ?? "");
          setOpsPhone(json.latest.operationsContactPhone ?? "");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function reload() {
    const json = await fetchHandoff(bookingId);
    setData(json);
    if (json.latest) {
      setNotes(json.latest.operationalNotes ?? "");
      setOpsName(json.latest.operationsContactName ?? "");
      setOpsEmail(json.latest.operationsContactEmail ?? "");
      setOpsPhone(json.latest.operationsContactPhone ?? "");
    }
  }

  async function createHandoff(forceNewVersion = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commercial/bookings/${bookingId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceNewVersion,
          operationalNotes: notes || null,
          operationsContactName: opsName || null,
          operationsContactEmail: opsEmail || null,
          operationsContactPhone: opsPhone || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not create handoff");
      setMessage(
        forceNewVersion
          ? "New handoff version created"
          : "Handoff draft ready for review",
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create handoff");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!data?.latest) return;
    setBusy(true);
    setError(null);
    try {
      // Persist notes before finalize by regenerating draft
      if (data.latest.status !== "FINALIZED") {
        const save = await fetch(
          `/api/commercial/bookings/${bookingId}/handoff`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operationalNotes: notes || null,
              operationsContactName: opsName || null,
              operationsContactEmail: opsEmail || null,
              operationsContactPhone: opsPhone || null,
            }),
          },
        );
        if (!save.ok) {
          const j = (await save.json()) as { error?: string };
          throw new Error(j.error ?? "Could not save handoff");
        }
        await reload();
      }

      const latestId =
        (
          await fetch(`/api/commercial/bookings/${bookingId}/handoff`).then(
            (r) => r.json(),
          )
        ).latest?.id ?? data.latest.id;

      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/handoff/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handoffId: latestId,
            acknowledgedReview: ackReview,
            acknowledgedNotCarrierDocument: ackNotCarrier,
          }),
        },
      );
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not finalize");
      setMessage(json.message ?? "Finalized");
      setAckReview(false);
      setAckNotCarrier(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <CommercialShell title="Operational Handoff">
        <p className="text-sm text-rose-200">{error}</p>
        <Link
          href={`/commercial/bookings/${bookingId}`}
          className="mt-3 inline-block text-sm text-teal-300"
        >
          ← Booking
        </Link>
      </CommercialShell>
    );
  }

  if (!data) {
    return (
      <CommercialShell title="Operational Handoff">
        <p className="text-sm text-slate-400">Loading…</p>
      </CommercialShell>
    );
  }

  const h = data.latest;
  const editable = h && h.status !== "FINALIZED";

  return (
    <CommercialShell
      title="Operational Handoff"
      subtitle={`${data.booking.bookingReference} · ${data.booking.origin ?? "—"} → ${data.booking.destination ?? "—"}`}
    >
      <p className="mb-4 text-xs text-slate-500">{data.disclaimer}</p>

      {error ? <p className="mb-3 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-teal-200">{message}</p> : null}

      {!h ? (
        <CommercialSection title="Create handoff">
          <p className="text-sm text-slate-400">
            Consolidate booking, commercial terms, vessel, and documents into an
            operational summary.
          </p>
          <button
            type="button"
            disabled={busy || data.booking.status !== "READY_FOR_OPERATIONS"}
            onClick={() => void createHandoff(false)}
            className="mt-4 rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
          >
            Create Handoff
          </button>
          {data.booking.status !== "READY_FOR_OPERATIONS" ? (
            <p className="mt-2 text-xs text-amber-100/80">
              Booking must be Ready for Operations first.
            </p>
          ) : null}
        </CommercialSection>
      ) : (
        <>
          <CommercialSection title="Handoff status">
            <p className="text-sm text-teal-100">
              {h.handoffReference} · {h.status} · v{h.version}
            </p>
            {data.newerDocumentsThanLatest && h.status === "FINALIZED" ? (
              <p className="mt-2 text-sm text-amber-100/90">
                A newer document version exists. Create a new handoff version to
                include it.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {h.status === "FINALIZED" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createHandoff(true)}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs text-teal-100"
                >
                  Create New Handoff Version
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createHandoff(false)}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs text-teal-100"
                >
                  Regenerate Draft
                </button>
              )}
              <a
                href={`/api/commercial/bookings/${bookingId}/handoff/pdf?handoffId=${h.id}`}
                className="rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950"
              >
                Download PDF
              </a>
            </div>
          </CommercialSection>

          {h.operationalSummary ? (
            <CommercialSection title="Summary">
              <p className="text-sm text-slate-300">{h.operationalSummary}</p>
            </CommercialSection>
          ) : null}

          <CommercialSection title="Booking Summary">
            <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Reference</dt>
                <dd>{h.bookingSnapshot.bookingReference}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">External ref</dt>
                <dd>{h.bookingSnapshot.externalBookingReference ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Status</dt>
                <dd>{h.bookingSnapshot.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Broker</dt>
                <dd>{h.bookingSnapshot.brokerOrganization ?? "—"}</dd>
              </div>
            </dl>
          </CommercialSection>

          <CommercialSection title="Commercial Terms">
            <p className="text-sm text-white">
              {h.commercialSnapshot.currency} {h.commercialSnapshot.rate}
              {h.commercialSnapshot.rateUnit
                ? ` / ${h.commercialSnapshot.rateUnit}`
                : ""}
              {h.commercialSnapshot.estimatedFreight != null
                ? ` · est. ${h.commercialSnapshot.currency} ${h.commercialSnapshot.estimatedFreight.toLocaleString("en-US")}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Laycan {h.commercialSnapshot.departure ?? "—"} · Transit{" "}
              {h.commercialSnapshot.transit ?? "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Source: {h.commercialSnapshot.sourceLabel}
            </p>
          </CommercialSection>

          <CommercialSection title="Shipment Details">
            <p className="text-sm text-slate-300">
              {h.shipmentSnapshot.cargoDescription ?? "—"}
              {h.shipmentSnapshot.quantityTons != null
                ? ` · ${h.shipmentSnapshot.quantityTons.toLocaleString("en-US")} ${h.shipmentSnapshot.unit}`
                : ""}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {h.shipmentSnapshot.origin ?? "—"} →{" "}
              {h.shipmentSnapshot.destination ?? "—"}
            </p>
          </CommercialSection>

          <CommercialSection title="Vessel">
            <p className="text-sm text-slate-300">
              {h.vesselSnapshot.vesselName ?? "—"}
              {h.vesselSnapshot.vesselImo
                ? ` · IMO ${h.vesselSnapshot.vesselImo}`
                : ""}
            </p>
          </CommercialSection>

          <CommercialSection title="Contacts">
            <p className="text-sm text-slate-300">
              Requester: {h.contactsSnapshot.requesterName ?? "—"} (
              {h.contactsSnapshot.requesterEmail ?? "—"})
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Broker: {h.contactsSnapshot.brokerOrganization ?? "—"} ·{" "}
              {h.contactsSnapshot.brokerEmail ?? "—"}
            </p>
          </CommercialSection>

          <CommercialSection title="Document Manifest">
            <ul className="space-y-2 text-sm">
              {h.documentManifest.map((d) => (
                <li key={d.documentType} className="text-slate-300">
                  <span className="text-teal-200">
                    {d.uploaded ? "✓" : "○"} {d.label}
                  </span>
                  {!d.required ? (
                    <span className="text-xs text-slate-500"> · Optional</span>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {d.uploaded
                      ? `${d.filename} · v${d.version} · ${d.validationLabel}`
                      : d.validationLabel}
                  </p>
                </li>
              ))}
            </ul>
          </CommercialSection>

          <CommercialSection title="Warnings">
            {h.warnings.length === 0 ? (
              <p className="text-sm text-slate-500">None</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {h.warnings.map((w) => (
                  <li
                    key={w.code + w.message}
                    className={
                      w.severity === "CRITICAL"
                        ? "text-rose-200"
                        : w.severity === "WARNING"
                          ? "text-amber-100"
                          : "text-slate-400"
                    }
                  >
                    [{w.severity}] {w.message}
                  </li>
                ))}
              </ul>
            )}
          </CommercialSection>

          <CommercialSection title="Missing Information">
            <ul className="space-y-1 text-sm text-slate-400">
              {h.missingInformation.map((m) => (
                <li key={m.code}>• {m.message}</li>
              ))}
            </ul>
          </CommercialSection>

          <CommercialSection title="Source References">
            <ul className="space-y-1 text-xs text-slate-500">
              {h.provenance.map((p) => (
                <li key={p.field}>
                  {p.field}: {p.displayValue} — {p.source}
                </li>
              ))}
            </ul>
          </CommercialSection>

          {editable ? (
            <CommercialSection title="Operations contact & notes">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs text-slate-500">
                  Name
                  <input
                    className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                    value={opsName}
                    onChange={(e) => setOpsName(e.target.value)}
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Email
                  <input
                    className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                    value={opsEmail}
                    onChange={(e) => setOpsEmail(e.target.value)}
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Phone
                  <input
                    className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                    value={opsPhone}
                    onChange={(e) => setOpsPhone(e.target.value)}
                  />
                </label>
              </div>
              <label className="mt-3 block text-xs text-slate-500">
                Operational notes (user-entered)
                <textarea
                  className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. loading appointment required"
                />
              </label>
            </CommercialSection>
          ) : null}

          {editable ? (
            <CommercialSection title="Finalize">
              <label className="flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={ackReview}
                  onChange={(e) => setAckReview(e.target.checked)}
                  className="mt-1"
                />
                I have reviewed the operational handoff information.
              </label>
              <label className="mt-2 flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={ackNotCarrier}
                  onChange={(e) => setAckNotCarrier(e.target.checked)}
                  className="mt-1"
                />
                I understand this package is a CargoConnect operational summary
                and not a carrier-issued transport document.
              </label>
              <button
                type="button"
                disabled={busy || !ackReview || !ackNotCarrier}
                onClick={() => void finalize()}
                className="mt-4 rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
              >
                Finalize Operational Handoff
              </button>
            </CommercialSection>
          ) : (
            <CommercialSection title="Finalized">
              <p className="text-sm text-teal-100">
                Finalized{" "}
                {h.finalizedAt
                  ? new Date(h.finalizedAt).toLocaleString()
                  : ""}
                . This version is immutable.
              </p>
            </CommercialSection>
          )}

          {data.handoffs.length > 1 ? (
            <CommercialSection title="Versions">
              <ul className="space-y-1 text-xs text-slate-500">
                {data.handoffs.map((v) => (
                  <li key={v.id}>
                    {v.handoffReference} · {v.status}
                    {v.finalizedAt
                      ? ` · finalized ${new Date(v.finalizedAt).toLocaleString()}`
                      : ""}
                  </li>
                ))}
              </ul>
            </CommercialSection>
          ) : null}
        </>
      )}

      <Link
        href={`/commercial/bookings/${bookingId}`}
        className="mt-4 inline-block text-sm text-teal-300"
      >
        ← Booking
      </Link>
    </CommercialShell>
  );
}
