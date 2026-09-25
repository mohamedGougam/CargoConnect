"use client";

import { useUiAppearance } from "@/context/UiAppearanceContext";
import { useVisualTheme } from "@/context/VisualThemeContext";
import {
  UI_APPEARANCE_IDS,
  UI_APPEARANCE_LABELS,
  mapThemeForAppearance,
  type UiAppearanceId,
} from "@/lib/ui/appearance";

/**
 * Night / Day appearance switcher — Day mirrors map Day View blues.
 */
export function AppearanceToggle({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { appearance, setAppearance } = useUiAppearance();
  const { setThemeId } = useVisualTheme();

  function choose(id: UiAppearanceId) {
    setAppearance(id);
    setThemeId(mapThemeForAppearance(id));
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border p-0.5 ${className}`}
      style={{
        borderColor: "var(--cc-panel-border, rgba(255,255,255,0.12))",
        background: "var(--cc-panel, rgba(12,20,32,0.65))",
      }}
      role="group"
      aria-label="Interface appearance"
    >
      {!compact ? (
        <span
          className="hidden px-2 text-[9px] font-medium tracking-[0.12em] uppercase sm:inline"
          style={{ color: "var(--cc-muted-soft, #64748b)" }}
        >
          Look
        </span>
      ) : null}
      {UI_APPEARANCE_IDS.map((id) => {
        const active = appearance === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
            style={
              active
                ? {
                    background: "var(--cc-accent-soft, rgba(45,212,191,0.15))",
                    color: "var(--cc-title, #fff)",
                    boxShadow: "inset 0 0 0 1px var(--cc-ocean, #0284c7)",
                  }
                : {
                    color: "var(--cc-nav-fg, #cbd5e1)",
                  }
            }
            aria-pressed={active}
          >
            {UI_APPEARANCE_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
