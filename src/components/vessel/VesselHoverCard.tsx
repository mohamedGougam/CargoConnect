"use client";

import type { Port, Vessel } from "@/domain/models";
import {
  formatEta,
  formatPortType,
  formatVesselStatus,
  formatVesselType,
} from "@/lib/format";
import { GlassPanel } from "@/components/ui/GlassPanel";

interface HoverCardProps {
  x: number;
  y: number;
}

interface VesselHoverCardProps extends HoverCardProps {
  vessel: Vessel;
  originName?: string;
  destinationName?: string;
}

export function VesselHoverCard({
  vessel,
  destinationName,
  x,
  y,
}: VesselHoverCardProps) {
  return (
    <div
      className="pointer-events-none absolute z-40 w-64 -translate-x-1/2 -translate-y-[110%]"
      style={{ left: x, top: y }}
    >
      <GlassPanel className="px-3.5 py-3">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-teal-300/90 uppercase">
          Vessel
        </p>
        <h3 className="mt-0.5 font-[family-name:var(--font-fraunces)] text-lg text-white">
          {vessel.name}
        </h3>
        <dl className="mt-2 space-y-1 text-xs text-slate-300">
          <HoverRow label="Type" value={formatVesselType(vessel.type)} />
          <HoverRow label="Status" value={formatVesselStatus(vessel.status)} />
          {vessel.destinationRaw ? (
            <HoverRow label="AIS destination" value={vessel.destinationRaw} />
          ) : destinationName ? (
            <HoverRow label="Destination" value={destinationName} />
          ) : null}
          {vessel.eta ? <HoverRow label="ETA" value={formatEta(vessel.eta)} /> : null}
          {vessel.speed != null ? (
            <HoverRow label="Speed" value={`${vessel.speed.toFixed(1)} kn`} />
          ) : null}
        </dl>
      </GlassPanel>
    </div>
  );
}

interface PortHoverCardProps extends HoverCardProps {
  port: Port;
}

export function PortHoverCard({ port, x, y }: PortHoverCardProps) {
  return (
    <div
      className="pointer-events-none absolute z-40 w-60 -translate-x-1/2 -translate-y-[110%]"
      style={{ left: x, top: y }}
    >
      <GlassPanel className="px-3.5 py-3">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-sky-300/90 uppercase">
          Port
        </p>
        <h3 className="mt-0.5 font-[family-name:var(--font-fraunces)] text-lg text-white">
          {port.name}
        </h3>
        <dl className="mt-2 space-y-1 text-xs text-slate-300">
          <HoverRow label="Location" value={port.locationLabel} />
          <HoverRow label="Country" value={port.country} />
          <HoverRow label="Type" value={formatPortType(port.type)} />
        </dl>
      </GlassPanel>
    </div>
  );
}

function HoverRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{value}</dd>
    </div>
  );
}
