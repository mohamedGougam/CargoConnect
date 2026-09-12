"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";

type Preference =
  | "best_overall"
  | "lowest_cost"
  | "fastest_transit"
  | "earliest_departure"
  | "custom";

interface CompareQuoteRow {
  quoteId: string;
  organization: string;
  currency: string | null;
  rate: number | null;
  rateUnit: string;
  estimatedFreightAmount: number | null;
  estimatedFreightLabel: string;
  normalizedTotal: number | null;
  normalizedCurrency: string | null;
  priceComparable: boolean;
  estimatedDeparture: string | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  validityUntil: string | null;
  expiryState: string;
  vesselName: string | null;
  vesselType: string | null;
  includedCharges: string[];
  excludedCharges: string[];
  paymentTerms: string | null;
  completenessScore: number;
  confidenceLabel: string;
  extractionConfidence: number;
  warnings: string[];
  score: number | null;
  rank: number | null;
  sourceMessageId: string;
  version: number;
  isLatest: boolean;
  hasManualCorrections: boolean;
  fxApplied: boolean;
  selected?: boolean;
}

interface ComparePayload {
  request: {
    id: string;
    status?: string;
    origin?: string;
    destination?: string;
    cargo?: { weightTons?: number; description?: string };
  };
  selection: {
    id: string;
    quoteId: string;
    selectedAt: string;
    locked: boolean;
  } | null;
  stats: {
    responses: number;
    quotes: number;
    comparablePrices: number;
    latestResponseAt: string | null;
  };
  preference: Preference;
  summaryNotes: string[];
  recommendation: {
    quoteId: string;
    organization: string;
    why: string[];
    tradeoffs: string[];
  } | null;
  quotes: CompareQuoteRow[];
}

