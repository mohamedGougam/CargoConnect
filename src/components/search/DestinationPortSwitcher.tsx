"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { RouteSearchState, SmartPortOption } from "@/domain/search/types";

interface DestinationPortSwitcherProps {
  search: RouteSearchState;
  onSelect: (portId: string) => void;
  onHoverCandidate?: (portId: string | null) => void;
}

/**
 * Compact destination selector under the AI search bar.
 * Shown when destination was auto-picked among country/region candidates.
 */
export function DestinationPortSwitcher({
  search,
  onSelect,
  onHoverCandidate,
}: DestinationPortSwitcherProps) {
  const options = search.destinationOptions;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const show =
    search.status === "active" &&
    Boolean(search.destinationOptions && search.destinationOptions.length > 1) &&
    Boolean(search.destination);

  const selectedIndex =
    options && search.destination
      ? Math.max(
          0,
          options.findIndex((o) => o.port.id === search.destination!.id),
        )
      : 0;

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

  if (!show || !options || !search.destination) return null;

  const selected =
    options.find((o) => o.port.id === search.destination!.id) ?? options[0];
  const region =
    search.requestedDestinationLabel?.trim() ||
    selected.port.country ||
    "destination";

  function openList() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
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
    const opt = options![next];
    if (opt && opt.port.id !== search.destination?.id) {
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
      highlightIndex(Math.min(activeIndex + 1, options!.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options![activeIndex];
      if (opt) selectOption(opt);
    }
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute inset-x-0 top-[6.85rem] z-30 flex justify-center px-3 sm:top-[7.15rem]"
    >
      <div className="w-full max-w-xl">
        <div className="mb-1 flex items-center justify-center gap-2 text-[10px] text-slate-400/90">
          <span className="text-emerald-200/90">{search.origin?.name}</span>
          <span className="text-teal-400/60">→</span>
          <span className="text-sky-200/80">{region}</span>
          {search.destinationSelectionReason === "shortest_maritime_distance" ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-slate-400">
              Nearest by estimated maritime distance
            </span>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-teal-300/25 bg-[rgba(8,16,28,0.92)] px-3.5 py-2.5 text-left shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-md transition hover:border-teal-300/40"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => (open ? closeList() : openList())}
            onKeyDown={onKeyDown}
          >
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wide text-slate-500">
                Destination
              </p>
              <p className="truncate text-[12px] font-medium text-white/95">
                {selected.port.name}
                <span className="ml-2 font-normal text-slate-400">
                  · {selected.estimatedDistanceNm.toLocaleString("en-US")} nm
                  · {formatAisCount(selected.aisDestinationVesselCount)}
                </span>
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
              aria-label={`Destination ports in ${region}`}
              className="absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-64 overflow-auto rounded-2xl border border-white/12 bg-[rgba(8,14,24,0.97)] py-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
            >
              <li className="px-3.5 pb-1.5 text-[9px] uppercase tracking-wide text-slate-500">
                Destination ports · {region}
              </li>
              {options.map((option, index) => {
                const isSelected = option.port.id === search.destination!.id;
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
                      title="Vessels currently reporting this port as their AIS destination."
                    >
                      <span className="mt-0.5 w-3 shrink-0 text-[11px] text-teal-300/90">
                        {isSelected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-white/95">
                          {option.port.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {option.estimatedDistanceNm.toLocaleString("en-US")} nm
                          · {formatAisCount(option.aisDestinationVesselCount)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatAisCount(n: number): string {
  if (n <= 0) return "0 AIS vessels";
  return `${n} AIS vessel${n === 1 ? "" : "s"}`;
}
