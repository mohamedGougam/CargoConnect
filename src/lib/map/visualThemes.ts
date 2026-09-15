/**
 * Visual-only map/UI theme tokens for beautification exploration.
 * No business logic — paint, typography, and chrome tokens only.
 */

export type VisualThemeId =
  | "premium-maritime"
  | "intelligence-command"
  | "modern-navigation"
  | "day-view";

export const VISUAL_THEME_IDS: VisualThemeId[] = [
  "premium-maritime",
  "intelligence-command",
  "modern-navigation",
  "day-view",
];

export const VISUAL_THEME_LABELS: Record<VisualThemeId, string> = {
  "premium-maritime": "Premium Maritime",
  "intelligence-command": "Intelligence Command",
  "modern-navigation": "Modern Navigation",
  "day-view": "Day View",
};

/** Raster basemap paint (Esri tiles — free, attribution required). */
export type BasemapRasterTune = {
  baseSaturation: number;
  baseContrast: number;
  baseBrightnessMin: number;
  baseBrightnessMax: number;
  labelsOpacity: number;
};

export type OverlayTheme = {
  id: VisualThemeId;
  label: string;
  /** Prefer dark-gray basemap for A/B; ocean for C. */
  basemapAlias: "dark" | "ocean";
  raster: BasemapRasterTune;
  css: {
    background: string;
    foreground: string;
    teal: string;
    ocean: string;
    glass: string;
    chromeBorder: string;
    chromeShadow: string;
    vignette: string;
    /** Soft animated sea-wave overlay opacity (0 = off). */
    seaWavesOpacity: string;
  };
  corridor: {
    glowColor: string;
    glowWidth: [number, number, number];
    glowOpacity: number;
    glowPulseBright: number;
    glowPulseDim: number;
    underlayColor: string;
    underlayWidth: [number, number, number];
    underlayOpacity: number;
    coreColor: string;
    coreWidth: [number, number, number];
    coreOpacity: number;
    dashColor: string;
    dashWidth: [number, number];
    dashOpacity: number;
  };
  routes: {
    glowColor: string;
    lineColor: string;
  };
  ports: {
    originHalo: string;
    destHalo: string;
    candidateHoverHalo: string;
    candidateHalo: string;
    defaultHalo: string;
    originCore: string;
    destCore: string;
    candidateHoverCore: string;
    candidateCore: string;
    originStroke: string;
    destStroke: string;
    candidateHoverStroke: string;
    candidateStroke: string;
    labelColor: string;
    labelHalo: string;
    labelMinZoom: number;
  };
  clusters: {
    fill: string;
    stroke: string;
    opacity: number;
    strokeWidth: number;
    radii: [number, number, number];
    textColor: string;
    textSize: number;
  };
  vessels: {
    haloColor: string;
    relevantHaloColor: string;
    relevantHaloOpacity: number;
    dotRelevant: string;
    dotMuted: string;
    dotDefault: string;
    strokeRelevant: string;
    strokeDefault: string;
    labelColor: string;
    labelHalo: string;
    labelMinZoom: number;
    iconScale: number;
    glowRgba: string;
    outlineWidth: number;
  };
};

