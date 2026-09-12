"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CommercialSection,
  CommercialShell,
} from "@/components/commercial/CommercialShell";

interface EvidenceItem {
  id: string;
  type: string;
  sourceId?: string | null;
  title: string;
  occurredAt?: string | null;
  sourceLabel: string;
  factualSummary?: string | null;
  included: boolean;
  registerCode?: string | null;
}

/** In-app source links only — never public evidence URLs. */
function evidenceSourceHref(
  bookingId: string,
  item: EvidenceItem,
): string | null {
  switch (item.type) {
    case "EMAIL":
    case "AIS_OBSERVATION":
    case "MILESTONE":
      return `/commercial/bookings/${bookingId}/tracking`;
    case "EXCEPTION":
      return item.sourceId
        ? `/commercial/bookings/${bookingId}/tracking?exceptionId=${encodeURIComponent(item.sourceId)}`
        : `/commercial/bookings/${bookingId}/tracking`;
    case "DOCUMENT":
      return `/commercial/bookings/${bookingId}/documents`;
    case "HANDOFF":
      return `/commercial/bookings/${bookingId}/handoff`;
    case "BOOKING_SNAPSHOT":
    case "COMMERCIAL_SNAPSHOT":
      return `/commercial/bookings/${bookingId}`;
    default:
      return null;
  }
}

interface ClaimPayload {
  id: string;
  bookingId: string;
  reference: string;
  status: string;
  claimType: string;
  title: string;
  description?: string | null;
  version: number;
  timelineSnapshot: Array<{
    id: string;
    occurredAt: string;
    title: string;
    factualSummary: string;
    sourceLabel: string;
    conflictGroupId?: string | null;
  }>;
  durationFacts: Array<{
    id: string;
    displayLabel: string;
    elapsedLabel: string;
    startAt: string;
    endAt: string;
    note?: string | null;
  }>;
  missingEvidence: Array<{ id: string; label: string; reason: string }>;
  warnings: string[];
  claimedCurrency?: string | null;
  claimedAmount?: number | null;
  claimedAmountNote?: string | null;
  claimedAmountSource?: string | null;
  userNotes?: string | null;
  finalizedAt?: string | null;
  supersedesClaimPreparationId?: string | null;
}

