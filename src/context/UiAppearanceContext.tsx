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
  persistAppearance,
  readStoredAppearance,
  UI_APPEARANCE_EVENT,
  type UiAppearanceId,
} from "@/lib/ui/appearance";

type UiAppearanceContextValue = {
  appearance: UiAppearanceId;
  setAppearance: (id: UiAppearanceId) => void;
};

const UiAppearanceContext = createContext<UiAppearanceContextValue | null>(null);

export function UiAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<UiAppearanceId>("night");

  useEffect(() => {
    const initial = readStoredAppearance();
    setAppearanceState(initial);
    persistAppearance(initial);

    const onExternal = (event: Event) => {
      const next = (event as CustomEvent<UiAppearanceId>).detail;
      if (next === "day" || next === "night") {
        setAppearanceState(next);
      }
    };
    window.addEventListener(UI_APPEARANCE_EVENT, onExternal);
    return () => window.removeEventListener(UI_APPEARANCE_EVENT, onExternal);
  }, []);

  const setAppearance = useCallback((id: UiAppearanceId) => {
    setAppearanceState(id);
    persistAppearance(id);
  }, []);

  const value = useMemo(
    () => ({ appearance, setAppearance }),
    [appearance, setAppearance],
  );

  return (
    <UiAppearanceContext.Provider value={value}>
      {children}
    </UiAppearanceContext.Provider>
  );
}

export function useUiAppearance(): UiAppearanceContextValue {
  const ctx = useContext(UiAppearanceContext);
  if (!ctx) {
    return {
      appearance: "night",
      setAppearance: () => undefined,
    };
  }
  return ctx;
}
