"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";

interface ConfirmationPayload {
  request: {
    id: string;
    status: string;
    confirmationStatus?: string | null;
    origin?: string;
    destination?: string;
    cargo?: { description?: string; weightTons?: number };
    bookingId?: string | null;
  };
  confirmation: {
    id: string;
    classification: string;
    reviewStatus: string;
    termsChanged: boolean;
    confirmedByOrganization?: string | null;
    confirmedByEmail?: string | null;
    senderTrust?: string | null;
    bookingReference?: string | null;
    vesselName?: string | null;
    confirmedRate?: number | null;
    currency?: string | null;
    rateUnit?: string | null;
    departureText?: string | null;
    cargoQuantity?: number | null;
    excludedCharges?: string[];
    paymentTerms?: string | null;
    requiredDocuments?: string[];
    diffs: Array<{
      field: string;
      previousValue: string | null;
      confirmedValue: string | null;
      severity: string;
    }>;
    extractionConfidence: number;
    confidenceLabel: string;
    classificationReasons: string[];
  };
  proceed: {
    id: string;
    subject: string;
    body: string;
    snapshot: {
      rate?: number | null;
      currency?: string | null;
      rateUnit?: string | null;
      estimatedFreight?: number | null;
      departure?: string | null;
      transit?: string | null;
      excludedCharges?: string | null;
      vesselName?: string | null;
      organization: string;
    };
    sentAt?: string | null;
  } | null;
  sourceMessage: {
    id: string;
    fromAddress: string;
    fromName?: string | null;
    subject: string;
    bodySnapshot: string;
    senderTrust?: string | null;
    receivedAt: string;
  } | null;
  booking: {
    id: string;
    bookingReference: string;
    status: string;
    confirmedAt: string;
  } | null;
}

