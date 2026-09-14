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
  DEFAULT_MAP_FOUNDATION_ID,
  MAP_FOUNDATION_META,
  MAP_FOUNDATION_STORAGE_KEY,
  MAP_FOUNDATION_IDS,
  type MapFoundationId,
  type MapFoundationMeta,
} from "@/lib/map/mapFoundations";

type MapFoundationContextValue = {
  foundationId: MapFoundationId;
  foundation: MapFoundationMeta;
  explorerEnabled: boolean;
  setFoundationId: (id: MapFoundationId) => void;
};

const MapFoundationContext = createContext<MapFoundationContextValue | null>(
  null,
);

function readStoredFoundation(): MapFoundationId {
  if (typeof window === "undefined") return DEFAULT_MAP_FOUNDATION_ID;
  try {
    const raw = window.sessionStorage.getItem(MAP_FOUNDATION_STORAGE_KEY);
    if (raw && (MAP_FOUNDATION_IDS as string[]).includes(raw)) {
      return raw as MapFoundationId;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_MAP_FOUNDATION_ID;
}

function detectLocalExplorer(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  return (
    (process.env.NEXT_PUBLIC_VISUAL_THEME_EXPLORER ?? "").trim().toLowerCase() ===
      "true" ||
    (process.env.NEXT_PUBLIC_MAP_FOUNDATION_EXPLORER ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function MapFoundationProvider({ children }: { children: ReactNode }) {
  const [foundationId, setFoundationIdState] = useState<MapFoundationId>(
    readStoredFoundation,
  );
  const [explorerEnabled, setExplorerEnabled] = useState(detectLocalExplorer);

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

  const setFoundationId = useCallback((id: MapFoundationId) => {
    setFoundationIdState(id);
    try {
      window.sessionStorage.setItem(MAP_FOUNDATION_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      foundationId,
      foundation: MAP_FOUNDATION_META[foundationId],
      explorerEnabled,
      setFoundationId,
    }),
    [foundationId, explorerEnabled, setFoundationId],
  );

  return (
    <MapFoundationContext.Provider value={value}>
      {children}
    </MapFoundationContext.Provider>
  );
}

export function useMapFoundation(): MapFoundationContextValue {
  const ctx = useContext(MapFoundationContext);
  if (!ctx) {
    return {
      foundationId: DEFAULT_MAP_FOUNDATION_ID,
      foundation: MAP_FOUNDATION_META[DEFAULT_MAP_FOUNDATION_ID],
      explorerEnabled: false,
      setFoundationId: () => undefined,
    };
  }
  return ctx;
}
