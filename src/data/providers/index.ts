import { getClientMaritimeMode } from "@/lib/config/maritimeMode";
import { CompositeMaritimeDataProvider } from "./composite/CompositeMaritimeDataProvider";
import { LiveAISMaritimeDataProvider } from "./live/LiveAISMaritimeDataProvider";
import { SampleMaritimeProvider } from "./sample/SampleMaritimeProvider";
import type { DataProviderKind, MaritimeDataProvider } from "./types";

export type { MaritimeDataProvider, DataProviderKind } from "./types";
export {
  SAMPLE_STATUS_LABEL,
  LIVE_PROTOTYPE_STATUS_LABEL,
  COMPOSITE_STATUS_LABEL,
} from "./types";

/**
 * Factory for maritime data sources.
 * UI never imports sample/live modules directly — only this factory.
 *
 * Default is always sample unless NEXT_PUBLIC_MARITIME_DATA_MODE is live|composite.
 * AISStream credentials are server-only; missing credentials cause API fallback.
 */
export function createMaritimeDataProvider(
  kind: DataProviderKind = resolveProviderKind(),
): MaritimeDataProvider {
  switch (kind) {
    case "sample":
      return new SampleMaritimeProvider();
    case "live":
      return new LiveAISMaritimeDataProvider();
    case "composite":
      return new CompositeMaritimeDataProvider();
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown data provider: ${String(_exhaustive)}`);
    }
  }
}

export function resolveProviderKind(): DataProviderKind {
  return getClientMaritimeMode();
}

/** Singleton used by client hooks. */
let cachedProvider: MaritimeDataProvider | null = null;

export function getMaritimeDataProvider(): MaritimeDataProvider {
  if (!cachedProvider) {
    cachedProvider = createMaritimeDataProvider();
  }
  return cachedProvider;
}

/** Test helper — clears singleton between tests. */
export function resetMaritimeDataProviderCache(): void {
  cachedProvider = null;
}
