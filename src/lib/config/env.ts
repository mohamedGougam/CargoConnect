/**
 * Client-safe environment configuration.
 * Keep secrets server-only; only NEXT_PUBLIC_* values belong here.
 */
import { getClientMaritimeMode } from "./maritimeMode";

export const appConfig = {
  dataProvider: getClientMaritimeMode(),
  /**
   * Use "dark" / "ocean" for built-in free ESRI styles,
   * or a full MapLibre style URL for a remote vector style.
   */
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "dark",
  mapApiKey: process.env.NEXT_PUBLIC_MAP_API_KEY ?? "",
  pollIntervalMs: Number(process.env.NEXT_PUBLIC_MARITIME_POLL_INTERVAL_MS) || 10_000,
} as const;
