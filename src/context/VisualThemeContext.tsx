"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_VISUAL_THEME_ID,
  VISUAL_THEME_STORAGE_KEY,
  VISUAL_THEMES,
  applyThemeCssVars,
  resolveVisualTheme,
  type OverlayTheme,
  type VisualThemeId,
} from "@/lib/map/visualThemes";

type VisualThemeContextValue = {
  themeId: VisualThemeId;
  theme: OverlayTheme;
  explorerEnabled: boolean;
  setThemeId: (id: VisualThemeId) => void;
};

const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);

function readStoredTheme(): VisualThemeId {
  if (typeof window === "undefined") return DEFAULT_VISUAL_THEME_ID;
  try {
    const raw = window.sessionStorage.getItem(VISUAL_THEME_STORAGE_KEY);
    if (raw && raw in VISUAL_THEMES) return raw as VisualThemeId;
  } catch {
    /* ignore */
  }
  return DEFAULT_VISUAL_THEME_ID;
}

function detectLocalExplorer(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  return (
    (process.env.NEXT_PUBLIC_VISUAL_THEME_EXPLORER ?? "").trim().toLowerCase() ===
    "true"
  );
}

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<VisualThemeId>(readStoredTheme);
  const [explorerEnabled, setExplorerEnabled] = useState(detectLocalExplorer);

  useEffect(() => {
    applyThemeCssVars(document.documentElement, resolveVisualTheme(themeId));
  }, [themeId]);

  useEffect(() => {
    if (detectLocalExplorer()) return;
    let cancelled = false;
    void fetch("/api/demo/status")
      .then((r) => r.json())
      .then((data: { demoMode?: boolean }) => {
        if (!cancelled) setExplorerEnabled(Boolean(data.demoMode));
      })
      .catch(() => {
        if (!cancelled) setExplorerEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: VisualThemeId) => {
    setThemeIdState(id);
    try {
      window.sessionStorage.setItem(VISUAL_THEME_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      theme: resolveVisualTheme(themeId),
      explorerEnabled,
      setThemeId,
    }),
    [themeId, explorerEnabled, setThemeId],
  );

  return (
    <VisualThemeContext.Provider value={value}>
      {children}
    </VisualThemeContext.Provider>
  );
}

export function useVisualTheme(): VisualThemeContextValue {
  const ctx = useContext(VisualThemeContext);
  if (!ctx) {
    return {
      themeId: DEFAULT_VISUAL_THEME_ID,
      theme: resolveVisualTheme(DEFAULT_VISUAL_THEME_ID),
      explorerEnabled: false,
      setThemeId: () => undefined,
    };
  }
  return ctx;
}