/** A — elegant, understated, investor-ready B2B maritime. */
export const THEME_PREMIUM_MARITIME: OverlayTheme = {
  id: "premium-maritime",
  label: "Premium Maritime",
  basemapAlias: "dark",
  raster: {
    baseSaturation: -0.22,
    baseContrast: 0.12,
    baseBrightnessMin: 0.02,
    baseBrightnessMax: 0.92,
    labelsOpacity: 0.55,
  },
  css: {
    background: "#060d16",
    foreground: "#e8eef5",
    teal: "#5eead4",
    ocean: "#0f766e",
    glass: "rgba(8, 16, 28, 0.78)",
    chromeBorder: "rgba(255, 255, 255, 0.11)",
    chromeShadow: "0 10px 32px rgba(0, 0, 0, 0.38)",
    vignette: "rgba(4, 10, 18, 0.32)",
    seaWavesOpacity: "0",
  },
  corridor: {
    glowColor: "#0f766e",
    glowWidth: [6, 9, 12],
    glowOpacity: 0.14,
    glowPulseBright: 0.18,
    glowPulseDim: 0.1,
    underlayColor: "#134e4a",
    underlayWidth: [2.4, 3.4, 4.2],
    underlayOpacity: 0.55,
    coreColor: "#99f6e4",
    coreWidth: [1.15, 1.65, 2.1],
    coreOpacity: 0.92,
    dashColor: "#ccfbf1",
    dashWidth: [0.7, 1.05],
    dashOpacity: 0.42,
  },
  routes: {
    glowColor: "#0d9488",
    lineColor: "#5eead4",
  },
  ports: {
    originHalo: "#34d399",
    destHalo: "#38bdf8",
    candidateHoverHalo: "#7dd3fc",
    candidateHalo: "#475569",
    defaultHalo: "#22d3ee",
    originCore: "#ecfdf5",
    destCore: "#e0f2fe",
    candidateHoverCore: "#bae6fd",
    candidateCore: "#94a3b8",
    originStroke: "#059669",
    destStroke: "#0284c7",
    candidateHoverStroke: "#38bdf8",
    candidateStroke: "#64748b",
    labelColor: "rgba(226, 232, 240, 0.88)",
    labelHalo: "rgba(6, 12, 22, 0.9)",
    labelMinZoom: 3.2,
  },
  clusters: {
    fill: "#2dd4bf",
    stroke: "#042f2e",
    opacity: 0.42,
    strokeWidth: 1,
    radii: [11, 14, 18],
    textColor: "#ecfdf5",
    textSize: 10,
  },
  vessels: {
    haloColor: "#5eead4",
    relevantHaloColor: "#fbbf24",
    relevantHaloOpacity: 0.28,
    dotRelevant: "#fde68a",
    dotMuted: "#475569",
    dotDefault: "#99f6e4",
    strokeRelevant: "#b45309",
    strokeDefault: "#0f172a",
    labelColor: "#e2e8f0",
    labelHalo: "rgba(6,12,22,0.88)",
    labelMinZoom: 5.6,
    iconScale: 0.86,
    glowRgba: "rgba(94, 234, 212, 0.1)",
    outlineWidth: 1.6,
  },
};

/** B — darker, sharper, operational / technical. */
export const THEME_INTELLIGENCE_COMMAND: OverlayTheme = {
  id: "intelligence-command",
  label: "Intelligence Command",
  basemapAlias: "dark",
  raster: {
    baseSaturation: -0.35,
    baseContrast: 0.22,
    baseBrightnessMin: 0,
    baseBrightnessMax: 0.88,
    labelsOpacity: 0.42,
  },
  css: {
    background: "#03070c",
    foreground: "#e2e8f0",
    teal: "#22d3ee",
    ocean: "#155e75",
    glass: "rgba(4, 10, 18, 0.86)",
    chromeBorder: "rgba(34, 211, 238, 0.18)",
    chromeShadow: "0 8px 28px rgba(0, 0, 0, 0.5)",
    vignette: "rgba(0, 0, 0, 0.42)",
    seaWavesOpacity: "0",
  },
  corridor: {
    glowColor: "#0891b2",
    glowWidth: [5, 7.5, 10],
    glowOpacity: 0.16,
    glowPulseBright: 0.22,
    glowPulseDim: 0.12,
    underlayColor: "#083344",
    underlayWidth: [2.2, 3.1, 3.8],
    underlayOpacity: 0.7,
    coreColor: "#67e8f9",
    coreWidth: [1.05, 1.45, 1.85],
    coreOpacity: 0.95,
    dashColor: "#a5f3fc",
    dashWidth: [0.55, 0.9],
    dashOpacity: 0.5,
  },
  routes: {
    glowColor: "#0e7490",
    lineColor: "#22d3ee",
  },
  ports: {
    originHalo: "#4ade80",
    destHalo: "#22d3ee",
    candidateHoverHalo: "#67e8f9",
    candidateHalo: "#334155",
    defaultHalo: "#06b6d4",
    originCore: "#dcfce7",
    destCore: "#cffafe",
    candidateHoverCore: "#a5f3fc",
    candidateCore: "#64748b",
    originStroke: "#16a34a",
    destStroke: "#0891b2",
    candidateHoverStroke: "#22d3ee",
    candidateStroke: "#475569",
    labelColor: "rgba(203, 213, 225, 0.9)",
    labelHalo: "rgba(2, 6, 12, 0.92)",
    labelMinZoom: 3.4,
  },
  clusters: {
    fill: "#0891b2",
    stroke: "#022c22",
    opacity: 0.48,
    strokeWidth: 1,
    radii: [10, 13, 17],
    textColor: "#ecfeff",
    textSize: 10,
  },
  vessels: {
    haloColor: "#22d3ee",
    relevantHaloColor: "#f59e0b",
    relevantHaloOpacity: 0.32,
    dotRelevant: "#fcd34d",
    dotMuted: "#334155",
    dotDefault: "#67e8f9",
    strokeRelevant: "#92400e",
    strokeDefault: "#020617",
    labelColor: "#cbd5e1",
    labelHalo: "rgba(2,6,12,0.9)",
    labelMinZoom: 5.8,
    iconScale: 0.82,
    glowRgba: "rgba(34, 211, 238, 0.08)",
    outlineWidth: 1.4,
  },
};

