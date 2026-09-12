import { formatDuration } from "@/server/exceptions/thresholds";

export function elapsedMs(startIso: string, endIso: string): number | null {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b - a;
}

export function elapsedLabel(ms: number): string {
  const sign = ms >= 0 ? "+" : "−";
  return `${sign}${formatDuration(ms)}`;
}

export function unsignedElapsedLabel(ms: number): string {
  return formatDuration(Math.abs(ms));
}
