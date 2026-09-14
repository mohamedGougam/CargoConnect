"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Port } from "@/domain/models";
import type { RouteSearchState, SmartPortOption } from "@/domain/search/types";

interface DestinationPortSwitcherProps {
  search: RouteSearchState;
  onSelectDestination: (portId: string) => void;
  onSelectOrigin: (portId: string) => void;
  onHoverCandidate?: (portId: string | null) => void;
  /** Zoom map to a port (source or destination). */
  onFocusPort?: (port: Port) => void;
}

/**
 * Compact origin / destination selectors under the AI search bar.
 * Shown when either side was auto-picked among country/region candidates.
 */
export function DestinationPortSwitcher({
  search,
  onSelectDestination,
  onSelectOrigin,
  onHoverCandidate,
  onFocusPort,
}: DestinationPortSwitcherProps) {
  const showOrigin =
    search.status === "active" &&
    Boolean(search.originOptions && search.originOptions.length > 1) &&
    Boolean(search.origin);
  const showDestination =
    search.status === "active" &&
    Boolean(search.destinationOptions && search.destinationOptions.length > 1) &&
    Boolean(search.destination);

  if (!showOrigin && !showDestination) return null;

  const originRegion =
    search.requestedOriginLabel?.trim() ||
    search.origin?.country ||
    "origin";
  const destinationRegion =
    search.requestedDestinationLabel?.trim() ||
    search.destination?.country ||
    "destination";

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-[7.75rem] z-30 flex justify-center px-3 sm:top-[8.1rem]">
      <div className="flex w-full max-w-xl flex-col gap-2">
        <div className="flex flex-col items-center gap-1 px-1 text-center">
          <p className="max-w-full text-[10px] leading-snug text-slate-400/90">
            <span className="text-emerald-200/90">
              {search.origin?.name ?? originRegion}
            </span>
            <span className="mx-1 text-teal-400/60">→</span>
            <span className="text-sky-200/80">{destinationRegion}</span>
          </p>
          {search.destinationSelectionReason === "shortest_maritime_distance" ||
          search.originSelectionReason === "shortest_maritime_distance" ? (
            <span className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-slate-400">
              Nearest by estimated maritime distance
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {showOrigin && search.originOptions && search.origin ? (
            <PortOptionPicker
              role="origin"
              label="Origin"
              region={originRegion}
              options={search.originOptions}
              selectedPortId={search.origin.id}
              onSelect={onSelectOrigin}
              onHoverCandidate={onHoverCandidate}
              onOpen={() => onFocusPort?.(search.origin!)}
            />
          ) : search.origin ? (
            <button
              type="button"
              onClick={() => onFocusPort?.(search.origin!)}
              title="Zoom to origin port"
              className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--cc-glass,rgba(8,16,28,0.92))] px-3.5 py-2.5 text-left shadow-[var(--cc-chrome-shadow,0_8px_28px_rgba(0,0,0,0.28))] backdrop-blur-[10px] transition hover:border-teal-300/30"
            >
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">
                  Origin
                </p>
                <p className="truncate text-[12px] font-medium text-white/95">
                  {search.origin.name}
                </p>
              </div>
            </button>
          ) : null}
          {showDestination && search.destinationOptions && search.destination ? (
            <PortOptionPicker
              role="destination"
              label="Destination"
              region={destinationRegion}
              options={search.destinationOptions}
              selectedPortId={search.destination.id}
              onSelect={onSelectDestination}
              onHoverCandidate={onHoverCandidate}
              onOpen={() => onFocusPort?.(search.destination!)}
            />
          ) : search.destination ? (
            <button
              type="button"
              onClick={() => onFocusPort?.(search.destination!)}
              title="Zoom to destination port"
              className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--cc-glass,rgba(8,16,28,0.92))] px-3.5 py-2.5 text-left shadow-[var(--cc-chrome-shadow,0_8px_28px_rgba(0,0,0,0.28))] backdrop-blur-[10px] transition hover:border-teal-300/30"
            >
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">
                  Destination
                </p>
                <p className="truncate text-[12px] font-medium text-white/95">
                  {search.destination.name}
                </p>
              </div>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PortOptionPicker({
  role,
  label,
  region,
  options,
  selectedPortId,
  onSelect,
  onHoverCandidate,
  onOpen,
}: {
  role: "origin" | "destination";
  label: string;
  region: string;
  options: SmartPortOption[];
  selectedPortId: string;
  onSelect: (portId: string) => void;
  onHoverCandidate?: (portId: string | null) => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.port.id === selectedPortId),
  );
  const selected =
    options.find((o) => o.port.id === selectedPortId) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        onHoverCandidate?.(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onHoverCandidate]);

  function openList() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
    onOpen?.();
  }

  function closeList() {
    onHoverCandidate?.(null);
    setOpen(false);
  }

  function selectOption(option: SmartPortOption) {
    onHoverCandidate?.(null);
    onSelect(option.port.id);
    setOpen(false);
  }

  function highlightIndex(next: number) {
    setActiveIndex(next);
    const opt = options[next];
    if (opt && opt.port.id !== selectedPortId) {
      onHoverCandidate?.(opt.port.id);
    } else {
      onHoverCandidate?.(null);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIndex(Math.min(activeIndex + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) selectOption(opt);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--cc-teal,#5eead4)_28%,transparent)] bg-[color:var(--cc-glass,rgba(8,16,28,0.92))] px-3.5 py-2.5 text-left shadow-[var(--cc-chrome-shadow,0_8px_28px_rgba(0,0,0,0.28))] backdrop-blur-[10px] transition hover:border-[color:color-mix(in_srgb,var(--cc-teal,#5eead4)_45%,transparent)]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[9px] uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="truncate text-[12px] font-medium text-white/95">
            {selected.port.name}
          </p>
          <p className="truncate text-[10px] text-slate-400">
            {selected.estimatedDistanceNm.toLocaleString("en-US")} nm
            {role === "destination"
              ? ` · ${formatAisCount(selected.aisDestinationVesselCount)}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 text-slate-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} ports in ${region}`}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-64 overflow-auto rounded-2xl border border-white/12 bg-[rgba(8,14,24,0.97)] py-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          <li className="truncate px-3.5 pb-1.5 text-[9px] uppercase tracking-wide text-slate-500">
            {label} ports · {region}
          </li>
          {options.map((option, index) => {
            const isSelected = option.port.id === selectedPortId;
            const isActive = index === activeIndex;
            return (
              <li key={option.port.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-2 px-3.5 py-2 text-left transition ${
                    isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                  }`}
                  onMouseEnter={() => highlightIndex(index)}
                  onMouseLeave={() => onHoverCandidate?.(null)}
                  onClick={() => selectOption(option)}
                >
                  <span className="mt-0.5 w-3 shrink-0 text-[11px] text-teal-300/90">
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-[12px] font-medium text-white/95">
                      {option.port.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {option.estimatedDistanceNm.toLocaleString("en-US")} nm
                      {role === "destination"
                        ? ` · ${formatAisCount(option.aisDestinationVesselCount)}`
                        : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function formatAisCount(n: number): string {
  if (n <= 0) return "0 AIS vessels";
  return `${n} AIS vessel${n === 1 ? "" : "s"}`;
}
