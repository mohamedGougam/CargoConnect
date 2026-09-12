"use client";

import type { RouteSearchState } from "@/domain/search/types";
import { formatVesselType } from "@/lib/format";
import { understoodAsPrefix } from "@/lib/search/uxMessages";
import type { VesselType } from "@/domain/models";

interface RouteSearchSummaryProps {
  search: RouteSearchState;
  onClear: () => void;
  /** Presentation-only; parent owns session persistence. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

/**
 * Compact route-search context — map stays dominant.
 */
export function RouteSearchSummary({
  search,
  onClear,
  collapsed = false,
  onCollapsedChange,
}: RouteSearchSummaryProps) {
  if (search.status === "idle") return null;

  const hasSwitcher =
    search.status === "active" &&
    Boolean(search.destinationOptions && search.destinationOptions.length > 1);
  const topClass = hasSwitcher
    ? "top-[11.5rem] sm:top-[11.75rem]"
    : "top-[7.25rem] sm:top-[7.75rem]";

  if (search.status === "loading") {
    return (
      <div className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3 ${topClass}`}>
        <div className="rounded-2xl border border-teal-300/25 bg-[rgba(8,16,28,0.88)] px-4 py-2.5 text-[11px] text-teal-100/90 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <p className="font-medium tracking-tight">Framing corridor…</p>
          <p className="mt-0.5 text-[10px] text-teal-100/55">
            Resolving ports and comparing estimated maritime distance
          </p>
        </div>
      </div>
    );
  }

  if (search.status === "error" || search.status === "ambiguous") {
    const title =
      search.resolutionOutcome === "catalogue_no_match"
        ? "Catalogue coverage"
        : search.status === "ambiguous"
          ? search.resolutionOutcome === "clarification"
            ? "One more detail"
            : "A few matching ports"
          : "We couldn't resolve that route";

    return (
      <div className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-center px-3 ${topClass}`}>
        <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-amber-300/25 bg-[rgba(8,16,28,0.92)] px-4 py-3 text-[11px] text-amber-50 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-100/95">{title}</p>
            <p className="mt-0.5 text-amber-100/70">
              {search.uxMessage ?? search.errorMessage}
            </p>
            {search.parsed?.interpretationSummary ? (
              <p className="mt-1 text-[10px] text-amber-100/50">
                {understoodAsPrefix(search.parsed.detectedLanguage)}{" "}
                {search.parsed.interpretationSummary}
              </p>
            ) : null}
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
  const intentDest =
    search.requestedDestinationLabel &&
    search.requestedDestinationLabel.toLowerCase() !==
      search.destination.name.toLowerCase()
      ? search.requestedDestinationLabel
      : null;

  if (collapsed) {
    return (
      <div className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-center px-3 ${topClass}`}>
        <button
          type="button"
          onClick={() => onCollapsedChange?.(false)}
          aria-label="Expand route details"
          title="Expand route details"
          className="flex max-w-xl items-center gap-2 rounded-2xl border border-teal-300/20 bg-[rgba(8,16,28,0.9)] px-3.5 py-1.5 text-left shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-teal-300/35 sm:px-4"
        >
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium tracking-tight text-white/95">
            <span className="text-emerald-200/95">{search.origin.name}</span>
            <span className="mx-1.5 text-teal-300/70">→</span>
            <span className="text-sky-200/95">{search.destination.name}</span>
            <span className="ml-2 font-normal text-slate-400">
              · {count} corridor-relevant vessel{count === 1 ? "" : "s"}
            </span>
          </p>
          <span className="shrink-0 text-[11px] text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-center px-3 ${topClass}`}>
      <div className="relative flex max-w-xl flex-col gap-1.5 rounded-2xl border border-teal-300/20 bg-[rgba(8,16,28,0.9)] px-3.5 py-2.5 pr-9 shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-md sm:px-4 sm:pr-10">
        <button
          type="button"
          onClick={() => onCollapsedChange?.(true)}
          aria-label="Collapse route details"
          title="Collapse route details"
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200"
        >
          <span aria-hidden>▴</span>
        </button>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <p className="text-[12px] font-medium tracking-tight text-white/95">
            <span className="text-emerald-200/95">{search.origin.name}</span>
            <span className="mx-1.5 text-teal-300/70">→</span>
            <span className="text-sky-200/95">{search.destination.name}</span>
            {intentDest ? (
              <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                ({intentDest})
              </span>
            ) : null}
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
  const originNames =
    search.originCandidates?.slice(0, 4).map((c) => c.port.name) ?? [];
  const destNames =
    search.destinationCandidates?.slice(0, 4).map((c) => c.port.name) ?? [];
  if (!originNames.length && !destNames.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {originNames.length ? (
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-wide text-amber-100/45">
            Origin
          </p>
          <div className="flex flex-wrap gap-1.5">
            {originNames.map((name) => (
              <span
                key={`o-${name}`}
                className="rounded-full border border-amber-200/25 bg-amber-100/10 px-2 py-0.5 text-[10px] text-amber-50/90"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {destNames.length ? (
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-wide text-sky-100/45">
            Destination
          </p>
          <div className="flex flex-wrap gap-1.5">
            {destNames.map((name) => (
              <span
                key={`d-${name}`}
                className="rounded-full border border-sky-200/25 bg-sky-100/10 px-2 py-0.5 text-[10px] text-sky-50/90"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
