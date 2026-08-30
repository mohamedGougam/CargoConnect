"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiAssistantBar } from "@/components/ai/AiAssistantBar";
import { PortDetailPanel } from "@/components/port/PortDetailPanel";
import { PortHoverCard, VesselHoverCard } from "@/components/vessel/VesselHoverCard";
import { VesselDetailPanel } from "@/components/vessel/VesselDetailPanel";
import { useMapInteraction } from "@/hooks/useMapInteraction";
import { useMaritimeData } from "@/hooks/useMaritimeData";
import { EASTERN_MED_MAP_VIEW } from "@/lib/map/style";

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
  const { vessels, ports, routes, statusLabel, isDemonstrationData, isLoading, error } =
    useMaritimeData();

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
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const portsById = useMemo(() => {
    const map = new Map(ports.map((p) => [p.id, p]));
    return map;
  }, [ports]);

  const selectedVessel =
    selection.kind === "vessel" && selection.id
      ? (vessels.find((v) => v.id === selection.id) ?? null)
      : null;
  const selectedPort =
    selection.kind === "port" && selection.id
      ? (ports.find((p) => p.id === selection.id) ?? null)
      : null;

  const hoveredVessel =
    hover.kind === "vessel" && hover.id
      ? (vessels.find((v) => v.id === hover.id) ?? null)
      : null;
  const hoveredPort =
    hover.kind === "port" && hover.id
      ? (ports.find((p) => p.id === hover.id) ?? null)
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

  const drawerOpen = Boolean(selectedVessel || selectedPort);

  useEffect(() => {
    document.documentElement.classList.toggle("cc-drawer-open", drawerOpen);
    return () => document.documentElement.classList.remove("cc-drawer-open");
  }, [drawerOpen]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b1520]">
      {/* Map always mounts as soon as data is ready — full viewport hero */}
      {!isLoading && !error ? (
        <MaritimeMap
          vessels={vessels}
          ports={ports}
          routes={routes}
          allowDemoAnimation={isDemonstrationData}
          initialView={mapInitialView}
          onVesselHover={onVesselHover}
          onPortHover={onPortHover}
          onVesselClick={selectVessel}
          onPortClick={selectPort}
          onMapClick={clearSelection}
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

      {/* Very light vignette only — must not hide geography */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(7,16,24,0.28)_100%)]" />

      <AiAssistantBar
        onSubmit={(query) => {
          setAiNotice(`AI routing is not connected yet. Query captured: “${query}”`);
          window.setTimeout(() => setAiNotice(null), 4800);
        }}
      />

      {statusLabel ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20">
          <div className="rounded-full border border-white/8 bg-black/45 px-2.5 py-1 text-[10px] tracking-wide text-slate-400/90">
            {statusLabel}
          </div>
        </div>
      ) : null}

      {aiNotice ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 max-w-md -translate-x-1/2 px-4">
          <div className="rounded-xl border border-teal-300/20 bg-[rgba(8,16,28,0.92)] px-3 py-2 text-center text-[11px] text-teal-50">
            {aiNotice}
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

      {/* Single contextual drawer layer — vessel OR port */}
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
      />

      <PortDetailPanel
        port={selectedPort}
        open={Boolean(selectedPort)}
        onClose={clearSelection}
      />
    </div>
  );
}