/** C — cleaner, slightly brighter, approachable navigation. */
export const THEME_MODERN_NAVIGATION: OverlayTheme = {
  id: "modern-navigation",
  label: "Modern Navigation",
  basemapAlias: "ocean",
  raster: {
    baseSaturation: -0.12,
    baseContrast: 0.08,
    baseBrightnessMin: 0.08,
    baseBrightnessMax: 1,
    labelsOpacity: 0.7,
  },
  css: {
    background: "#0a1624",
    foreground: "#f1f5f9",
    teal: "#2dd4bf",
    ocean: "#0e7490",
    glass: "rgba(12, 24, 38, 0.74)",
    chromeBorder: "rgba(255, 255, 255, 0.14)",
    chromeShadow: "0 8px 26px rgba(0, 0, 0, 0.28)",
    vignette: "rgba(8, 18, 30, 0.22)",
    seaWavesOpacity: "0",
  },
  corridor: {
    glowColor: "#14b8a6",
    glowWidth: [7, 10, 13],
    glowOpacity: 0.15,
    glowPulseBright: 0.2,
    glowPulseDim: 0.11,
    underlayColor: "#0f766e",
    underlayWidth: [2.6, 3.6, 4.4],
    underlayOpacity: 0.45,
    coreColor: "#5eead4",
    coreWidth: [1.35, 1.9, 2.4],
    coreOpacity: 0.88,
    dashColor: "#99f6e4",
    dashWidth: [0.8, 1.15],
    dashOpacity: 0.48,
  },
  routes: {
    glowColor: "#14b8a6",
    lineColor: "#2dd4bf",
  },
  ports: {
    originHalo: "#34d399",
    destHalo: "#38bdf8",
    candidateHoverHalo: "#7dd3fc",
    candidateHalo: "#64748b",
    defaultHalo: "#38bdf8",
    originCore: "#d1fae5",
    destCore: "#e0f2fe",
    candidateHoverCore: "#bae6fd",
    candidateCore: "#94a3b8",
    originStroke: "#059669",
    destStroke: "#0284c7",
    candidateHoverStroke: "#38bdf8",
    candidateStroke: "#64748b",
    labelColor: "rgba(241, 245, 249, 0.92)",
    labelHalo: "rgba(8, 16, 28, 0.82)",
    labelMinZoom: 2.9,
  },
  clusters: {
    fill: "#2dd4bf",
    stroke: "#134e4a",
    opacity: 0.46,
    strokeWidth: 1.1,
    radii: [12, 15, 19],
    textColor: "#f0fdfa",
    textSize: 10.5,
  },
  vessels: {
    haloColor: "#2dd4bf",
    relevantHaloColor: "#fbbf24",
    relevantHaloOpacity: 0.3,
    dotRelevant: "#fde68a",
    dotMuted: "#64748b",
    dotDefault: "#ccfbf1",
    strokeRelevant: "#b45309",
    strokeDefault: "#042f2e",
    labelColor: "#e2e8f0",
    labelHalo: "rgba(8,16,28,0.85)",
    labelMinZoom: 5.3,
    iconScale: 0.9,
    glowRgba: "rgba(45, 212, 191, 0.12)",
    outlineWidth: 1.8,
  },
};

/**
 * Day View — bright premium maritime blues with soft sea motion.
 * Explorer option only; does not lock production default.
 */
