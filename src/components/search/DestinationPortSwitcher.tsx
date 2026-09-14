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
  /** Compact inline row — no absolute positioning (parent owns layout). */
  className?: string;
}

/**
 * Compact origin / destination selectors for an active route search.
 * Dropdowns only when existing candidate options are present — no invented ports.
 */
export function DestinationPortSwitcher({
  search,
  onSelectDestination,
  onSelectOrigin,
  onHoverCandidate,
  onFocusPort,
  className = "",
}: DestinationPortSwitcherProps) {
  if (search.status !== "active" || !search.origin || !search.destination) {
    return null;
  }

  const originOptions = search.originOptions ?? [];
  const destinationOptions = search.destinationOptions ?? [];
  const hasOriginChoices = originOptions.length > 1;
  const hasDestinationChoices = destinationOptions.length > 1;

  const corridorNm =
    destinationOptions.find((o) => o.port.id === search.destination!.id)
      ?.estimatedDistanceNm ??
    originOptions.find((o) => o.port.id === search.origin!.id)
      ?.estimatedDistanceNm;

  const originRegion =
    search.requestedOriginLabel?.trim() ||
    search.origin.country ||
    "origin";
  const destinationRegion =
    search.requestedDestinationLabel?.trim() ||
    search.destination.country ||
    "destination";

  return (
    <div
      className={`flex flex-col gap-1.5 sm:flex-row sm:items-stretch ${className}`.trim()}
    >
      <PortOptionPicker
        role="origin"
        label="Origin"
        region={originRegion}
        options={hasOriginChoices ? originOptions : undefined}
        selectedPort={search.origin}
        selectedDistanceNm={
          hasOriginChoices
            ? originOptions.find((o) => o.port.id === search.origin!.id)
                ?.estimatedDistanceNm
            : corridorNm
        }
        showAis={false}
        language={search.parsed?.detectedLanguage}
        onSelect={onSelectOrigin}
        onHoverCandidate={onHoverCandidate}
        onOpen={() => onFocusPort?.(search.origin!)}
        onFocusOnly={() => onFocusPort?.(search.origin!)}
      />
      <PortOptionPicker
        role="destination"
        label="Destination"
        region={destinationRegion}
        options={hasDestinationChoices ? destinationOptions : undefined}
        selectedPort={search.destination}
        selectedDistanceNm={
          hasDestinationChoices
            ? destinationOptions.find(
                (o) => o.port.id === search.destination!.id,
              )?.estimatedDistanceNm
            : corridorNm
        }
        showAis={hasDestinationChoices}
        selectedAisCount={
          hasDestinationChoices
            ? destinationOptions.find(
                (o) => o.port.id === search.destination!.id,
              )?.aisDestinationVesselCount
            : undefined
        }
        language={search.parsed?.detectedLanguage}
        onSelect={onSelectDestination}
        onHoverCandidate={onHoverCandidate}
        onOpen={() => onFocusPort?.(search.destination!)}
        onFocusOnly={() => onFocusPort?.(search.destination!)}
      />
    </div>
  );
}

