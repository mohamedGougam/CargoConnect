"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import {
  getMaritimeDataProvider,
  createMaritimeDataProvider,
} from "@/data/providers";
import type { MaritimeViewportQuery } from "@/data/providers/types";
import { SAMPLE_STATUS_LABEL } from "@/data/providers/types";
import { getClientMaritimeMode } from "@/lib/config/maritimeMode";

export interface MapViewportState {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

export interface MaritimeDataset {
  vessels: Vessel[];
  ports: Port[];
  routes: MaritimeRoute[];
  isDemonstrationData: boolean;
  statusLabel: string;
  isLoading: boolean;
  error: string | null;
  /** Report map camera so live modes fetch viewport AIS. */
  setMapViewport: (viewport: MapViewportState) => void;
}

const DEFAULT_POLL_MS = 10_000;
const VIEWPORT_DEBOUNCE_MS = 400;

function mergeVessels(prev: Vessel[], next: Vessel[]): Vessel[] {
  if (next.length === 0) return prev;
  const byId = new Map(prev.map((v) => [v.id, v]));
  for (const v of next) byId.set(v.id, v);
  // Drop vessels far outside current next set when we have a fresh viewport payload
  // Keep merge soft: prefer next list as authority for this viewport.
  return next.length >= Math.min(5, prev.length) ? next : Array.from(byId.values());
}

/**
 * Load maritime data via MaritimeDataProvider.
 * Live/composite modes poll viewport snapshots — never subscribe to AIS in the browser.
 */
export function useMaritimeData(): MaritimeDataset {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [routes, setRoutes] = useState<MaritimeRoute[]>([]);
  const [isDemonstrationData, setIsDemonstrationData] = useState(true);
  const [statusLabel, setStatusLabel] = useState(SAMPLE_STATUS_LABEL);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewportRef = useRef<MaritimeViewportQuery | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGen = useRef(0);

  const load = useCallback(async (isInitial: boolean) => {
    const mode = getClientMaritimeMode();
    const gen = ++loadGen.current;
    if (isInitial) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const provider = getMaritimeDataProvider();
      const vp = viewportRef.current ?? undefined;
      const [nextVessels, nextPorts, nextRoutes] = await Promise.all([
        provider.getVessels(vp),
        provider.getPorts(vp),
        provider.getRoutes(),
      ]);
      if (gen !== loadGen.current) return;
      setVessels((prev) =>
        mode === "sample" ? nextVessels : mergeVessels(prev, nextVessels),
      );
      setPorts(nextPorts);
      setRoutes(nextRoutes);
      setIsDemonstrationData(provider.isDemonstrationData);
      setStatusLabel(provider.statusLabel);
    } catch (err) {
      if (gen !== loadGen.current) return;
      const message = err instanceof Error ? err.message : "Failed to load maritime data";
      if (message === "LIVE_FALLBACK_TO_SAMPLE" || mode === "live" || mode === "composite") {
        try {
          const sample = createMaritimeDataProvider("sample");
          const [nextVessels, nextPorts, nextRoutes] = await Promise.all([
            sample.getVessels(),
            sample.getPorts(),
            sample.getRoutes(),
          ]);
          if (gen !== loadGen.current) return;
          setVessels(nextVessels);
          setPorts(nextPorts);
          setRoutes(nextRoutes);
          setIsDemonstrationData(true);
          setStatusLabel(SAMPLE_STATUS_LABEL);
          setError(null);
        } catch (inner) {
          setError(inner instanceof Error ? inner.message : message);
        }
      } else {
        setError(message);
      }
    } finally {
      if (gen === loadGen.current && isInitial) setIsLoading(false);
    }
  }, []);

  const setMapViewport = useCallback(
    (viewport: MapViewportState) => {
      const mode = getClientMaritimeMode();
      if (mode === "sample") return;
      viewportRef.current = {
        minLon: viewport.west,
        minLat: viewport.south,
        maxLon: viewport.east,
        maxLat: viewport.north,
        zoom: viewport.zoom,
      };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void load(false);
      }, VIEWPORT_DEBOUNCE_MS);
    },
    [load],
  );

  useEffect(() => {
    let cancelled = false;
    const mode = getClientMaritimeMode();
    const pollMs =
      mode === "sample"
        ? 0
        : Number(process.env.NEXT_PUBLIC_MARITIME_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;

    const runInitial = () => {
      void load(true);
    };
    // Defer initial load out of the effect body to avoid sync setState lint.
    const t = window.setTimeout(runInitial, 0);

    if (pollMs > 0) {
      const id = window.setInterval(() => {
        if (!cancelled) void load(false);
      }, pollMs);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
        window.clearInterval(id);
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  return {
    vessels,
    ports,
    routes,
    isDemonstrationData,
    statusLabel,
    isLoading,
    error,
    setMapViewport,
  };
}
