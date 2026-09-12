"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Vessel } from "@/domain/models";
import {
  createIdleSearchState,
  type RouteSearchState,
} from "@/domain/search/types";
import {
  applyDestinationTextBoost,
  countVesselTypes,
  scoreRelevantVessels,
} from "@/lib/search/scoreVessels";
import { switchSearchDestination } from "@/lib/search/activateSearch";
import { countAisDestinationVessels } from "@/lib/search/aisDestinationMatch";

interface RouteSearchContextValue {
  search: RouteSearchState;
  isSearching: boolean;
  runQuery: (query: string, vessels: Vessel[]) => Promise<void>;
  clearSearch: () => void;
  /** Switch destination among ranked options without a new OpenAI call. */
  selectDestination: (portId: string, vessels: Vessel[]) => void;
  /** Recompute relevance when live vessel snapshot changes. */
  refreshRelevance: (vessels: Vessel[]) => void;
  relevantIdSet: Set<string>;
}

const RouteSearchContext = createContext<RouteSearchContextValue | null>(null);

export function RouteSearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<RouteSearchState>(createIdleSearchState);
  const [isSearching, setIsSearching] = useState(false);

  const clearSearch = useCallback(() => {
    setSearch(createIdleSearchState());
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("from");
      url.searchParams.delete("to");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const applyUrl = useCallback((state: RouteSearchState) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (state.status === "active" && state.originalQuery) {
      url.searchParams.set("q", state.originalQuery);
      if (state.origin?.id) url.searchParams.set("from", state.origin.id);
      if (state.destination?.id) url.searchParams.set("to", state.destination.id);
    }
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const runQuery = useCallback(
    async (query: string, vessels: Vessel[]) => {
      setIsSearching(true);
      setSearch((prev) => ({
        ...prev,
        status: "loading",
        originalQuery: query,
        updatedAt: new Date().toISOString(),
      }));
      try {
        const res = await fetch("/api/maritime/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            // Send a compact snapshot for server-side scoring
            vessels: vessels.map(compactVessel),
          }),
        });
        if (!res.ok) {
          throw new Error(`Search failed (${res.status})`);
        }
        const data = (await res.json()) as { search: RouteSearchState };
        setSearch(data.search);
        applyUrl(data.search);
      } catch (err) {
        setSearch({
          ...createIdleSearchState(),
          id: `search-err-${Date.now()}`,
          status: "error",
          originalQuery: query,
          errorMessage:
            err instanceof Error ? err.message : "Search request failed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } finally {
        setIsSearching(false);
      }
    },
    [applyUrl],
  );

  const selectDestination = useCallback(
    (portId: string, vessels: Vessel[]) => {
      setSearch((prev) => {
        if (prev.status !== "active" || !prev.origin) return prev;
        const next = switchSearchDestination(prev, portId, vessels);
        applyUrl(next);
        return next;
      });
    },
    [applyUrl],
  );

  const refreshRelevance = useCallback((vessels: Vessel[]) => {
    setSearch((prev) => {
      if (prev.status !== "active" || !prev.corridor || !prev.origin || !prev.destination) {
        return prev;
      }
      let hits = scoreRelevantVessels(vessels, {
        corridor: prev.corridor,
        originLatLon: prev.origin.position,
        destinationLatLon: prev.destination.position,
        vesselType: prev.vesselType,
        cargo: prev.cargo,
      });
      hits = applyDestinationTextBoost(
        vessels,
        hits,
        prev.destination.name,
        prev.origin.name,
      );
      const relevantVesselIds = hits.map((h) => h.vesselId);

      let destinationOptions = prev.destinationOptions;
      if (destinationOptions?.length) {
        destinationOptions = destinationOptions.map((o) => ({
          ...o,
          aisDestinationVesselCount: countAisDestinationVessels(vessels, o.port),
        }));
      }

      const sameIds =
        prev.relevantVesselIds.length === relevantVesselIds.length &&
        prev.relevantVesselIds.every((id, i) => id === relevantVesselIds[i]);
      const sameAis =
        !destinationOptions ||
        (prev.destinationOptions?.every(
          (o, i) =>
            o.aisDestinationVesselCount ===
            destinationOptions![i]?.aisDestinationVesselCount,
        ) ??
          true);
      if (sameIds && sameAis) return prev;
      return {
        ...prev,
        relevantHits: hits,
        relevantVesselIds,
        vesselTypeCounts: countVesselTypes(vessels, relevantVesselIds),
        destinationOptions,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // URL hydration is owned by LandingExperience (runQuery when vessels load).
  // Keep originalQuery empty until an explicit search runs.

  const relevantIdSet = useMemo(
    () => new Set(search.relevantVesselIds),
    [search.relevantVesselIds],
  );

  const value = useMemo(
    () => ({
      search,
      isSearching,
      runQuery,
      clearSearch,
      selectDestination,
      refreshRelevance,
      relevantIdSet,
    }),
    [
      search,
      isSearching,
      runQuery,
      clearSearch,
      selectDestination,
      refreshRelevance,
      relevantIdSet,
    ],
  );

  return (
    <RouteSearchContext.Provider value={value}>{children}</RouteSearchContext.Provider>
  );
}

export function useRouteSearch(): RouteSearchContextValue {
  const ctx = useContext(RouteSearchContext);
  if (!ctx) {
    throw new Error("useRouteSearch must be used within RouteSearchProvider");
  }
  return ctx;
}

function compactVessel(v: Vessel): Vessel {
  return {
    id: v.id,
    name: v.name,
    mmsi: v.mmsi,
    type: v.type,
    cargoCategory: v.cargoCategory,
    position: v.position,
    course: v.course,
    heading: v.heading,
    speed: v.speed,
    status: v.status,
    destinationRaw: v.destinationRaw,
    meta: v.meta,
  };
}