function PortOptionPicker({
  role,
  label,
  region,
  options,
  selectedPort,
  selectedDistanceNm,
  selectedAisCount,
  showAis,
  language,
  onSelect,
  onHoverCandidate,
  onOpen,
  onFocusOnly,
}: {
  role: "origin" | "destination";
  label: string;
  region: string;
  options?: SmartPortOption[];
  selectedPort: Port;
  selectedDistanceNm?: number;
  selectedAisCount?: number;
  showAis: boolean;
  language?: string;
  onSelect: (portId: string) => void;
  onHoverCandidate?: (portId: string | null) => void;
  onOpen?: () => void;
  onFocusOnly?: () => void;
}) {
  const selectable = Boolean(options && options.length > 1);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedIndex = selectable
    ? Math.max(
        0,
        options!.findIndex((o) => o.port.id === selectedPort.id),
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

  function openList() {
    if (!selectable) {
      onFocusOnly?.();
      return;
    }
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
    if (!options) return;
    setActiveIndex(next);
    const opt = options[next];
    if (opt && opt.port.id !== selectedPort.id) {
      onHoverCandidate?.(opt.port.id);
    } else {
      onHoverCandidate?.(null);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!selectable) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onFocusOnly?.();
      }
      return;
    }
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
      highlightIndex(Math.min(activeIndex + 1, (options?.length ?? 1) - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options?.[activeIndex];
      if (opt) selectOption(opt);
    }
  }

  const metaParts: string[] = [];
  if (selectedDistanceNm != null && Number.isFinite(selectedDistanceNm)) {
    metaParts.push(`${Math.round(selectedDistanceNm).toLocaleString("en-US")} nm`);
  }
  if (showAis && selectedAisCount != null) {
    metaParts.push(formatAisCount(selectedAisCount));
  }

  const shellClass =
    "flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border border-white/[0.09] bg-[color:color-mix(in_srgb,var(--cc-glass,rgba(8,16,28,0.92))_92%,transparent)] px-2.5 py-1.5 text-left shadow-[0_4px_14px_rgba(0,0,0,0.18)] backdrop-blur-[6px] transition hover:border-white/16";

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        className={`${shellClass} ${
          selectable
            ? "hover:border-[color:color-mix(in_srgb,var(--cc-teal,#5eead4)_35%,transparent)]"
            : ""
        }`}
        aria-haspopup={selectable ? "listbox" : undefined}
        aria-expanded={selectable ? open : undefined}
        aria-controls={selectable ? listId : undefined}
        title={
          selectable
            ? `Choose ${label.toLowerCase()} port`
            : `Zoom to ${label.toLowerCase()} port`
        }
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[8px] font-medium uppercase tracking-[0.08em] text-slate-500">
            {label}
          </p>
          <PortNameLines port={selectedPort} language={language} />
          {metaParts.length > 0 ? (
            <p className="truncate text-[10px] leading-tight text-slate-400/90">
              {metaParts.join(" · ")}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-[10px] ${
            selectable ? "text-slate-400" : "text-slate-600/80"
          }`}
          aria-hidden
        >
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && selectable && options ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} ports in ${region}`}
          className="absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-52 overflow-auto rounded-lg border border-white/12 bg-[rgba(8,14,24,0.97)] py-1 shadow-[0_12px_28px_rgba(0,0,0,0.4)] backdrop-blur-[6px]"
        >
          <li className="truncate px-2.5 pb-1 pt-0.5 text-[8px] uppercase tracking-[0.08em] text-slate-500">
            {label} · {region}
          </li>
          {options.map((option, index) => {
            const isSelected = option.port.id === selectedPort.id;
            const isActive = index === activeIndex;
            const rowMeta = [
              `${Math.round(option.estimatedDistanceNm).toLocaleString("en-US")} nm`,
              role === "destination"
                ? formatAisCount(option.aisDestinationVesselCount)
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={option.port.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-1.5 px-2.5 py-1.5 text-left transition ${
                    isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                  }`}
                  onMouseEnter={() => highlightIndex(index)}
                  onMouseLeave={() => onHoverCandidate?.(null)}
                  onClick={() => selectOption(option)}
                >
                  <span className="mt-0.5 w-2.5 shrink-0 text-[10px] text-teal-300/90">
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <PortNameLines port={option.port} language={language} />
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {rowMeta}
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

/** English catalogue name + optional distinct alias when search language ≠ en. */
function PortNameLines({
  port,
  language,
}: {
  port: Port;
  language?: string;
}) {
  const localized = pickLocalizedAlias(port, language);
  return (
    <>
      <span className="block truncate text-[11px] font-medium leading-tight text-white/95">
        {port.name}
      </span>
      {localized ? (
        <span className="block truncate text-[9px] leading-tight text-slate-500">
          {localized}
        </span>
      ) : null}
    </>
  );
}

function pickLocalizedAlias(port: Port, language?: string): string | null {
  if (!language || language.toLowerCase().startsWith("en")) return null;
  const aliases = port.meta?.aliases ?? [];
  const nameNorm = port.name.trim().toLowerCase();
  for (const alias of aliases) {
    const t = alias?.trim();
    if (!t) continue;
    if (t.toLowerCase() === nameNorm) continue;
    // Prefer non-Latin / clearly distinct labels over English spelling variants
    if (/[^\u0000-\u007f]/.test(t) || t.length >= 3) return t;
  }
  return null;
}

function formatAisCount(n: number): string {
  if (n <= 0) return "0 AIS vessels";
  return `${n} AIS vessel${n === 1 ? "" : "s"}`;
}
