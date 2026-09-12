"use client";

import type { RouteSearchState } from "@/domain/search/types";
import { formatVesselType } from "@/lib/format";
import type { VesselType } from "@/domain/models";

interface RouteSearchSummaryProps {
  search: RouteSearchState;
  onClear: () => void;
}

/**
 * Compact route-search context — map stays dominant.
 */
export function RouteSearchSummary({ search, onClear }: RouteSearchSummaryProps) {
  if (search.status === "idle") return null;

  if (search.status === "loading") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[7.25rem] z-20 flex justify-center px-3 sm:top-[7.75rem]">
        <div className="rounded-2xl border border-teal-300/25 bg-[rgba(8,16,28,0.88)] px-4 py-2.5 text-[11px] text-teal-100/90 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <p className="font-medium tracking-tight">Framing corridor…</p>
          <p className="mt-0.5 text-[10px] text-teal-100/55">
            Resolving ports and highlighting corridor-relevant vessels
          </p>
        </div>
      </div>
    );
  }

  if (search.status === "error" || search.status === "ambiguous") {
    return (
      <div className="pointer-events-auto absolute inset-x-0 top-[7.25rem] z-20 flex justify-center px-3 sm:top-[7.75rem]">
        <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-amber-300/25 bg-[rgba(8,16,28,0.92)] px-4 py-3 text-[11px] text-amber-50 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-100/95">
              {search.status === "ambiguous"
                ? "Ambiguous ports"
                : "We couldn't resolve that route"}
            </p>
            <p className="mt-0.5 text-amber-100/70">{search.errorMessage}</p>
            {search.status === "ambiguous" ? (
              <AmbiguousHints search={search} />
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-slate-200 transition hover:border-white/30 hover:text-white"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  if (search.status !== "active" || !search.origin || !search.destination) {
    return null;
  }

  const typeLabels = Object.entries(search.vesselTypeCounts)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([type]) => formatVesselType(type as VesselType));

  const count = search.relevantVesselIds.length;
  const cargoBits = [
    search.cargo?.quantityText,
    search.cargo?.description,
  ].filter(Boolean);
  const cargoLine = cargoBits.length ? cargoBits.join(" · ") : null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-[7.25rem] z-20 flex justify-center px-3 sm:top-[7.75rem]">
      <div className="flex max-w-xl flex-col gap-1.5 rounded-2xl border border-teal-300/20 bg-[rgba(8,16,28,0.9)] px-3.5 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <p className="text-[12px] font-medium tracking-tight text-white/95">
            <span className="text-emerald-200/95">{search.origin.name}</span>
            <span className="mx-1.5 text-teal-300/70">→</span>
            <span className="text-sky-200/95">{search.destination.name}</span>
          </p>
          {cargoLine ? (
            <>
              <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />
              <p className="text-[11px] text-slate-300/90">{cargoLine}</p>
            </>
          ) : null}
          <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />
          <p className="text-[11px] text-slate-300/90">
            {count} corridor-relevant vessel{count === 1 ? "" : "s"}
          </p>
          {typeLabels.length > 0 ? (
            <>
              <span className="hidden h-3 w-px bg-white/15 md:block" aria-hidden />
              <p className="hidden max-w-[12rem] truncate text-[10px] text-slate-400/90 md:block md:max-w-none">
                {typeLabels.join(" · ")}
              </p>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-slate-200 transition hover:border-teal-300/35 hover:text-white"
          >
            Clear search
          </button>
        </div>
        <p className="text-center text-[10px] leading-relaxed text-slate-500">
          Relevance is based on route, vessel and AIS signals. Commercial
          availability requires confirmation.
        </p>
      </div>
    </div>
  );
}

function AmbiguousHints({ search }: { search: RouteSearchState }) {
  const originNames = search.originCandidates?.slice(0, 3).map((c) => c.port.name) ?? [];
  const destNames =
    search.destinationCandidates?.slice(0, 3).map((c) => c.port.name) ?? [];
  if (!originNames.length && !destNames.length) return null;
  return (
    <div className="mt-1.5 space-y-0.5 text-[10px] text-amber-100/55">
      {originNames.length ? <p>Origin candidates: {originNames.join(", ")}</p> : null}
      {destNames.length ? <p>Destination candidates: {destNames.join(", ")}</p> : null}
    </div>
  );
}
