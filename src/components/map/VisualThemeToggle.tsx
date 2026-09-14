"use client";

import { useVisualTheme } from "@/context/VisualThemeContext";
import {
  VISUAL_THEME_IDS,
  VISUAL_THEME_LABELS,
  type VisualThemeId,
} from "@/lib/map/visualThemes";

/**
 * Development / DEMO_MODE only — theme exploration switcher.
 * Hidden from normal production users.
 */
export function VisualThemeToggle() {
  const { themeId, setThemeId, explorerEnabled } = useVisualTheme();

  if (!explorerEnabled) return null;

  return (
    <div className="pointer-events-auto absolute bottom-4 right-16 z-30 sm:right-20">
      <label className="flex items-center gap-2 rounded-lg border border-[color:var(--cc-chrome-border,rgba(255,255,255,0.12))] bg-[color:var(--cc-glass,rgba(8,16,28,0.82))] px-2.5 py-1.5 shadow-[var(--cc-chrome-shadow,0_8px_24px_rgba(0,0,0,0.35))] backdrop-blur-sm">
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
          Theme
        </span>
        <select
          value={themeId}
          onChange={(e) => setThemeId(e.target.value as VisualThemeId)}
          className="max-w-[11rem] cursor-pointer appearance-none border-0 bg-transparent py-0.5 text-[11px] text-slate-200 outline-none"
          aria-label="Visual theme explorer"
        >
          {VISUAL_THEME_IDS.map((id) => (
            <option key={id} value={id} className="bg-slate-900 text-slate-100">
              {VISUAL_THEME_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
