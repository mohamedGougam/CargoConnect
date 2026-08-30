import type { VesselType, PortType, VesselStatus } from "@/domain/models";

export function formatVesselType(type: VesselType): string {
  const labels: Record<VesselType, string> = {
    general_cargo: "General cargo",
    bulk_carrier: "Bulk carrier",
    container: "Container",
    tanker: "Tanker",
    ro_ro: "Ro-Ro",
    multipurpose: "Multipurpose",
    passenger: "Passenger",
    tug_service: "Tug / service",
    fishing: "Fishing",
    pleasure: "Pleasure / sailing",
    other: "Other",
    unknown: "Unknown",
  };
  return labels[type];
}

export function formatPortType(type: PortType): string {
  const labels: Record<PortType, string> = {
    seaport: "Seaport",
    container_terminal: "Container terminal",
    bulk_terminal: "Bulk terminal",
    multipurpose: "Multipurpose port",
    oil_terminal: "Oil terminal",
  };
  return labels[type];
}

export function formatVesselStatus(status: VesselStatus): string {
  const labels: Record<VesselStatus, string> = {
    underway: "Underway",
    at_anchor: "At anchor",
    moored: "Moored",
    unknown: "Unknown",
  };
  return labels[status];
}

export function formatEta(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return undefined;
  }
}

export function formatCoordinate(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns}, ${Math.abs(lon).toFixed(3)}°${ew}`;
}
