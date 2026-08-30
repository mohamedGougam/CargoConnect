"use client";

import { useCallback, useRef, useState } from "react";

export type SelectionKind = "vessel" | "port" | null;

export interface MapSelection {
  kind: SelectionKind;
  id: string | null;
}

export interface HoverState {
  kind: SelectionKind;
  id: string | null;
  x: number;
  y: number;
}

/**
 * Map selection/hover state with hover throttling.
 * Avoids React re-renders on every mousemove pixel while still tracking the card.
 */
export function useMapInteraction() {
  const [selection, setSelection] = useState<MapSelection>({
    kind: null,
    id: null,
  });
  const [hover, setHover] = useState<HoverState>({
    kind: null,
    id: null,
    x: 0,
    y: 0,
  });
  const lastHoverCommitRef = useRef(0);

  const selectVessel = useCallback((id: string) => {
    setSelection({ kind: "vessel", id });
  }, []);

  const selectPort = useCallback((id: string) => {
    setSelection({ kind: "port", id });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({ kind: null, id: null });
  }, []);

  const setHoverTarget = useCallback((next: HoverState) => {
    const now = performance.now();

    setHover((prev) => {
      // Same entity — only push position updates at ~20fps
      if (prev.kind === next.kind && prev.id === next.id) {
        if (now - lastHoverCommitRef.current < 50) return prev;
        if (Math.abs(prev.x - next.x) < 3 && Math.abs(prev.y - next.y) < 3) {
          return prev;
        }
        lastHoverCommitRef.current = now;
        return next;
      }

      lastHoverCommitRef.current = now;
      return next;
    });
  }, []);

  const clearHover = useCallback(() => {
    setHover((prev) => {
      if (prev.kind === null && prev.id === null) return prev;
      return { kind: null, id: null, x: 0, y: 0 };
    });
  }, []);

  return {
    selection,
    hover,
    selectVessel,
    selectPort,
    clearSelection,
    setHoverTarget,
    clearHover,
  };
}
