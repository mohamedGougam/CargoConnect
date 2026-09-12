"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";

interface ProceedPayload {
  locked: boolean;
  proceed: {
    id: string;
    status: string;
    subject: string;
    body: string;
    recipientEmail: string;
    recipientOrganization: string;
    recipientFromInbound?: boolean;
    inboundSenderTrust?: string | null;
    snapshot: {
      organization: string;
      currency?: string | null;
      rate?: number | null;
      rateUnit?: string | null;
      estimatedFreight?: number | null;
      departure?: string | null;
      transit?: string | null;
      validity?: string | null;
      vesselName?: string | null;
      includedCharges?: string | null;
      excludedCharges?: string | null;
      paymentTerms?: string | null;
      quoteVersion: number;
    };
    sentAt?: string | null;
  };
  request: {
    id: string;
    status: string;
    origin?: { name?: string };
    destination?: { name?: string };
    cargo?: {
      description?: string;
      weightTons?: number;
    };
    requestedDeparture?: string;
  };
  warnings: string[];
  draft: { subject: string; body: string };
  sourceMessageId: string;
  quote?: {
    expiryState?: string;
    confidenceLabel?: string;
    hasManualCorrections?: boolean;
  } | null;
}

export function ProceedReviewView({ requestId }: { requestId: string }) {
  const [data, setData] = useState<ProceedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ackPrice, setAckPrice] = useState(false);
  const [ackNotBooking, setAckNotBooking] = useState(false);
  const [ackExclusions, setAckExclusions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/commercial/requests/${requestId}/proceed`);
        const json = (await res.json()) as ProceedPayload & {
          error?: string;
          code?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load proceed review");
        if (!cancelled) {
          setData(json);
          setSubject(json.draft.subject);
          setBody(json.draft.body);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function persistDraft() {
    if (!data || data.locked) return;
    const res = await fetch(`/api/commercial/requests/${requestId}/proceed`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proceedId: data.proceed.id,
        subject,
        body,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Could not save draft");
  }

  async function sendProceed() {
    if (!data) return;
    setBusy(true);
    setError(null);
    setSendMessage(null);
    try {
      await persistDraft();
      const res = await fetch(
        `/api/commercial/requests/${requestId}/proceed/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proceedId: data.proceed.id,
            subject,
            body,
          }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        request?: { status: string };
        proceed?: ProceedPayload["proceed"];
      };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      setSendMessage(json.message ?? "Proceed request sent.");
      setData((prev) =>
        prev && json.proceed
          ? {
              ...prev,
              locked: true,
              proceed: json.proceed,
              request: {
                ...prev.request,
                status: json.request?.status ?? "AWAITING_CONFIRMATION",
              },
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CommercialShell title="Request to Proceed">
        <p className="text-sm text-slate-400">Preparing proceed review…</p>
      </CommercialShell>
    );
  }

  if (error && !data) {
    return (
      <CommercialShell title="Request to Proceed">
        <p className="text-sm text-rose-200">{error}</p>
        <Link
          href={`/commercial/requests/${requestId}/compare`}
          className="mt-3 inline-block text-sm text-teal-300"
        >
          Back to Compare Quotes
        </Link>
      </CommercialShell>
    );
  }

  if (!data) return null;

  const snap = data.proceed.snapshot;
  const canSend =
    !data.locked && ackPrice && ackNotBooking && ackExclusions && !busy;

  return (
    <CommercialShell
      title="Request to Proceed"
      subtitle="Review selected quote terms — this does not confirm a booking"
    >
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-400/25 bg-rose-950/40 px-4 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}
      {sendMessage ? (
        <p className="mb-4 rounded-xl border border-teal-400/25 bg-teal-950/40 px-4 py-2 text-xs text-teal-50">
          {sendMessage}
        </p>
      ) : null}

      {data.locked ? (
        <div className="mb-6 rounded-xl border border-teal-300/30 bg-teal-950/35 px-4 py-3 text-sm text-teal-50">
          Proceed Request Sent · Awaiting Broker Confirmation
          {data.proceed.sentAt
            ? ` · ${new Date(data.proceed.sentAt).toLocaleString()}`
            : ""}
        </div>
      ) : null}

      <CommercialSection title="Route">
        <p className="text-lg text-white">
          {data.request.origin?.name ?? "—"} →{" "}
          {data.request.destination?.name ?? "—"}
        </p>
      </CommercialSection>

      <CommercialSection title="Shipment">
        <p className="text-sm text-slate-300">
          Cargo: {data.request.cargo?.description ?? "—"}
          {data.request.cargo?.weightTons != null
            ? ` · ${data.request.cargo.weightTons.toLocaleString("en-US")} MT`
            : ""}
        </p>
        {data.request.requestedDeparture ? (
          <p className="mt-1 text-xs text-slate-500">
            Departure requirements: {data.request.requestedDeparture}
          </p>
        ) : null}
      </CommercialSection>

      <CommercialSection title="Selected Quote">
        <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Organization
            </dt>
            <dd className="text-white">{snap.organization}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Rate
            </dt>
            <dd>
              {snap.rate != null && snap.currency
                ? `${snap.currency} ${snap.rate}${snap.rateUnit ? ` / ${snap.rateUnit}` : ""}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Estimated freight
            </dt>
            <dd>
              {snap.estimatedFreight != null && snap.currency
                ? `${snap.currency} ${snap.estimatedFreight.toLocaleString("en-US")}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Departure / laycan
            </dt>
            <dd>{snap.departure ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Transit
            </dt>
            <dd>{snap.transit ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Validity
            </dt>
            <dd>{snap.validity ?? "Quote validity not specified."}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Vessel
            </dt>
            <dd>{snap.vesselName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Payment terms
            </dt>
            <dd>{snap.paymentTerms ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Included charges
            </dt>
            <dd>{snap.includedCharges ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
              Excluded charges
            </dt>
            <dd>{snap.excludedCharges ?? "—"}</dd>
          </div>
        </dl>
        <Link
          href={`/commercial/requests/${requestId}#msg-${data.sourceMessageId}`}
          className="mt-3 inline-block text-xs text-teal-300 underline"
        >
          View source
        </Link>
      </CommercialSection>

      {data.warnings.length ? (
        <CommercialSection title="Warnings">
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-100/80">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </CommercialSection>
      ) : null}

      <CommercialSection title="Recipient">
        <p className="text-sm text-white">{data.proceed.recipientOrganization}</p>
        <p className="text-xs text-slate-400">{data.proceed.recipientEmail}</p>
        {data.proceed.recipientFromInbound ? (
          <p className="mt-1 text-[11px] text-amber-100/80">
            Recipient resolved from broker reply sender
            {data.proceed.inboundSenderTrust
              ? ` · trust: ${data.proceed.inboundSenderTrust}`
              : ""}
            . Review carefully before send.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">
            Recipient from commercial directory contact.
          </p>
        )}
      </CommercialSection>

      {!data.locked ? (
        <CommercialSection title="Confirmations">
          <label className="mb-2 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackPrice}
              onChange={(e) => setAckPrice(e.target.checked)}
              className="mt-0.5"
            />
            I have reviewed the quoted price and commercial terms.
          </label>
          <label className="mb-2 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackNotBooking}
              onChange={(e) => setAckNotBooking(e.target.checked)}
              className="mt-0.5"
            />
            I understand this action requests the broker/carrier to proceed but
            does not confirm a booking.
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackExclusions}
              onChange={(e) => setAckExclusions(e.target.checked)}
              className="mt-0.5"
            />
            I have reviewed any exclusions or missing terms.
          </label>
        </CommercialSection>
      ) : null}

      <CommercialSection title="Proceed message">
        <label className="block text-[11px] text-slate-500">
          Subject
          <input
            value={subject}
            disabled={data.locked}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white disabled:opacity-60"
          />
        </label>
        <label className="mt-3 block text-[11px] text-slate-500">
          Body
          <textarea
            value={body}
            disabled={data.locked}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-slate-200 disabled:opacity-60"
          />
        </label>
      </CommercialSection>

      <div className="mb-8 flex flex-wrap gap-3">
        {!data.locked ? (
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendProceed()}
            className="rounded-full bg-teal-400/90 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Sending…" : "Request to Proceed"}
          </button>
        ) : null}
        <Link
          href={`/commercial/requests/${requestId}/compare`}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300"
        >
          Back to Compare Quotes
        </Link>
        <Link
          href={`/commercial/requests/${requestId}`}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300"
        >
          Request detail
        </Link>
      </div>
    </CommercialShell>
  );
}
