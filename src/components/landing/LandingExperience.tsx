"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiAssistantBar } from "@/components/ai/AiAssistantBar";
import { PortDetailPanel } from "@/components/port/PortDetailPanel";
import { RouteSearchSummary } from "@/components/search/RouteSearchSummary";
import { DestinationPortSwitcher } from "@/components/search/DestinationPortSwitcher";
import { MapFullscreenControl } from "@/components/map/MapFullscreenControl";
import { PortHoverCard, VesselHoverCard } from "@/components/vessel/VesselHoverCard";
import { VesselDetailPanel } from "@/components/vessel/VesselDetailPanel";
import { DemoOperatorControls } from "@/components/demo/DemoOperatorControls";
import { VisualThemeToggle } from "@/components/map/VisualThemeToggle";
import { MapFoundationToggle } from "@/components/map/MapFoundationToggle";
import {
  RouteSearchProvider,
  useRouteSearch,
} from "@/context/RouteSearchContext";
import { VisualThemeProvider, useVisualTheme } from "@/context/VisualThemeContext";
import {
  MapFoundationProvider,
  useMapFoundation,
} from "@/context/MapFoundationContext";
import { useMapInteraction } from "@/hooks/useMapInteraction";
import { useMaritimeData } from "@/hooks/useMaritimeData";
import { EASTERN_MED_MAP_VIEW } from "@/lib/map/style";
import { startCommercialWorkflow } from "@/lib/commercial/intent";
import {
  createMapChromeUiState,
  enterMapFullscreen,
  exitMapFullscreen,
  handleMapChromeEscape,
  isSearchChromeVisible,
  setSummaryCollapsed,
} from "@/lib/map/mapChromeUi";
import type { Port } from "@/domain/models";
import { createIdleSearchState } from "@/domain/search/types";

const MaritimeMap = dynamic(
  () => import("@/components/map/MaritimeMap").then((mod) => mod.MaritimeMap),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#0b1520] text-sm text-slate-400">
        Loading maritime map…
      </div>
    ),
  },
);

export function LandingExperience() {
  return (
    <RouteSearchProvider>
      <VisualThemeProvider>
        <MapFoundationProvider>
          <LandingExperienceInner />
        </MapFoundationProvider>
      </VisualThemeProvider>
    </RouteSearchProvider>
  );
}