export function CompareQuotesView({ requestId }: { requestId: string }) {
  const [preference, setPreference] = useState<Preference>("best_overall");
  const [data, setData] = useState<ComparePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [selectBusy, setSelectBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(
          `/api/commercial/requests/${requestId}/compare?preference=${preference}`,
        );
        const json = (await res.json()) as ComparePayload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load comparison");
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [requestId, preference]);

  async function reload() {
    const res = await fetch(
      `/api/commercial/requests/${requestId}/compare?preference=${preference}`,
    );
    const json = (await res.json()) as ComparePayload & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load comparison");
    setData(json);
  }

  async function saveCorrection(quoteId: string) {
    setEditBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (editRate.trim()) patch.freightRate = Number(editRate);
      if (editCurrency.trim()) patch.currency = editCurrency.trim().toUpperCase();
      const res = await fetch(`/api/commercial/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Correction failed");
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setEditBusy(false);
    }
  }

  async function selectQuote(quoteId: string) {
    setSelectBusy(quoteId);
    setError(null);
    try {
      const res = await fetch(`/api/commercial/requests/${requestId}/select-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          preferenceSnapshot: preference,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not select quote");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select quote");
    } finally {
      setSelectBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <CommercialShell title="Compare quotes">
        <p className="text-sm text-slate-400">Loading comparison…</p>
      </CommercialShell>
    );
  }

  if (error && !data) {
    return (
      <CommercialShell title="Compare quotes">
        <p className="text-sm text-rose-200">{error}</p>
        <Link href={`/commercial/requests/${requestId}`} className="mt-3 inline-block text-sm text-teal-300">
          Back to request
        </Link>
      </CommercialShell>
    );
  }

  if (!data) return null;

  return (
    <CommercialShell
      title="Compare quotes"
      subtitle={`${data.request.origin ?? "—"} → ${data.request.destination ?? "—"} · based on available quote data`}
    >
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-400/25 bg-rose-950/40 px-4 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}

      <CommercialSection title="Decision preference">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["best_overall", "Best overall"],
              ["lowest_cost", "Lowest cost"],
              ["fastest_transit", "Fastest transit"],
              ["earliest_departure", "Earliest departure"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreference(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                preference === value
                  ? "bg-teal-400/90 text-slate-950"
                  : "border border-white/15 text-slate-300 hover:border-white/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Ranking is deterministic. CargoConnect does not invent missing commercial terms.
        </p>
      </CommercialSection>

      <CommercialSection title="Summary">
        <p className="text-sm text-slate-300">
          Responses: {data.stats.responses} · Quotes: {data.stats.quotes} · Comparable
          prices: {data.stats.comparablePrices}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {data.summaryNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </CommercialSection>

      {data.recommendation ? (
        <CommercialSection
          title={
            preference === "lowest_cost"
              ? "Lowest cost match"
              : preference === "fastest_transit"
                ? "Fastest transit match"
                : preference === "earliest_departure"
                  ? "Earliest departure match"
                  : "Best overall match"
          }
        >
          <p className="text-lg text-white">{data.recommendation.organization}</p>
          <p className="mt-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Why
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {data.recommendation.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {data.recommendation.tradeoffs.length ? (
            <>
              <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                Trade-off
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-400">
                {data.recommendation.tradeoffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          ) : null}
        </CommercialSection>
      ) : (
        <CommercialSection title="Recommendation">
          <p className="text-sm text-slate-400">
            No recommendation — insufficient comparable quote data.
          </p>
        </CommercialSection>
      )}

      {data.selection ? (
        <CommercialSection title="Selected Quote">
          <p className="text-sm text-teal-100">
            One quote is SELECTED
            {data.selection.locked ? " · selection locked after proceed send" : ""}.
          </p>
          {!data.selection.locked ? (
            <Link
              href={`/commercial/requests/${requestId}/proceed`}
              className="mt-3 inline-flex rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950"
            >
              Review / Request to Proceed
            </Link>
          ) : (
            <Link
              href={`/commercial/requests/${requestId}/proceed`}
              className="mt-3 inline-flex text-xs text-teal-300 underline"
            >
              View proceed request
            </Link>
          )}
        </CommercialSection>
      ) : null}

      {/* Desktop table */}
      <div className="mb-8 hidden overflow-x-auto lg:block">
        <CommercialSection title="Side-by-side comparison">
          <table className="w-full min-w-[900px] border-collapse text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-white/10 text-[10px] tracking-wide text-slate-500 uppercase">
                <th className="py-2 pr-3 font-medium">Field</th>
                {data.quotes.map((q) => (
                  <th key={q.quoteId} className="px-2 py-2 font-medium">
                    {q.organization}
                    {q.selected ? " · SELECTED" : ""}
                    {q.rank ? ` · #${q.rank}` : ""}
                    {q.expiryState === "expired" ? " · expired" : ""}
                    {!q.isLatest ? " · previous version" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderRows(data.quotes)}
              <tr className="border-b border-white/5 align-top">
                <td className="py-2.5 pr-3 text-slate-500">Action</td>
                {data.quotes.map((q) => (
                  <td key={q.quoteId} className="px-2 py-2.5">
                    <SelectQuoteButton
                      quote={q}
                      busy={selectBusy === q.quoteId}
                      locked={Boolean(data.selection?.locked)}
                      onSelect={() => void selectQuote(q.quoteId)}
                      proceedHref={`/commercial/requests/${requestId}/proceed`}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CommercialSection>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-teal-300/85 uppercase">
          Quote cards
        </h2>
        {data.quotes.map((q) => (
          <article
            key={q.quoteId}
            className={`rounded-2xl border px-4 py-4 ${
              q.selected
                ? "border-teal-400/40 bg-teal-950/30"
                : q.expiryState === "expired"
                  ? "border-white/5 bg-black/10 opacity-60"
                  : "border-white/10 bg-[rgba(12,20,32,0.65)]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-white">
                {q.organization}
                {q.selected ? (
                  <span className="ml-2 text-[10px] tracking-wide text-teal-200 uppercase">
                    Selected
                  </span>
                ) : null}
              </p>
              {q.rank ? (
                <span className="text-[10px] text-teal-200">Rank {q.rank}</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-200">
              {formatPrice(q)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Departure {q.estimatedDeparture ?? "—"} · Transit{" "}
              {formatTransit(q)} · Valid {q.validityUntil ?? "—"}
            </p>
            {q.excludedCharges.length ? (
              <p className="mt-1 text-xs text-amber-200/80">
                Exclusions: {q.excludedCharges.join(", ")}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-500">
              Completeness {(q.completenessScore * 100).toFixed(0)}% · Extraction{" "}
              {q.confidenceLabel}
            </p>
            {!q.priceComparable ? (
              <p className="mt-1 text-[11px] text-amber-100/70">
                Not directly price-comparable
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SelectQuoteButton
                quote={q}
                busy={selectBusy === q.quoteId}
                locked={Boolean(data.selection?.locked)}
                onSelect={() => void selectQuote(q.quoteId)}
                proceedHref={`/commercial/requests/${requestId}/proceed`}
              />
              <Link
                href={`/commercial/requests/${requestId}#msg-${q.sourceMessageId}`}
                className="text-[11px] text-teal-300 underline"
              >
                View original response
              </Link>
              <button
                type="button"
                className="text-[11px] text-slate-400 underline"
                onClick={() => {
                  setEditingId(q.quoteId);
                  setEditRate(q.rate != null ? String(q.rate) : "");
                  setEditCurrency(q.currency ?? "");
                }}
              >
                Correct extracted fields
              </button>
            </div>
            {editingId === q.quoteId ? (
              <CorrectionForm
                editRate={editRate}
                editCurrency={editCurrency}
                busy={editBusy}
                onRate={setEditRate}
                onCurrency={setEditCurrency}
                onSave={() => void saveCorrection(q.quoteId)}
                onCancel={() => setEditingId(null)}
              />
            ) : null}
          </article>
        ))}
      </div>

      {/* Desktop correction + source links */}
      <CommercialSection title="Provenance & corrections">
        <ul className="space-y-3 text-xs text-slate-400">
          {data.quotes.map((q) => (
            <li key={q.quoteId} className="rounded-lg border border-white/8 px-3 py-2">
              <p className="text-slate-200">
                {q.organization}
                {q.hasManualCorrections ? " · manually reviewed" : ""}
                {q.version > 1 ? ` · v${q.version}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-3">
                <Link
                  href={`/commercial/requests/${requestId}#msg-${q.sourceMessageId}`}
                  className="text-teal-300 underline"
                >
                  Source / original response
                </Link>
                <button
                  type="button"
                  className="text-slate-400 underline"
                  onClick={() => {
                    setEditingId(q.quoteId);
                    setEditRate(q.rate != null ? String(q.rate) : "");
                    setEditCurrency(q.currency ?? "");
                  }}
                >
                  Correct rate/currency
                </button>
              </div>
              {editingId === q.quoteId ? (
                <CorrectionForm
                  editRate={editRate}
                  editCurrency={editCurrency}
                  busy={editBusy}
                  onRate={setEditRate}
                  onCurrency={setEditCurrency}
                  onSave={() => void saveCorrection(q.quoteId)}
                  onCancel={() => setEditingId(null)}
                />
              ) : null}
              {q.warnings.length ? (
                <ul className="mt-2 list-disc pl-4 text-amber-100/70">
                  {q.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </CommercialSection>

      <Link
        href={`/commercial/requests/${requestId}`}
        className="text-sm text-teal-300"
      >
        ← Back to request
      </Link>
    </CommercialShell>
  );
}

function SelectQuoteButton({
  quote,
  busy,
  locked,
  onSelect,
  proceedHref,
}: {
  quote: CompareQuoteRow;
  busy: boolean;
  locked: boolean;
  onSelect: () => void;
  proceedHref: string;
}) {
  if (quote.selected) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold tracking-wide text-teal-200 uppercase">
          Selected
        </span>
        {!locked ? (
          <Link href={proceedHref} className="text-[11px] text-teal-300 underline">
            Review / Request to Proceed
          </Link>
        ) : null}
      </div>
    );
  }

  if (quote.expiryState === "expired") {
    return (
      <span className="text-[11px] text-slate-500" title="Quote expired">
        Quote expired
      </span>
    );
  }

  if (!quote.isLatest) {
    return (
      <span className="text-[11px] text-slate-500">
        Previous version — not selectable
      </span>
    );
  }

  if (locked) {
    return <span className="text-[11px] text-slate-500">Selection locked</span>;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSelect}
      className="rounded-full bg-teal-400/90 px-3 py-1.5 text-[11px] font-semibold text-slate-950 disabled:opacity-50"
    >
      {busy ? "Selecting…" : "Select This Quote"}
    </button>
  );
}

function CorrectionForm({
  editRate,
  editCurrency,
  busy,
  onRate,
  onCurrency,
  onSave,
  onCancel,
}: {
  editRate: string;
  editCurrency: string;
  busy: boolean;
  onRate: (v: string) => void;
  onCurrency: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-[11px] text-slate-500">
        Rate
        <input
          value={editRate}
          onChange={(e) => onRate(e.target.value)}
          className="mt-1 block w-24 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
        />
      </label>
      <label className="text-[11px] text-slate-500">
        Currency
        <input
          value={editCurrency}
          onChange={(e) => onCurrency(e.target.value)}
          className="mt-1 block w-20 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="rounded-full bg-teal-400/90 px-3 py-1 text-[11px] font-semibold text-slate-950 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save correction"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-slate-300"
      >
        Cancel
      </button>
    </div>
  );
}

function formatPrice(q: CompareQuoteRow): string {
  if (q.rate != null && q.rateUnit !== "LUMP_SUM" && q.rateUnit !== "UNKNOWN") {
    const est =
      q.estimatedFreightAmount != null
        ? ` · est. ${q.currency ?? ""} ${q.estimatedFreightAmount.toLocaleString("en-US")}`
        : "";
    return `${q.currency ?? ""} ${q.rate} / ${q.rateUnit}${est}`.trim();
  }
  if (q.estimatedFreightAmount != null) {
    return `${q.currency ?? ""} ${q.estimatedFreightAmount.toLocaleString("en-US")} lump sum`.trim();
  }
  return "No structured freight amount";
}

function formatTransit(q: CompareQuoteRow): string {
  if (q.transitDaysMin == null) return "—";
  if (q.transitDaysMax != null && q.transitDaysMax !== q.transitDaysMin) {
    return `${q.transitDaysMin}–${q.transitDaysMax} days`;
  }
  return `${q.transitDaysMin} days`;
}

function renderRows(quotes: CompareQuoteRow[]) {
  const rows: Array<{ label: string; cell: (q: CompareQuoteRow) => string }> = [
    {
      label: "Freight rate",
      cell: (q) =>
        q.rate != null
          ? `${q.currency ?? ""} ${q.rate}${q.rateUnit && q.rateUnit !== "LUMP_SUM" ? ` / ${q.rateUnit}` : ""}`
          : "—",
    },
    {
      label: "Estimated freight amount",
      cell: (q) =>
        q.estimatedFreightAmount != null
          ? `${q.currency ?? ""} ${q.estimatedFreightAmount.toLocaleString("en-US")}`
          : "—",
    },
    {
      label: "Currency",
      cell: (q) =>
        q.priceComparable
          ? q.currency ?? "—"
          : `${q.currency ?? "—"} (not directly comparable)`,
    },
    {
      label: "Departure / laycan",
      cell: (q) => q.estimatedDeparture ?? "—",
    },
    {
      label: "Transit",
      cell: (q) => formatTransit(q),
    },
    {
      label: "Vessel",
      cell: (q) => q.vesselName ?? "—",
    },
    {
      label: "Vessel type",
      cell: (q) => q.vesselType ?? "—",
    },
    {
      label: "Valid until",
      cell: (q) =>
        q.validityUntil
          ? `${q.validityUntil}${q.expiryState !== "unknown" ? ` (${q.expiryState})` : ""}`
          : "—",
    },
    {
      label: "Included charges",
      cell: (q) => q.includedCharges.join("; ") || "—",
    },
    {
      label: "Excluded charges",
      cell: (q) => q.excludedCharges.join("; ") || "—",
    },
    {
      label: "Payment terms",
      cell: (q) => q.paymentTerms ?? "—",
    },
    {
      label: "Completeness",
      cell: (q) => `${Math.round(q.completenessScore * 100)}%`,
    },
    {
      label: "Extraction confidence",
      cell: (q) => q.confidenceLabel,
    },
  ];

  return rows.map((row) => (
    <tr key={row.label} className="border-b border-white/5 align-top">
      <td className="py-2.5 pr-3 text-slate-500">{row.label}</td>
      {quotes.map((q) => (
        <td key={q.quoteId} className="px-2 py-2.5 text-slate-200">
          {row.cell(q)}
        </td>
      ))}
    </tr>
  ));
}
