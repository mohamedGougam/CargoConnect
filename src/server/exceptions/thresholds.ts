/**
 * Configurable operational-exception thresholds (server only).
 */
export function exceptionThresholds() {
  return {
    aisStaleMinutes: envNum("SHIPMENT_EXCEPTION_AIS_STALE_MINUTES", 60),
    etaSlippageMinutes: envNum("SHIPMENT_EXCEPTION_ETA_SLIPPAGE_MINUTES", 360),
    routeDeviationKm: envNum(
      "SHIPMENT_EXCEPTION_ROUTE_DEVIATION_KM",
      Number(process.env.SHIPMENT_ROUTE_DEVIATION_KM ?? "80"),
    ),
    originDwellHours: envNum("SHIPMENT_EXCEPTION_ORIGIN_DWELL_HOURS", 12),
    destinationDwellHours: envNum(
      "SHIPMENT_EXCEPTION_DESTINATION_DWELL_HOURS",
      12,
    ),
    milestoneGraceMinutes: envNum(
      "SHIPMENT_EXCEPTION_MILESTONE_GRACE_MINUTES",
      120,
    ),
  };
}

export const EXCEPTION_RULE_VERSION = "1";

function envNum(key: string, fallback: number): number {
  const n = Number(process.env[key] ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