export const THEME_DAY_VIEW: OverlayTheme = {
  id: "day-view",
  label: "Day View",
  basemapAlias: "ocean",
  raster: {
    baseSaturation: 0.42,
    baseContrast: 0.14,
    baseBrightnessMin: 0.12,
    baseBrightnessMax: 1,
    labelsOpacity: 0.78,
  },
  css: {
    background: "#0a4a72",
    foreground: "#f8fafc",
    teal: "#0ea5a4",
    ocean: "#0284c7",
    glass: "rgba(12, 36, 58, 0.72)",
    chromeBorder: "rgba(255, 255, 255, 0.16)",
    chromeShadow: "0 10px 28px rgba(8, 40, 72, 0.28)",
    vignette: "rgba(20, 80, 130, 0.14)",
    seaWavesOpacity: "0.32",
  },
  corridor: {
    glowColor: "#0369a1",
    glowWidth: [7, 10, 14],
    glowOpacity: 0.2,
    glowPulseBright: 0.28,
    glowPulseDim: 0.14,
    underlayColor: "#0e7490",
    underlayWidth: [2.8, 3.8, 4.8],
    underlayOpacity: 0.55,
    coreColor: "#ecfeff",
    coreWidth: [1.4, 2, 2.5],
    coreOpacity: 0.95,
    dashColor: "#ffffff",
    dashWidth: [0.85, 1.2],
    dashOpacity: 0.55,
  },
  routes: {
    glowColor: "#0284c7",
    lineColor: "#67e8f9",
  },
  ports: {
    originHalo: "#059669",
    destHalo: "#0369a1",
    candidateHoverHalo: "#0284c7",
    candidateHalo: "#64748b",
    defaultHalo: "#0ea5e9",
    originCore: "#ecfdf5",
    destCore: "#e0f2fe",
    candidateHoverCore: "#bae6fd",
    candidateCore: "#94a3b8",
    originStroke: "#047857",
    destStroke: "#075985",
    candidateHoverStroke: "#0284c7",
    candidateStroke: "#475569",
    labelColor: "rgba(15, 23, 42, 0.88)",
    labelHalo: "rgba(248, 250, 252, 0.85)",
    labelMinZoom: 2.9,
  },
  clusters: {
    fill: "#0284c7",
    stroke: "#0c4a6e",
    opacity: 0.5,
    strokeWidth: 1.1,
    radii: [12, 15, 19],
    textColor: "#f0f9ff",
    textSize: 10.5,
  },
  vessels: {
    haloColor: "#0ea5e9",
    relevantHaloColor: "#d97706",
    relevantHaloOpacity: 0.34,
    dotRelevant: "#fbbf24",
    dotMuted: "#64748b",
    dotDefault: "#0369a1",
    strokeRelevant: "#92400e",
    strokeDefault: "#f8fafc",
    labelColor: "#0f172a",
    labelHalo: "rgba(248,250,252,0.9)",
    labelMinZoom: 5.3,
    iconScale: 0.9,
    glowRgba: "rgba(14, 165, 233, 0.16)",
    outlineWidth: 1.8,
  },
};

export const VISUAL_THEMES: Record<VisualThemeId, OverlayTheme> = {
  "premium-maritime": THEME_PREMIUM_MARITIME,
  "intelligence-command": THEME_INTELLIGENCE_COMMAND,
  "modern-navigation": THEME_MODERN_NAVIGATION,
  "day-view": THEME_DAY_VIEW,
};

/** Production default until a theme is chosen permanently. */
export const DEFAULT_VISUAL_THEME_ID: VisualThemeId = "premium-maritime";

export function resolveVisualTheme(id?: string | null): OverlayTheme {
  if (id && id in VISUAL_THEMES) {
    return VISUAL_THEMES[id as VisualThemeId];
  }
  return VISUAL_THEMES[DEFAULT_VISUAL_THEME_ID];
}

export function applyThemeCssVars(
  root: HTMLElement,
  theme: OverlayTheme,
): void {
  root.dataset.ccVisualTheme = theme.id;
  root.style.setProperty("--background", theme.css.background);
  root.style.setProperty("--foreground", theme.css.foreground);
  root.style.setProperty("--cc-teal", theme.css.teal);
  root.style.setProperty("--cc-ocean", theme.css.ocean);
  root.style.setProperty("--cc-glass", theme.css.glass);
  root.style.setProperty("--cc-chrome-border", theme.css.chromeBorder);
  root.style.setProperty("--cc-chrome-shadow", theme.css.chromeShadow);
  root.style.setProperty("--cc-vignette", theme.css.vignette);
  root.style.setProperty(
    "--cc-sea-waves-opacity",
    theme.css.seaWavesOpacity ?? "0",
  );
}

export const VISUAL_THEME_STORAGE_KEY = "cc_visual_theme_explorer";
