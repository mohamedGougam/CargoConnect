/**
 * Product UI appearance (Night / Day).
 * Day tokens mirror the map Day View ocean/teal palette so the journey stays coherent.
 */

import {
  VISUAL_THEME_STORAGE_KEY,
  applyThemeCssVars,
  resolveVisualTheme,
  type VisualThemeId,
} from "@/lib/map/visualThemes";

export type UiAppearanceId = "night" | "day";

export const UI_APPEARANCE_IDS: UiAppearanceId[] = ["night", "day"];

export const UI_APPEARANCE_LABELS: Record<UiAppearanceId, string> = {
  night: "Night",
  day: "Day",
};

export const UI_APPEARANCE_STORAGE_KEY = "cc_ui_appearance";
export const UI_APPEARANCE_EVENT = "cc-ui-appearance";

/** Map visual theme that pairs with each appearance. */
export function mapThemeForAppearance(appearance: UiAppearanceId): VisualThemeId {
  return appearance === "day" ? "day-view" : "premium-maritime";
}

export function appearanceForMapTheme(themeId: string | null | undefined): UiAppearanceId {
  return themeId === "day-view" ? "day" : "night";
}

export function notifyAppearanceChange(appearance: UiAppearanceId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UI_APPEARANCE_EVENT, { detail: appearance }),
  );
}

export function applyUiAppearance(
  root: HTMLElement,
  appearance: UiAppearanceId,
): void {
  root.dataset.ccUi = appearance;

  if (appearance === "day") {
    // Soft daylight sky — same family as Day View sea (#1a7bb8 / #0284c7 / #0ea5a4)
    root.style.setProperty("--cc-page", "#e8f4fb");
    root.style.setProperty("--cc-page-fg", "#0f172a");
    root.style.setProperty("--cc-muted", "#475569");
    root.style.setProperty("--cc-muted-soft", "#64748b");
    root.style.setProperty("--cc-header-bg", "rgba(232, 244, 251, 0.92)");
    root.style.setProperty("--cc-panel", "rgba(255, 255, 255, 0.78)");
    root.style.setProperty("--cc-panel-border", "rgba(2, 132, 199, 0.14)");
    root.style.setProperty("--cc-input-bg", "rgba(255, 255, 255, 0.92)");
    root.style.setProperty("--cc-input-border", "rgba(12, 74, 110, 0.16)");
    root.style.setProperty("--cc-input-fg", "#0f172a");
    root.style.setProperty("--cc-nav-fg", "#334155");
    root.style.setProperty("--cc-title", "#0c4a6e");
    root.style.setProperty("--cc-section-label", "#0e7490");
    root.style.setProperty("--cc-cta-bg", "#0ea5a4");
    root.style.setProperty("--cc-cta-fg", "#042f2e");
    root.style.setProperty("--cc-accent-soft", "rgba(14, 165, 164, 0.14)");
    root.style.setProperty("--cc-page-glow", "rgba(186, 230, 253, 0.55)");
    // Accents match Day View map tokens (map glass/chrome stay on theme.css)
    root.style.setProperty("--cc-teal", "#0ea5a4");
    root.style.setProperty("--cc-ocean", "#0284c7");
  } else {
    root.style.setProperty("--cc-page", "#071018");
    root.style.setProperty("--cc-page-fg", "#e8eef5");
    root.style.setProperty("--cc-muted", "#94a3b8");
    root.style.setProperty("--cc-muted-soft", "#64748b");
    root.style.setProperty("--cc-header-bg", "rgba(7, 16, 24, 0.92)");
    root.style.setProperty("--cc-panel", "rgba(12, 20, 32, 0.65)");
    root.style.setProperty("--cc-panel-border", "rgba(255, 255, 255, 0.08)");
    root.style.setProperty("--cc-input-bg", "rgba(0, 0, 0, 0.25)");
    root.style.setProperty("--cc-input-border", "rgba(255, 255, 255, 0.12)");
    root.style.setProperty("--cc-input-fg", "#f8fafc");
    root.style.setProperty("--cc-nav-fg", "#cbd5e1");
    root.style.setProperty("--cc-title", "#ffffff");
    root.style.setProperty("--cc-section-label", "rgba(94, 234, 212, 0.85)");
    root.style.setProperty("--cc-cta-bg", "rgba(45, 212, 191, 0.9)");
    root.style.setProperty("--cc-cta-fg", "#020617");
    root.style.setProperty("--cc-accent-soft", "rgba(45, 212, 191, 0.12)");
    root.style.setProperty("--cc-page-glow", "transparent");
    root.style.setProperty("--cc-teal", "#5eead4");
    root.style.setProperty("--cc-ocean", "#0f766e");
  }
}

export function readStoredAppearance(): UiAppearanceId {
  if (typeof window === "undefined") return "night";
  try {
    const raw = window.localStorage.getItem(UI_APPEARANCE_STORAGE_KEY);
    if (raw === "day" || raw === "night") return raw;
    // Fall back to map theme explorer choice for coherence
    const mapTheme = window.sessionStorage.getItem(VISUAL_THEME_STORAGE_KEY);
    return appearanceForMapTheme(mapTheme);
  } catch {
    return "night";
  }
}

/** Persist appearance and keep the paired map theme in sync. */
export function persistAppearance(appearance: UiAppearanceId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_APPEARANCE_STORAGE_KEY, appearance);
    window.sessionStorage.setItem(
      VISUAL_THEME_STORAGE_KEY,
      mapThemeForAppearance(appearance),
    );
  } catch {
    /* ignore */
  }
  // Map theme first, then UI chrome so commercial tokens win on shared accents.
  applyThemeCssVars(
    document.documentElement,
    resolveVisualTheme(mapThemeForAppearance(appearance)),
  );
  applyUiAppearance(document.documentElement, appearance);
  notifyAppearanceChange(appearance);
}