export function ClaimDetailView({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [claim, setClaim] = useState<ClaimPayload | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ackReview, setAckReview] = useState(false);
  const [ackLiability, setAckLiability] = useState(false);
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  const [amountNote, setAmountNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/commercial/claims/${claimId}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          claim?: ClaimPayload;
          evidence?: EvidenceItem[];
          error?: string;
        };
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        if (cancelled) return;
        setClaim(json.claim ?? null);
        setEvidence(json.evidence ?? []);
        setNotes(json.claim?.userNotes ?? "");
        setCurrency(json.claim?.claimedCurrency ?? "EUR");
        setAmount(
          json.claim?.claimedAmount != null
            ? String(json.claim.claimedAmount)
            : "",
        );
        setAmountNote(json.claim?.claimedAmountNote ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commercial/claims/${claimId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        claim?: ClaimPayload;
        evidence?: EvidenceItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      if (json.claim) setClaim(json.claim);
      if (json.evidence) setEvidence(json.evidence);
      setMessage("Updated");
      if (body.action === "new_version" && json.claim) {
        router.push(`/commercial/claims/${json.claim.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CommercialShell title="Claim Preparation">
        <p className="text-sm text-slate-400">Loading…</p>
      </CommercialShell>
    );
  }
  if (error && !claim) {
    return (
      <CommercialShell title="Claim Preparation">
        <p className="text-sm text-rose-200">{error}</p>
      </CommercialShell>
    );
  }
  if (!claim) {
    return (
      <CommercialShell title="Claim Preparation">
        <p className="text-sm text-slate-400">Not found</p>
      </CommercialShell>
    );
  }

  const immutable =
    claim.status === "FINALIZED" || claim.status === "CLOSED";

  return (
    <CommercialShell
      title="Claim Preparation"
      subtitle={`${claim.reference} · v${claim.version} · ${claim.status}`}
    >
      <p className="mb-4 text-xs text-slate-500">
        CargoConnect prepares an evidence package. It does not determine
        contractual or legal liability.
      </p>
      {error ? <p className="mb-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="mb-2 text-sm text-teal-200">{message}</p> : null}

      <CommercialSection title="Claim">
        <p className="text-lg text-teal-100">{claim.title}</p>
        <p className="mt-1 text-sm text-slate-400">
          Type: {claim.claimType.replace(/_/g, " ")}
        </p>
        {claim.description ? (
          <p className="mt-2 text-sm text-slate-300">{claim.description}</p>
        ) : null}
      </CommercialSection>

      <CommercialSection title="Factual timeline">
        <ol className="space-y-2 text-sm text-slate-300">
          {claim.timelineSnapshot.map((t) => (
            <li key={t.id} className="border-l border-white/10 pl-3">
              <span className="text-xs text-slate-500">
                {new Date(t.occurredAt).toLocaleString()}
              </span>
              <p className="text-white">{t.title}</p>
              <p className="text-xs text-slate-400">
                {t.factualSummary} · Source: {t.sourceLabel}
              </p>
              {t.conflictGroupId ? (
                <p className="text-xs text-amber-100/80">
                  Part of a timing discrepancy group — conflicting values are
                  preserved.
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </CommercialSection>

      <CommercialSection title="Observed timing differences">
        {claim.durationFacts.length === 0 ? (
          <p className="text-sm text-slate-500">No elapsed-time calculations.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-300">
            {claim.durationFacts.map((d) => (
              <li key={d.id}>
                <span className="text-teal-100">{d.displayLabel}</span>:{" "}
                {d.elapsedLabel}
                <p className="text-xs text-slate-500">
                  {new Date(d.startAt).toLocaleString()} →{" "}
                  {new Date(d.endAt).toLocaleString()}
                </p>
                {d.note ? (
                  <p className="text-xs text-amber-100/70">{d.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CommercialSection>

      <CommercialSection title="Evidence">
        <ul className="space-y-2">
          {evidence.map((e) => {
            const sourceHref = evidenceSourceHref(claim.bookingId, e);
            return (
            <li
              key={e.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-white">
                  {e.registerCode ?? ""} {e.title}
                </p>
                <p className="text-xs text-slate-500">
                  {e.occurredAt
                    ? new Date(e.occurredAt).toLocaleString()
                    : "—"}{" "}
                  · {e.sourceLabel}
                </p>
                {e.factualSummary ? (
                  <p className="text-xs text-slate-400">{e.factualSummary}</p>
                ) : null}
                {sourceHref ? (
                  <Link
                    href={sourceHref}
                    className="mt-1 inline-block text-xs text-teal-200/90 underline-offset-2 hover:underline"
                  >
                    View Source
                  </Link>
                ) : null}
              </div>
              {!immutable ? (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={e.included}
                    disabled={busy}
                    onChange={(ev) =>
                      void action({
                        action: "set_evidence_included",
                        evidenceId: e.id,
                        included: ev.target.checked,
                      })
                    }
                  />
                  Include
                </label>
              ) : (
                <span className="text-xs text-slate-500">
                  {e.included ? "Included" : "Excluded"}
                </span>
              )}
            </li>
            );
          })}
        </ul>
      </CommercialSection>

      <CommercialSection title="Potential claim amount (user-supplied)">
        <p className="mb-2 text-xs text-slate-500">
          Optional. Entered by you — not calculated by CargoConnect.
        </p>
        {!immutable ? (
          <div className="flex flex-wrap gap-2">
            <input
              className="w-20 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="EUR"
            />
            <input
              className="w-32 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
            />
            <input
              className="min-w-[12rem] flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white"
              value={amountNote}
              onChange={(e) => setAmountNote(e.target.value)}
              placeholder="Basis / note"
            />
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-teal-100"
              onClick={() =>
                void action({
                  action: "update_amount",
                  currency: currency || null,
                  amount: amount ? Number(amount) : null,
                  note: amountNote || null,
                })
              }
            >
              Save amount
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-300">
            {claim.claimedAmount != null
              ? `${claim.claimedCurrency ?? ""} ${claim.claimedAmount}`.trim()
              : "Not entered"}
            {claim.claimedAmountNote
              ? ` — ${claim.claimedAmountNote}`
              : ""}
          </p>
        )}
      </CommercialSection>

      <CommercialSection title="Missing evidence">
        <ul className="space-y-2 text-sm text-slate-400">
          {claim.missingEvidence.map((m) => (
            <li key={m.id}>
              <span className="text-slate-200">{m.label}</span>
              <p className="text-xs">{m.reason}</p>
            </li>
          ))}
        </ul>
      </CommercialSection>

      <CommercialSection title="Warnings">
        <ul className="list-disc space-y-1 pl-4 text-xs text-amber-100/80">
          {claim.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </CommercialSection>

      <CommercialSection title="User notes">
        <p className="mb-2 text-xs text-slate-500">User-provided note</p>
        {!immutable ? (
          <>
            <textarea
              className="w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              className="mt-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-teal-100"
              onClick={() =>
                void action({ action: "update_notes", userNotes: notes })
              }
            >
              Save notes
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-300">{claim.userNotes || "—"}</p>
        )}
      </CommercialSection>

      {!immutable ? (
        <CommercialSection title="Finalize claim dossier">
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={ackReview}
              onChange={(e) => setAckReview(e.target.checked)}
            />
            I reviewed the factual timeline and evidence.
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={ackLiability}
              onChange={(e) => setAckLiability(e.target.checked)}
            />
            I understand CargoConnect is preparing an evidence package, not
            determining legal liability.
          </label>
          <button
            type="button"
            disabled={busy || !ackReview || !ackLiability}
            className="mt-4 rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
            onClick={() =>
              void action({
                action: "finalize",
                acknowledgedReview: ackReview,
                acknowledgedNoLiability: ackLiability,
              })
            }
          >
            Finalize Claim Dossier
          </button>
        </CommercialSection>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {claim.status === "FINALIZED" || claim.status === "CLOSED" ? (
          <a
            href={`/api/commercial/claims/${claim.id}/pdf`}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-teal-100"
          >
            Download PDF dossier
          </a>
        ) : null}
        {claim.status === "FINALIZED" ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-teal-100"
            onClick={() => void action({ action: "new_version" })}
          >
            Create New Version
          </button>
        ) : null}
        {claim.status !== "CLOSED" ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-300"
            onClick={() => void action({ action: "close" })}
          >
            Close Claim Preparation
          </button>
        ) : null}
      </div>

      <Link
        href={`/commercial/bookings/${claim.bookingId}`}
        className="mt-6 inline-block text-sm text-teal-300"
      >
        ← Booking
      </Link>
      <Link
        href="/commercial/claims"
        className="mt-6 ml-4 inline-block text-sm text-teal-300"
      >
        All claims
      </Link>
    </CommercialShell>
  );
}
