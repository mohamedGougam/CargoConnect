"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Port, VesselType } from "@/domain/models";
import type { RouteSearchState } from "@/domain/search/types";
import { formatVesselType } from "@/lib/format";
import { understoodAsPrefix } from "@/lib/search/uxMessages";
import {
  listAlternativeRoutes,
  type AlternativeRouteOption,
} from "@/lib/search/activateSearch";
import { estimateMaritimeDistanceNm } from "@/lib/search/maritimeDistance";
import { DestinationPortSwitcher } from "@/components/search/DestinationPortSwitcher";

interface RouteSearchSummaryProps {
  search: RouteSearchState;
  onClear: () => void;
  /** Presentation-only; parent owns session persistence. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Switch among alternative origin→destination pairs. */
  onSelectRoute?: (originPortId: string, destinationPortId: string) => void;
  onSelectDestination?: (portId: string) => void;
  onSelectOrigin?: (portId: string) => void;
  onHoverCandidate?: (portId: string | null) => void;
  onFocusPort?: (port: Port) => void;
}

const PANEL_TOP = "top-[6.85rem] sm:top-[7.15rem]";

/**
 * Single compact route-search panel — map stays dominant.
 * Owns collapse, port selectors, clear, and disclaimer (no overlapping siblings).
 */
export function RouteSearchSummary({
  search,
  onClear,
  collapsed = false,
  onCollapsedChange,
  onSelectRoute,
  onSelectDestination,
  onSelectOrigin,
  onHoverCandidate,
  onFocusPort,
}: RouteSearchSummaryProps) {
  if (search.status === "idle") return null;

  if (search.status === "loading") {
    return (
      <div
        className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3 ${PANEL_TOP}`}
      >
        <div className="rounded-lg border border-teal-300/20 bg-[rgba(8,16,28,0.9)] px-3 py-2 text-[11px] text-teal-100/90 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-[6px]">
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
      <div
        className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-center px-3 ${PANEL_TOP}`}
      >
        <div className="flex max-w-lg items-start gap-2.5 rounded-lg border border-amber-300/25 bg-[rgba(8,16,28,0.92)] px-3 py-2.5 text-[11px] text-amber-50 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-[6px]">
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
            className="shrink-0 rounded border border-white/12 px-2 py-0.5 text-[10px] text-slate-300 transition hover:border-white/25 hover:text-white"
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
  const distanceNm = resolveCorridorDistanceNm(search);
  const showNearestBadge =
    search.destinationSelectionReason === "shortest_maritime_distance" ||
    search.originSelectionReason === "shortest_maritime_distance";
  const showPortSwitchers = Boolean(onSelectDestination && onSelectOrigin);

  if (collapsed) {
    return (
      <div
        className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-center px-3 ${PANEL_TOP}`}
      >
        <button
          type="button"
          onClick={() => onCollapsedChange?.(false)}
          aria-label="Expand route details"
          title="Expand route details"
          className="flex max-w-md items-center gap-2 rounded-lg border border-white/10 bg-[rgba(8,16,28,0.92)] px-2.5 py-1.5 text-left shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:border-white/16"
        >
          <p className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-tight text-white/95">
            <span className="text-emerald-200/95">{search.origin.name}</span>
            <span className="mx-1 text-teal-300/65">→</span>
            <span className="text-sky-200/95">{search.destination.name}</span>
            {distanceNm != null ? (
              <span className="ml-1.5 font-normal text-slate-400">
                · {Math.round(distanceNm).toLocaleString("en-US")} nm
              </span>
            ) : (
              <span className="ml-1.5 font-normal text-slate-400">
                · {count} vessel{count === 1 ? "" : "s"}
              </span>
            )}
          </p>
          <span className="shrink-0 text-[10px] text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-center px-3 ${PANEL_TOP}`}
    >
      <div className="flex w-full max-w-md flex-col gap-1.5 rounded-lg border border-white/10 bg-[rgba(8,16,28,0.92)] px-2.5 py-2 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-[6px]">
        {/* Header: route + collapse + clear */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <RoutePairControl
                search={search}
                onSelectRoute={onSelectRoute}
              />
            </div>
            {showNearestBadge ? (
              <p className="mt-0.5 truncate text-[9px] text-slate-500">
                Nearest by estimated maritime distance
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onClear}
              className="rounded px-1.5 py-0.5 text-[9px] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => onCollapsedChange?.(true)}
              aria-label="Collapse route details"
              title="Collapse"
              className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
            >
              <span aria-hidden>▴</span>
            </button>
          </div>
        </div>

        {showPortSwitchers ? (
          <DestinationPortSwitcher
            search={search}
            onSelectDestination={onSelectDestination!}
            onSelectOrigin={onSelectOrigin!}
            onHoverCandidate={onHoverCandidate}
            onFocusPort={onFocusPort}
          />
        ) : null}

        {/* Optional metadata */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400/90">
          <span>
            {count} corridor-relevant vessel{count === 1 ? "" : "s"}
          </span>
          {cargoLine ? (
            <>
              <span className="text-white/15" aria-hidden>
                ·
              </span>
              <span className="truncate text-slate-400/80">{cargoLine}</span>
            </>
          ) : null}
          {typeLabels.length > 0 ? (
            <>
              <span className="hidden text-white/15 sm:inline" aria-hidden>
                ·
              </span>
              <span className="hidden truncate sm:inline">
                {typeLabels.join(" · ")}
              </span>
            </>
          ) : null}
        </div>

        <p className="text-[8px] leading-snug text-slate-600">
          Relevance is based on route, vessel and AIS signals. Commercial
          availability requires confirmation.
        </p>
      </div>
    </div>
  );
}

function resolveCorridorDistanceNm(search: RouteSearchState): number | null {
  if (!search.origin || !search.destination) return null;
  const fromDest = search.destinationOptions?.find(
    (o) => o.port.id === search.destination!.id,
  )?.estimatedDistanceNm;
  if (fromDest != null) return fromDest;
  const fromOrigin = search.originOptions?.find(
    (o) => o.port.id === search.origin!.id,
  )?.estimatedDistanceNm;
  if (fromOrigin != null) return fromOrigin;
  return estimateMaritimeDistanceNm(search.origin, search.destination)
    .distanceNm;
}

function RoutePairControl({
  search,
  onSelectRoute,
}: {
  search: RouteSearchState;
  onSelectRoute?: (originPortId: string, destinationPortId: string) => void;
}) {
  const alternatives = listAlternativeRoutes(search);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!search.origin || !search.destination) return null;

  const label = (
    <>
      <span className="text-emerald-200/95">{search.origin.name}</span>
      <span className="mx-1 text-teal-300/65">→</span>
      <span className="text-sky-200/95">{search.destination.name}</span>
    </>
  );

  if (!onSelectRoute || alternatives.length <= 1) {
    return (
      <p className="truncate text-[12px] font-medium tracking-tight text-white/95">
        {label}
      </p>
    );
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        title="Alternative routes"
        className="truncate text-[12px] font-medium tracking-tight text-white/95 transition hover:opacity-90"
      >
        {label}
        <span className="ml-1 text-[9px] text-slate-500" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+4px)] left-0 z-40 max-h-52 w-[min(18rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-white/12 bg-[rgba(8,14,24,0.97)] py-1 shadow-[0_12px_28px_rgba(0,0,0,0.4)] backdrop-blur-[6px]"
        >
          <li className="px-2.5 pb-1 pt-0.5 text-[8px] uppercase tracking-[0.08em] text-slate-500">
            Alternative routes
          </li>
          {alternatives.map((route) => (
            <AlternativeRouteItem
              key={`${route.origin.id}:${route.destination.id}`}
              route={route}
              onSelect={() => {
                onSelectRoute(route.origin.id, route.destination.id);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AlternativeRouteItem({
  route,
  onSelect,
}: {
  route: AlternativeRouteOption;
  onSelect: () => void;
}) {
  return (
    <li role="option" aria-selected={route.selected}>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-1.5 px-2.5 py-1.5 text-left transition ${
          route.selected
            ? "bg-teal-400/10 text-white"
            : "text-slate-200 hover:bg-white/[0.05]"
        }`}
      >
        <span className="mt-0.5 w-2.5 shrink-0 text-[10px] text-teal-300/90">
          {route.selected ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-white/95">
            <span className="text-emerald-200/95">{route.origin.name}</span>
            <span className="mx-1 text-teal-300/65">→</span>
            <span className="text-sky-200/95">{route.destination.name}</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-400">
            ~{Math.round(route.estimatedDistanceNm).toLocaleString()} nm
          </span>
        </span>
      </button>
    </li>
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
