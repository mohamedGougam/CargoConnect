"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CommercialQuote, CommercialRequest } from "@/domain/commercial/types";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";
import { DemoOperatorControls } from "@/components/demo/DemoOperatorControls";

interface AuditRow {
  id: string;
  eventType: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface AttachmentRow {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

interface MessageRow {
  id: string;
  direction: "OUTBOUND" | "INBOUND";
  messageKind?: string | null;
  provider: string;
  providerMessageId?: string | null;
  fromAddress: string;
  fromName?: string | null;
  toAddress: string;
  replyTo: string;
  subject: string;
  bodySnapshot: string;
  deliveryStatus: string;
  senderTrust?: string | null;
  responseClassification?: string | null;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  attachments?: AttachmentRow[];
}

interface SelectionRow {
  id: string;
  commercialQuoteId: string;
  selectedAt: string;
  lockedAt?: string | null;
  active: boolean;
}

interface ProceedRow {
  id: string;
  status: string;
  commercialQuoteId: string;
  sentAt?: string | null;
  recipientEmail: string;
  recipientOrganization: string;
}

export function RequestDetailView({ id }: { id: string }) {
  const [request, setRequest] = useState<CommercialRequest | null>(null);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [quotes, setQuotes] = useState<CommercialQuote[]>([]);
  const [selection, setSelection] = useState<SelectionRow | null>(null);
  const [proceed, setProceed] = useState<ProceedRow | null>(null);
  const [confirmation, setConfirmation] = useState<{
    id: string;
    classification: string;
    termsChanged: boolean;
  } | null>(null);
  const [booking, setBooking] = useState<{
    id: string;
    bookingReference: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/commercial/requests/${id}`)
      .then(async (r) => {
        const data = (await r.json()) as {
          request?: CommercialRequest;
          audits?: AuditRow[];
          messages?: MessageRow[];
          quotes?: CommercialQuote[];
          selection?: SelectionRow | null;
          proceed?: ProceedRow | null;
          confirmation?: {
            id: string;
            classification: string;
            termsChanged: boolean;
          } | null;
          booking?: { id: string; bookingReference: string } | null;
          error?: string;
        };
        if (!r.ok) throw new Error(data.error ?? "Failed to load");
        setRequest(data.request ?? null);
        setAudits(data.audits ?? []);
        setMessages(data.messages ?? []);
        setQuotes(data.quotes ?? []);
        setSelection(data.selection ?? null);
        setProceed(data.proceed ?? null);
        setConfirmation(data.confirmation ?? null);
        setBooking(data.booking ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <CommercialShell title="Request">
        <p className="text-sm text-slate-400">Loading…</p>
      </CommercialShell>
    );
  }

  if (error || !request) {
    return (
      <CommercialShell title="Request">
        <p className="text-sm text-rose-200">{error ?? "Not found"}</p>
        <Link href="/commercial/requests" className="mt-3 inline-block text-sm text-teal-300">
          Back to My Requests
        </Link>
      </CommercialShell>
    );
  }

  const latestQuote =
    [...quotes].reverse().find((q) => q.isLatest !== false) ?? quotes.at(-1);
  const hasNewResponse = request.status === "RESPONSE_RECEIVED";
  const inboundCount = messages.filter((m) => m.direction === "INBOUND").length;
  const quoteCount = quotes.filter(
    (q) =>
      q.responseClassification === "QUOTE" ||
      q.freightRate != null ||
      q.totalPrice != null,
  ).length;
  const comparableHint = quotes.filter(
    (q) =>
      (q.currency ?? "").toUpperCase() === "USD" &&
      (q.freightRate != null || q.totalPrice != null),
  ).length;

  const timeline = buildTimeline({
    request,
    audits,
    selection,
    proceed,
    confirmation,
    booking,
    inboundCount,
    quoteCount,
  });

  return (
    <CommercialShell
      title="Request detail"
      subtitle={`${request.type} · ${statusLabel(request.status)}`}
    >
      <DemoOperatorControls variant="request" requestId={id} />
      {hasNewResponse ? (
        <div className="mb-6 rounded-xl border border-teal-300/30 bg-teal-950/35 px-4 py-3 text-sm text-teal-50">
          New response received
        </div>
      ) : null}

      {request.status === "AWAITING_CONFIRMATION" ? (
        <div className="mb-6 rounded-xl border border-teal-300/30 bg-teal-950/35 px-4 py-3 text-sm text-teal-50">
          Proceed Request Sent · Awaiting Broker Confirmation
        </div>
      ) : null}

      {request.status === "CONFIRMATION_REVIEW_REQUIRED" ||
      request.status === "TERMS_CHANGED" ||
      request.status === "CONFIRMATION_REJECTED" ||
      request.status === "MORE_INFORMATION_REQUIRED" ||
      request.status === "CONFIRMATION_RECEIVED" ? (
        <div className="mb-6 rounded-xl border border-teal-300/30 bg-teal-950/35 px-4 py-3 text-sm text-teal-50">
          {request.status === "TERMS_CHANGED"
            ? "Terms Changed — review broker confirmation"
            : request.status === "CONFIRMATION_REJECTED"
              ? "Broker Rejected Proceed Request"
              : request.status === "MORE_INFORMATION_REQUIRED"
                ? "More Information Required"
                : "Potential Confirmation Received"}
          <Link
            href={`/commercial/requests/${id}/confirmation`}
            className="mt-2 block text-xs font-semibold text-teal-100 underline"
          >
            Review confirmation
          </Link>
        </div>
      ) : null}

      {request.status === "COMMERCIALLY_CONFIRMED" && booking ? (
        <div className="mb-6 rounded-xl border border-teal-300/30 bg-teal-950/35 px-4 py-3 text-sm text-teal-50">
          Commercially Confirmed · Booking {booking.bookingReference}
          <Link
            href={`/commercial/bookings/${booking.id}`}
            className="mt-2 block text-xs font-semibold text-teal-100 underline"
          >
            View booking
          </Link>
        </div>
      ) : null}

      <CommercialSection title="Commercial progress">
        <ol className="space-y-2 text-sm text-slate-300">
          {timeline.map((step) => (
            <li
              key={step.label}
              className={`flex flex-wrap items-baseline gap-2 ${
                step.done ? "text-slate-200" : "text-slate-500"
              }`}
            >
              <span className={step.active ? "text-teal-200" : undefined}>
                {step.done ? "●" : "○"} {step.label}
              </span>
              {step.at ? (
                <span className="text-[11px] text-slate-500">
                  {new Date(step.at).toLocaleString()}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </CommercialSection>

      <CommercialSection title="Response summary">
        <p className="text-sm text-slate-300">
          Responses: {inboundCount} · Quotes detected: {quoteCount}
          {dataLatest(messages) ? ` · Latest response: ${dataLatest(messages)}` : ""}
        </p>
        {comparableHint >= 2 ? (
          <p className="mt-1 text-xs text-slate-500">
            Multiple quotes available for comparison.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {quoteCount > 0 ? (
            <Link
              href={`/commercial/requests/${id}/compare`}
              className="inline-flex rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950"
            >
              Compare Quotes
            </Link>
          ) : null}
          {selection &&
          !selection.lockedAt &&
          request.status !== "AWAITING_CONFIRMATION" ? (
            <Link
              href={`/commercial/requests/${id}/proceed`}
              className="inline-flex rounded-full border border-teal-300/40 px-4 py-2 text-xs font-semibold text-teal-100"
            >
              Review / Request to Proceed
            </Link>
          ) : null}
          {request.status === "AWAITING_CONFIRMATION" ||
          proceed?.status === "SENT" ||
          proceed?.status === "DELIVERY_SIMULATED" ? (
            <Link
              href={`/commercial/requests/${id}/proceed`}
              className="inline-flex text-xs text-teal-300 underline"
            >
              View proceed request
            </Link>
          ) : null}
        </div>
      </CommercialSection>

      <CommercialSection title="Summary">
        <p className="font-[family-name:var(--font-fraunces)] text-2xl text-white">
          {request.origin?.name ?? "—"} → {request.destination?.name ?? "—"}
        </p>
        <p className="mt-2 text-xs text-slate-500">Reference: {request.id}</p>
        <p className="mt-1 text-xs text-slate-500">
          Created {new Date(request.createdAt).toLocaleString()}
          {request.sentAt
            ? ` · RFQ sent ${new Date(request.sentAt).toLocaleString()}`
            : ""}
        </p>
      </CommercialSection>

      <CommercialSection title="Shipment">
        <p className="text-sm text-slate-300">
          Cargo: {request.cargo.description ?? "—"}
          {request.cargo.weightTons != null
            ? ` · ${request.cargo.weightTons.toLocaleString("en-US")} t`
            : ""}
        </p>
      </CommercialSection>

      <CommercialSection title="Recipient">
        <p className="text-sm text-white">
          {proceed?.recipientOrganization ??
            request.recipient?.organizationName ??
            "—"}
        </p>
        <p className="text-xs text-slate-500">
          {proceed?.recipientEmail ??
            request.recipient?.email ??
            "Email unavailable"}
        </p>
      </CommercialSection>

      {selection ? (
        <CommercialSection title="Selected Quote">
          <p className="text-sm text-teal-100">
            Quote {selection.commercialQuoteId.slice(0, 12)}…
            {selection.lockedAt ? " · locked after proceed send" : " · SELECTED"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Selected {new Date(selection.selectedAt).toLocaleString()}
          </p>
        </CommercialSection>
      ) : null}

      {latestQuote ? (
        <CommercialSection title="Quote summary">
          <p className="mb-1 text-[10px] tracking-wide text-slate-500 uppercase">
            CargoConnect extracted — not a substitute for the original broker email
          </p>
          {latestQuote.freightRate != null ? (
            <div className="space-y-1.5 text-sm text-slate-200">
              <p className="font-medium text-white">Quote received</p>
              <p>{request.recipient?.organizationName}</p>
              {(latestQuote.origin || latestQuote.destination) && (
                <p className="text-xs text-slate-400">
                  {latestQuote.origin ?? request.origin?.name} →{" "}
                  {latestQuote.destination ?? request.destination?.name}
                </p>
              )}
              <p>
                Freight rate{" "}
                <strong>
                  {latestQuote.currency ?? ""} {latestQuote.freightRate}
                  {latestQuote.rateUnit ? ` / ${latestQuote.rateUnit}` : ""}
                </strong>
              </p>
              {latestQuote.estimatedDeparture ? (
                <p>Estimated departure {latestQuote.estimatedDeparture}</p>
              ) : null}
              {latestQuote.transitTime ? (
                <p>Transit {latestQuote.transitTime}</p>
              ) : null}
              {latestQuote.validityUntil ? (
                <p>Valid until {latestQuote.validityUntil}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-300">
              Broker response received — no structured freight rate detected.
            </p>
          )}
          {latestQuote.responseClassification ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Classification: {latestQuote.responseClassification}
            </p>
          ) : null}
        </CommercialSection>
      ) : null}

      <CommercialSection title="Conversation">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">No email correspondence yet.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const when = m.receivedAt ?? m.sentAt ?? m.createdAt;
              const party =
                m.direction === "OUTBOUND"
                  ? "CargoConnect / User"
                  : m.fromName || m.fromAddress;
              const expanded = expandedMessageId === m.id;
              return (
                <li
                  key={m.id}
                  id={`msg-${m.id}`}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">{party}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(when).toLocaleString()} · {m.direction}
                        {m.messageKind ? ` · ${m.messageKind}` : ""}
                        {m.senderTrust ? ` · ${m.senderTrust}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] tracking-wide text-slate-500 uppercase">
                      {m.deliveryStatus}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{m.subject}</p>
                  {expanded ? (
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                      {m.bodySnapshot || "(empty body)"}
                    </pre>
                  ) : (
                    <p className="mt-2 line-clamp-3 text-xs text-slate-400">
                      {m.bodySnapshot.slice(0, 280)}
                      {m.bodySnapshot.length > 280 ? "…" : ""}
                    </p>
                  )}
                  {m.attachments && m.attachments.length > 0 ? (
                    <ul className="mt-2 text-[11px] text-slate-400">
                      {m.attachments.map((a) => (
                        <li key={a.id}>
                          Attachment: {a.filename} ({a.contentType})
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedMessageId(expanded ? null : m.id)
                    }
                    className="mt-2 text-[11px] text-teal-300 underline"
                  >
                    {expanded ? "Collapse" : "View original response"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CommercialSection>

      <CommercialSection title="Message draft">
        <p className="text-sm font-medium text-white">
          {request.aiDraft?.subject ?? "—"}
        </p>
        <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
          {request.aiDraft?.body ?? "—"}
        </pre>
      </CommercialSection>

      <CommercialSection title="Audit history">
        <ul className="space-y-1.5 text-xs text-slate-400">
          {audits.map((a) => (
            <li key={a.id}>
              <span className="text-slate-200">{a.eventType}</span> ·{" "}
              {new Date(a.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </CommercialSection>

      <Link href="/commercial/requests" className="text-sm text-teal-300">
        ← My Requests
      </Link>
    </CommercialShell>
  );
}

function dataLatest(messages: MessageRow[]): string | null {
  const inbound = messages.filter((m) => m.direction === "INBOUND");
  const latest = inbound
    .map((m) => m.receivedAt ?? m.createdAt)
    .sort()
    .at(-1);
  return latest ? new Date(latest).toLocaleString() : null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "AWAITING_CONFIRMATION":
      return "Awaiting Broker Confirmation";
    case "CONFIRMATION_REVIEW_REQUIRED":
      return "Confirmation Review Required";
    case "COMMERCIALLY_CONFIRMED":
      return "Commercially Confirmed";
    case "CONFIRMATION_REJECTED":
      return "Proceed Rejected";
    case "MORE_INFORMATION_REQUIRED":
      return "More Information Required";
    case "TERMS_CHANGED":
      return "Terms Changed";
    case "QUOTE_SELECTED":
      return "Quote Selected";
    case "PROCEED_READY_TO_SEND":
      return "Proceed Ready";
    case "PROCEED_SEND_FAILED":
      return "Proceed Send Failed";
    default:
      return status;
  }
}

function buildTimeline(input: {
  request: CommercialRequest;
  audits: AuditRow[];
  selection: SelectionRow | null;
  proceed: ProceedRow | null;
  confirmation: { id: string; classification: string; termsChanged: boolean } | null;
  booking: { id: string; bookingReference: string } | null;
  inboundCount: number;
  quoteCount: number;
}): Array<{ label: string; done: boolean; active: boolean; at?: string | null }> {
  const auditAt = (type: string) =>
    input.audits.find((a) => a.eventType === type)?.createdAt ?? null;

  const rfqSent =
    Boolean(input.request.sentAt) ||
    [
      "SENT",
      "DELIVERY_SIMULATED",
      "RESPONSE_RECEIVED",
      "QUOTE_SELECTED",
      "PROCEED_READY_TO_SEND",
      "PROCEED_SENDING",
      "AWAITING_CONFIRMATION",
      "PROCEED_SEND_FAILED",
      "CONFIRMATION_RECEIVED",
      "CONFIRMATION_REVIEW_REQUIRED",
      "COMMERCIALLY_CONFIRMED",
      "CONFIRMATION_REJECTED",
      "MORE_INFORMATION_REQUIRED",
      "TERMS_CHANGED",
    ].includes(input.request.status);
  const responses =
    input.inboundCount > 0 ||
    input.request.status === "RESPONSE_RECEIVED" ||
    input.quoteCount > 0;
  const compared =
    Boolean(auditAt("QUOTE_COMPARISON_VIEWED")) || input.quoteCount > 0;
  const selected = Boolean(input.selection);
  const proceedSent =
    input.request.status === "AWAITING_CONFIRMATION" ||
    input.proceed?.status === "SENT" ||
    input.proceed?.status === "DELIVERY_SIMULATED" ||
    Boolean(input.confirmation) ||
    input.request.status === "COMMERCIALLY_CONFIRMED";
  const awaiting = input.request.status === "AWAITING_CONFIRMATION";
  const confReceived = Boolean(input.confirmation) ||
    [
      "CONFIRMATION_RECEIVED",
      "CONFIRMATION_REVIEW_REQUIRED",
      "COMMERCIALLY_CONFIRMED",
      "CONFIRMATION_REJECTED",
      "MORE_INFORMATION_REQUIRED",
      "TERMS_CHANGED",
    ].includes(input.request.status);
  const commerciallyConfirmed =
    input.request.status === "COMMERCIALLY_CONFIRMED" || Boolean(input.booking);

  return [
    {
      label: "RFQ sent",
      done: rfqSent,
      active:
        input.request.status === "SENT" ||
        input.request.status === "DELIVERY_SIMULATED",
      at: input.request.sentAt,
    },
    {
      label: "Responses received",
      done: responses,
      active: input.request.status === "RESPONSE_RECEIVED",
      at: auditAt("COMMERCIAL_RESPONSE_RECEIVED"),
    },
    {
      label: "Quotes compared",
      done: compared,
      active: false,
      at: auditAt("QUOTE_COMPARISON_VIEWED"),
    },
    {
      label: "Quote selected",
      done: selected,
      active: input.request.status === "QUOTE_SELECTED",
      at: input.selection?.selectedAt,
    },
    {
      label: "Proceed request sent",
      done: proceedSent,
      active: input.request.status === "PROCEED_SENDING",
      at: input.proceed?.sentAt ?? auditAt("PROCEED_SENT"),
    },
    {
      label: "Awaiting confirmation",
      done: awaiting || confReceived,
      active: awaiting,
      at: awaiting ? input.proceed?.sentAt : null,
    },
    {
      label: "Broker confirmation received",
      done: confReceived,
      active:
        input.request.status === "CONFIRMATION_REVIEW_REQUIRED" ||
        input.request.status === "TERMS_CHANGED",
      at: auditAt("PROCEED_CONFIRMATION_RECEIVED"),
    },
    {
      label: input.booking
        ? `Commercially confirmed · ${input.booking.bookingReference}`
        : "Commercially confirmed",
      done: commerciallyConfirmed,
      active: commerciallyConfirmed,
      at: auditAt("COMMERCIAL_AGREEMENT_CONFIRMED"),
    },
  ];
}
