"use client";

import { useEffect, useState } from "react";
import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import {
  getMaritimeDataProvider,
  createMaritimeDataProvider,
} from "@/data/providers";
import { SAMPLE_STATUS_LABEL } from "@/data/providers/types";
import { getClientMaritimeMode } from "@/lib/config/maritimeMode";

export interface MaritimeDataset {
  vessels: Vessel[];
  ports: Port[];
  routes: MaritimeRoute[];
  isDemonstrationData: boolean;
  statusLabel: string;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_POLL_MS = 10_000;

/**
 * Load maritime data via MaritimeDataProvider.
 * Live/composite modes poll snapshots — never subscribe to AIS in the browser.
 */
export function useMaritimeData(): MaritimeDataset {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [routes, setRoutes] = useState<MaritimeRoute[]>([]);
  const [isDemonstrationData, setIsDemonstrationData] = useState(true);
  const [statusLabel, setStatusLabel] = useState(SAMPLE_STATUS_LABEL);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mode = getClientMaritimeMode();
    const pollMs =
      mode === "sample"
        ? 0
        : Number(process.env.NEXT_PUBLIC_MARITIME_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;

    async function load(isInitial: boolean) {
      if (isInitial) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const provider = getMaritimeDataProvider();
        const [nextVessels, nextPorts, nextRoutes] = await Promise.all([
          provider.getVessels(),
          provider.getPorts(),
          provider.getRoutes(),
        ]);
        if (cancelled) return;
        setVessels(nextVessels);
        setPorts(nextPorts);
        setRoutes(nextRoutes);
        setIsDemonstrationData(provider.isDemonstrationData);
        setStatusLabel(provider.statusLabel);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load maritime data";
        if (message === "LIVE_FALLBACK_TO_SAMPLE" || mode === "live" || mode === "composite") {
          try {
            const sample = createMaritimeDataProvider("sample");
            const [nextVessels, nextPorts, nextRoutes] = await Promise.all([
              sample.getVessels(),
              sample.getPorts(),
              sample.getRoutes(),
            ]);
            if (cancelled) return;
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
        if (!cancelled && isInitial) setIsLoading(false);
      }
    }

    void load(true);

    if (pollMs > 0) {
      const id = window.setInterval(() => {
        void load(false);
      }, pollMs);
      return () => {
        cancelled = true;
        window.clearInterval(id);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return { vessels, ports, routes, isDemonstrationData, statusLabel, isLoading, error };
}
