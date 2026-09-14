"use client";

import { useMapFoundation } from "@/context/MapFoundationContext";
import {
  MAP_FOUNDATION_IDS,
  MAP_FOUNDATION_LABELS,
  type MapFoundationId,
} from "@/lib/map/mapFoundations";

/**
 * Development / DEMO_MODE only — map foundation visual comparison.
 * Does not change production default (Current Esri).
 */
export function MapFoundationToggle() {
  const { foundationId, setFoundationId, explorerEnabled } = useMapFoundation();

  if (!explorerEnabled) return null;

  return (
    <div className="pointer-events-auto absolute bottom-14 right-16 z-30 sm:bottom-16 sm:right-20">
      <label className="flex max-w-[16rem] flex-col gap-1 rounded-lg border border-[color:var(--cc-chrome-border,rgba(255,255,255,0.12))] bg-[color:var(--cc-glass,rgba(8,16,28,0.82))] px-2.5 py-1.5 shadow-[var(--cc-chrome-shadow,0_8px_24px_rgba(0,0,0,0.35))] backdrop-blur-sm">
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
          Map Foundation
        </span>
        <select
          value={foundationId}
          onChange={(e) => setFoundationId(e.target.value as MapFoundationId)}
          className="w-full cursor-pointer appearance-none border-0 bg-transparent py-0.5 text-[11px] text-slate-200 outline-none"
          aria-label="Map foundation explorer"
        >
          {MAP_FOUNDATION_IDS.map((id) => (
            <option key={id} value={id} className="bg-slate-900 text-slate-100">
              {MAP_FOUNDATION_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