function LandingExperienceInner() {
  const { vessels, ports, routes, statusLabel, isDemonstrationData, isLoading, error, setMapViewport } =
    useMaritimeData();
  const {
    search,
    isSearching,
    runQuery,
    clearSearch,
    selectDestination,
    refreshRelevance,
    relevantIdSet,
  } = useRouteSearch();

  const mapInitialView = useMemo(
    () => (isDemonstrationData ? undefined : EASTERN_MED_MAP_VIEW),
    [isDemonstrationData],
  );
  const {
    selection,
    hover,
    selectVessel,
    selectPort,
    clearSelection,
    setHoverTarget,
    clearHover,
  } = useMapInteraction();
  const urlHydratedRef = useRef(false);

  const mapPorts = useMemo(() => {
    const byId = new Map<string, Port>();
    for (const port of ports) byId.set(port.id, port);
    if (search.origin) byId.set(search.origin.id, search.origin);
    if (search.destination) byId.set(search.destination.id, search.destination);
    for (const opt of search.destinationOptions ?? []) {
      byId.set(opt.port.id, opt.port);
    }
    return Array.from(byId.values());
  }, [ports, search.origin, search.destination, search.destinationOptions]);

  const searchActive = search.status === "active";

  const candidatePortIds = useMemo(() => {
    if (!searchActive || !search.destinationOptions?.length) return [];
    return search.destinationOptions
      .map((o) => o.port.id)
      .filter((id) => id !== search.destination?.id);
  }, [searchActive, search.destinationOptions, search.destination?.id]);

  const [highlightCandidatePortId, setHighlightCandidatePortId] = useState<
    string | null
  >(null);
  const [mapChrome, setMapChrome] = useState(createMapChromeUiState);
  const searchChromeVisible = isSearchChromeVisible(mapChrome);
  const { theme } = useVisualTheme();
  const { foundationId } = useMapFoundation();

  const portsById = useMemo(() => {
    const map = new Map(mapPorts.map((p) => [p.id, p]));
    return map;
  }, [mapPorts]);

  const selectedVessel =
    selection.kind === "vessel" && selection.id
      ? (vessels.find((v) => v.id === selection.id) ?? null)
      : null;
  const selectedPort =
    selection.kind === "port" && selection.id
      ? (portsById.get(selection.id) ?? null)
      : null;

  const hoveredVessel =
    hover.kind === "vessel" && hover.id
      ? (vessels.find((v) => v.id === hover.id) ?? null)
      : null;
  const hoveredPort =
    hover.kind === "port" && hover.id
      ? (portsById.get(hover.id) ?? null)
      : null;

  const onVesselHover = useCallback(
    (id: string | null, x: number, y: number) => {
      if (!id) {
        clearHover();
        return;
      }
      setHoverTarget({ kind: "vessel", id, x, y });
    },
    [clearHover, setHoverTarget],
  );

  const onPortHover = useCallback(
    (id: string | null, x: number, y: number) => {
      if (!id) {
        clearHover();
        return;
      }
      setHoverTarget({ kind: "port", id, x, y });
    },
    [clearHover, setHoverTarget],
  );

  const handleSearchSubmit = useCallback(
    async (query: string) => {
      await runQuery(query, vessels);
    },
    [runQuery, vessels],
  );

  // Hydrate active search from ?q= once vessels are available
  useEffect(() => {
    if (urlHydratedRef.current || isLoading || vessels.length === 0) return;
    const q = new URL(window.location.href).searchParams.get("q");
    if (!q?.trim()) {
      urlHydratedRef.current = true;
      return;
    }
    urlHydratedRef.current = true;
    void runQuery(q, vessels);
  }, [isLoading, vessels, runQuery]);

  // Recalculate corridor relevance when live AIS snapshot updates (not per frame)
  useEffect(() => {
    if (search.status !== "active") return;
    refreshRelevance(vessels);
  }, [vessels, search.status, refreshRelevance]);

  const drawerOpen = Boolean(selectedVessel || selectedPort);

  useEffect(() => {
    document.documentElement.classList.toggle("cc-drawer-open", drawerOpen);
    return () => document.documentElement.classList.remove("cc-drawer-open");
  }, [drawerOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMapChrome((prev) =>
        handleMapChromeEscape(prev, { drawerOrModalOpen: drawerOpen }),
      );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const routeRole =
    selectedPort && searchActive
      ? selectedPort.id === search.origin?.id
        ? "origin"
        : selectedPort.id === search.destination?.id
          ? "destination"
          : null
      : null;

  const beginCommercial = useCallback(
    (workflow: "price" | "reservation") => {
      const contextSearch =
        search.status === "active"
          ? search
          : {
              ...createIdleSearchState(),
              status: "idle" as const,
              originalQuery: search.originalQuery || "",
            };
      void startCommercialWorkflow({
        workflow,
        search: contextSearch,
        selectedVessel: selectedVessel,
        selectedPort: selectedPort,
      });
    },
    [search, selectedVessel, selectedPort],
  );

  return (
    <div
      className="relative h-dvh w-full overflow-hidden"
      style={{ background: theme.css.background }}
    >
      {!isLoading && !error ? (
        <MaritimeMap
          key={`${foundationId}:${theme.id}`}
          vessels={vessels}
          ports={mapPorts}
          routes={routes}
          allowDemoAnimation={isDemonstrationData && !searchActive}
          initialView={mapInitialView}
          corridor={searchActive ? search.corridor : null}
          originPortId={searchActive ? search.origin?.id : null}
          destinationPortId={searchActive ? search.destination?.id : null}
          candidatePortIds={candidatePortIds}
          highlightCandidatePortId={highlightCandidatePortId}
          relevantVesselIds={searchActive ? search.relevantVesselIds : []}
          searchActive={searchActive}
          visualTheme={theme}
          mapFoundationId={foundationId}
          onVesselHover={onVesselHover}
          onPortHover={onPortHover}
          onVesselClick={selectVessel}
          onPortClick={selectPort}
          onMapClick={clearSelection}
          onViewportChange={setMapViewport}
        />
      ) : null}

      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">
          Preparing maritime view…
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-rose-400/20 bg-rose-950/50 p-5 text-sm text-rose-100 backdrop-blur">
            <p className="font-medium">Could not load maritime data</p>
            <p className="mt-1 text-rose-100/70">{error}</p>
          </div>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, var(--cc-vignette, rgba(7,16,24,0.28)) 100%)`,
        }}
      />

      <MapFullscreenControl
        fullscreen={mapChrome.mapFullscreen}
        onEnter={() => setMapChrome((s) => enterMapFullscreen(s))}
        onExit={() => setMapChrome((s) => exitMapFullscreen(s))}
      />

      {searchChromeVisible ? (
        <>
          <AiAssistantBar
            onSubmit={handleSearchSubmit}
            isSearching={isSearching}
          />

          <DestinationPortSwitcher
            search={search}
            onSelect={(portId) => selectDestination(portId, vessels)}
            onHoverCandidate={setHighlightCandidatePortId}
          />

          <RouteSearchSummary
            search={search}
            onClear={clearSearch}
            collapsed={mapChrome.summaryCollapsed}
            onCollapsedChange={(collapsed) =>
              setMapChrome((s) => setSummaryCollapsed(s, collapsed))
            }
          />
        </>
      ) : null}

      {statusLabel && searchChromeVisible ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20">
          <div className="rounded-full border border-white/8 bg-black/45 px-2.5 py-1 text-[10px] tracking-wide text-slate-400/90">
            {statusLabel}
          </div>
        </div>
      ) : null}

      {hoveredVessel && !selectedVessel ? (
        <VesselHoverCard
          vessel={hoveredVessel}
          originName={
            hoveredVessel.originPortId
              ? portsById.get(hoveredVessel.originPortId)?.name
              : undefined
          }
          destinationName={
            hoveredVessel.destinationPortId
              ? portsById.get(hoveredVessel.destinationPortId)?.name
              : undefined
          }
          x={hover.x}
          y={hover.y}
        />
      ) : null}

      {hoveredPort && !selectedPort && hover.kind === "port" ? (
        <PortHoverCard port={hoveredPort} x={hover.x} y={hover.y} />
      ) : null}

      <VesselDetailPanel
        vessel={selectedVessel}
        origin={
          selectedVessel?.originPortId
            ? portsById.get(selectedVessel.originPortId)
            : undefined
        }
        destination={
          selectedVessel?.destinationPortId
            ? portsById.get(selectedVessel.destinationPortId)
            : undefined
        }
        open={Boolean(selectedVessel)}
        onClose={clearSelection}
        routeContext={
          searchActive && search.origin && search.destination
            ? {
                originName: search.origin.name,
                destinationName: search.destination.name,
                isRelevant: selectedVessel
                  ? relevantIdSet.has(selectedVessel.id)
                  : false,
              }
            : null
        }
        hasActiveSearch={searchActive}
        onCheckPrice={() => beginCommercial("price")}
        onMakeReservation={() => beginCommercial("reservation")}
      />

      <PortDetailPanel
        port={selectedPort}
        open={Boolean(selectedPort)}
        onClose={clearSelection}
        routeRole={routeRole}
        hasActiveSearch={searchActive}
        onCheckPrice={() => beginCommercial("price")}
        onMakeReservation={() => beginCommercial("reservation")}
      />

      {searchChromeVisible ? <DemoOperatorControls variant="map" /> : null}
      {searchChromeVisible ? <VisualThemeToggle /> : null}
      {searchChromeVisible ? <MapFoundationToggle /> : null}
    </div>
  );
}