export function ConfirmationReviewView({ requestId }: { requestId: string }) {
  const [data, setData] = useState<ConfirmationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ackReview, setAckReview] = useState(false);
  const [ackMatch, setAckMatch] = useState(false);
  const [ackChangedReview, setAckChangedReview] = useState(false);
  const [ackChangedAgree, setAckChangedAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/commercial/requests/${requestId}/confirmation`,
        );
        const json = (await res.json()) as ConfirmationPayload & {
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load confirmation");
        if (!cancelled) {
          setData(json);
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

  async function acknowledge() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commercial/requests/${requestId}/confirmation/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmationId: data.confirmation.id,
            acknowledgedReview: ackReview,
            acknowledgedTermsMatch: ackMatch,
          }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        booking?: ConfirmationPayload["booking"];
        request?: { status: string; bookingId?: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Acknowledge failed");
      setMessage(json.message ?? "Commercially Confirmed");
      setData((prev) =>
        prev
          ? {
              ...prev,
              booking: json.booking ?? prev.booking,
              request: {
                ...prev.request,
                status: json.request?.status ?? "COMMERCIALLY_CONFIRMED",
                bookingId: json.booking?.id ?? prev.request.bookingId,
              },
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acknowledge failed");
    } finally {
      setBusy(false);
    }
  }

  async function acceptChanged() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commercial/requests/${requestId}/confirmation/accept-changed-terms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmationId: data.confirmation.id,
            acknowledgedReview: ackChangedReview,
            acknowledgedAgreement: ackChangedAgree,
          }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        booking?: ConfirmationPayload["booking"];
        request?: { status: string; bookingId?: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Accept failed");
      setMessage(json.message ?? "Changed terms accepted");
      setData((prev) =>
        prev
          ? {
              ...prev,
              booking: json.booking ?? prev.booking,
              confirmation: {
                ...prev.confirmation,
                reviewStatus: "ACKNOWLEDGED",
              },
              request: {
                ...prev.request,
                status: json.request?.status ?? "COMMERCIALLY_CONFIRMED",
                bookingId: json.booking?.id ?? prev.request.bookingId,
              },
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CommercialShell title="Confirmation review">
        <p className="text-sm text-slate-400">Loading confirmation…</p>
      </CommercialShell>
    );
  }

  if (error && !data) {
    return (
      <CommercialShell title="Confirmation review">
        <p className="text-sm text-rose-200">{error}</p>
        <Link
          href={`/commercial/requests/${requestId}`}
          className="mt-3 inline-block text-sm text-teal-300"
        >
          Back to request
        </Link>
      </CommercialShell>
    );
  }

  if (!data) return null;

  const c = data.confirmation;
  const snap = data.proceed?.snapshot;
  const clean =
    c.classification === "PROCEED_CONFIRMED" &&
    !c.termsChanged &&
    c.reviewStatus === "PENDING_REVIEW" &&
    !data.booking;
  const commerciallyConfirmed =
    data.request.status === "COMMERCIALLY_CONFIRMED" || Boolean(data.booking);

  return (
    <CommercialShell
      title="Confirmation review"
      subtitle="Original email is the source of truth — booking requires your acknowledgement"
    >
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-400/25 bg-rose-950/40 px-4 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-xl border border-teal-400/25 bg-teal-950/40 px-4 py-2 text-xs text-teal-50">
          {message}
        </p>
      ) : null}

      <div className="mb-6 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
        {headlineFor(c.classification, c.termsChanged)}
        {c.confidenceLabel === "Low" ? (
          <p className="mt-1 text-xs text-amber-100/80">
            Low extraction confidence — review the original email carefully.
          </p>
        ) : null}
      </div>

      <CommercialSection title="Confirmed by">
        <p className="text-sm text-white">
          {c.confirmedByOrganization ?? "—"}
        </p>
        <p className="text-xs text-slate-400">{c.confirmedByEmail ?? "—"}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Sender trust: {c.senderTrust ?? "UNKNOWN"}
          {c.senderTrust && c.senderTrust !== "EXPECTED_SENDER"
            ? " — unexpected sender; review carefully"
            : ""}
        </p>
      </CommercialSection>

      {data.proceed ? (
        <CommercialSection title="Original Proceed Request / Selected Quote Snapshot">
          <p className="text-xs text-slate-500">
            Proceed sent{" "}
            {data.proceed.sentAt
              ? new Date(data.proceed.sentAt).toLocaleString()
              : "—"}
          </p>
          <dl className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] text-slate-500 uppercase">Rate</dt>
              <dd>
                {snap?.rate != null
                  ? `${snap.currency ?? ""} ${snap.rate}${snap.rateUnit ? ` / ${snap.rateUnit}` : ""}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-slate-500 uppercase">
                Estimated freight
              </dt>
              <dd>
                {snap?.estimatedFreight != null
                  ? `${snap.currency ?? ""} ${snap.estimatedFreight.toLocaleString("en-US")}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-slate-500 uppercase">Laycan</dt>
              <dd>{snap?.departure ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-slate-500 uppercase">Transit</dt>
              <dd>{snap?.transit ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] text-slate-500 uppercase">Exclusions</dt>
              <dd>{snap?.excludedCharges ?? "—"}</dd>
            </div>
          </dl>
        </CommercialSection>
      ) : null}

      <CommercialSection title="Extracted Confirmation">
        <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] text-slate-500 uppercase">Rate</dt>
            <dd>
              {c.confirmedRate != null
                ? `${c.currency ?? ""} ${c.confirmedRate}${c.rateUnit ? ` / ${c.rateUnit}` : ""}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-slate-500 uppercase">Laycan</dt>
            <dd>{c.departureText ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-slate-500 uppercase">Vessel</dt>
            <dd>{c.vesselName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-slate-500 uppercase">
              External booking reference
            </dt>
            <dd>{c.bookingReference ?? "—"}</dd>
          </div>
        </dl>
        {c.classification === "PROCEED_CONFIRMED" && !c.termsChanged ? (
          <ul className="mt-3 space-y-1 text-xs text-teal-100/90">
            <li>✓ Route reviewed against request</li>
            {c.confirmedRate != null ? <li>✓ Rate extracted</li> : null}
            {c.cargoQuantity != null ? <li>✓ Quantity mentioned</li> : null}
            {c.departureText ? <li>✓ Laycan mentioned</li> : null}
            {c.vesselName ? <li>+ Vessel {c.vesselName}</li> : null}
            {c.bookingReference ? (
              <li>+ Booking reference {c.bookingReference}</li>
            ) : null}
          </ul>
        ) : null}
        <p className="mt-2 text-[11px] text-slate-500">
          Extraction confidence: {c.confidenceLabel} (
          {Math.round(c.extractionConfidence * 100)}%)
        </p>
      </CommercialSection>

      {c.diffs.length ? (
        <CommercialSection
          title={
            c.termsChanged ? "Broker proposed changes" : "Differences / additions"
          }
        >
          <ul className="space-y-2 text-xs text-slate-300">
            {c.diffs.map((d) => (
              <li
                key={`${d.field}-${d.confirmedValue}`}
                className="rounded-lg border border-white/10 px-3 py-2"
              >
                <p className="font-medium text-white">
                  {d.field}{" "}
                  <span className="text-[10px] text-amber-200/80">
                    {d.severity}
                  </span>
                </p>
                <p className="mt-1 text-slate-400">
                  Selected: {d.previousValue ?? "—"}
                </p>
                <p className="text-slate-200">
                  Broker confirmation: {d.confirmedValue ?? "—"}
                </p>
              </li>
            ))}
          </ul>
          {c.termsChanged ? (
            <p className="mt-3 text-xs text-amber-100/80">
              Material term changes require renewed approval. Booking is not
              created until you explicitly accept the revised terms.
            </p>
          ) : null}
        </CommercialSection>
      ) : null}

      {(c.termsChanged || c.classification === "TERMS_CHANGED") &&
      c.reviewStatus === "PENDING_REVIEW" &&
      !data.booking ? (
        <CommercialSection title="Accept Changed Terms">
          <label className="mb-2 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackChangedReview}
              onChange={(e) => setAckChangedReview(e.target.checked)}
              className="mt-0.5"
            />
            I have reviewed the changed commercial terms.
          </label>
          <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackChangedAgree}
              onChange={(e) => setAckChangedAgree(e.target.checked)}
              className="mt-0.5"
            />
            I agree to proceed based on the revised terms shown.
          </label>
          <button
            type="button"
            disabled={!ackChangedReview || !ackChangedAgree || busy}
            onClick={() => void acceptChanged()}
            className="rounded-full bg-teal-400/90 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {busy ? "Accepting…" : "Accept Changed Terms"}
          </button>
        </CommercialSection>
      ) : null}

      {c.classification === "PROCEED_REJECTED" ? (
        <CommercialSection title="Broker Rejected Proceed Request">
          <p className="text-sm text-slate-300">No booking will be created.</p>
          <Link
            href={`/commercial/requests/${requestId}/compare`}
            className="mt-3 inline-flex rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Return to Quotes
          </Link>
        </CommercialSection>
      ) : null}

      {c.classification === "MORE_INFORMATION_REQUIRED" ? (
        <CommercialSection title="More Information Required">
          <p className="text-sm text-slate-300">
            The broker asked for more information. Review the original email.
            Automatic reply is not sent.
          </p>
          {c.requiredDocuments?.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
              {c.requiredDocuments.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </CommercialSection>
      ) : null}

      <CommercialSection title="Original confirmation email">
        {data.sourceMessage ? (
          <>
            <p className="text-xs text-slate-500">
              {data.sourceMessage.fromName || data.sourceMessage.fromAddress} ·{" "}
              {new Date(data.sourceMessage.receivedAt).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-white">{data.sourceMessage.subject}</p>
            {showSource ? (
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
                {data.sourceMessage.bodySnapshot}
              </pre>
            ) : (
              <p className="mt-2 line-clamp-4 text-xs text-slate-400">
                {data.sourceMessage.bodySnapshot.slice(0, 320)}
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="mt-2 text-[11px] text-teal-300 underline"
            >
              {showSource
                ? "Collapse"
                : "View Original Confirmation Email"}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">Source message unavailable.</p>
        )}
      </CommercialSection>

      {clean ? (
        <CommercialSection title="Confirm Commercial Agreement">
          <label className="mb-2 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackReview}
              onChange={(e) => setAckReview(e.target.checked)}
              className="mt-0.5"
            />
            I have reviewed the broker/carrier confirmation.
          </label>
          <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackMatch}
              onChange={(e) => setAckMatch(e.target.checked)}
              className="mt-0.5"
            />
            I confirm that the commercial terms shown match what I intend to
            proceed with.
          </label>
          <button
            type="button"
            disabled={!ackReview || !ackMatch || busy}
            onClick={() => void acknowledge()}
            className="rounded-full bg-teal-400/90 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {busy ? "Confirming…" : "Confirm Commercial Agreement"}
          </button>
        </CommercialSection>
      ) : null}

      {commerciallyConfirmed && data.booking ? (
        <CommercialSection title="Commercially Confirmed">
          <p className="text-sm text-teal-100">
            Booking Reference: {data.booking.bookingReference}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Status: Commercially Confirmed ·{" "}
            {new Date(data.booking.confirmedAt).toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            This is not a payment or shipment execution status.
          </p>
          <Link
            href={`/commercial/bookings/${data.booking.id}`}
            className="mt-3 inline-flex text-sm text-teal-300 underline"
          >
            View booking
          </Link>
        </CommercialSection>
      ) : null}

      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          href={`/commercial/requests/${requestId}`}
          className="text-sm text-teal-300"
        >
          ← Request detail
        </Link>
        <Link
          href={`/commercial/requests/${requestId}/compare`}
          className="text-sm text-slate-400"
        >
          Compare Quotes
        </Link>
      </div>
    </CommercialShell>
  );
}

function headlineFor(classification: string, termsChanged: boolean): string {
  if (termsChanged || classification === "TERMS_CHANGED") {
    return "Terms Changed — Potential Confirmation with material differences";
  }
  switch (classification) {
    case "PROCEED_CONFIRMED":
      return "Potential Confirmation Received";
    case "PROCEED_REJECTED":
      return "Broker Rejected Proceed Request";
    case "MORE_INFORMATION_REQUIRED":
      return "More Information Required";
    default:
      return "Broker Reply Received";
  }
}
