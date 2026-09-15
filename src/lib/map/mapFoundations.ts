import type { StyleSpecification } from "maplibre-gl";
import type { OverlayTheme } from "@/lib/map/visualThemes";
import { resolveMapStyleForTheme } from "@/lib/map/style";

/**
 * Map foundation exploration — research + visual proof only.
 * Production default remains current Esri until a foundation is explicitly locked.
 */

export type MapFoundationId =
  | "current-esri"
  | "openfreemap-dark"
  | "openfreemap-fiord"
  | "openfreemap-premium-proof";

export const MAP_FOUNDATION_IDS: MapFoundationId[] = [
  "current-esri",
  "openfreemap-dark",
  "openfreemap-fiord",
  "openfreemap-premium-proof",
];

export const MAP_FOUNDATION_LABELS: Record<MapFoundationId, string> = {
  "current-esri": "Current Esri (baseline)",
  "openfreemap-dark": "OpenFreeMap Dark",
  "openfreemap-fiord": "OpenFreeMap Fiord",
  "openfreemap-premium-proof": "OFM Premium Maritime proof",
};

export const DEFAULT_MAP_FOUNDATION_ID: MapFoundationId = "current-esri";
export const MAP_FOUNDATION_STORAGE_KEY = "cc_map_foundation_explorer";

export const OPENFREEMAP_STYLE_DARK =
  "https://tiles.openfreemap.org/styles/dark";
export const OPENFREEMAP_STYLE_FIORD =
  "https://tiles.openfreemap.org/styles/fiord";
export const OPENFREEMAP_STYLE_LIBERTY =
  "https://tiles.openfreemap.org/styles/liberty";

/** Attribution strings for reports / manual media. MapLibre shows live attribution. */
export const MAP_FOUNDATION_ATTRIBUTION: Record<MapFoundationId, string> = {
  "current-esri":
    "Tiles © Esri — Esri, DeLorme, NAVTEQ (and Ocean sources when ocean style)",
  "openfreemap-dark":
    "OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
  "openfreemap-fiord":
    "OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
  "openfreemap-premium-proof":
    "OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
};

export type MapFoundationMeta = {
  id: MapFoundationId;
  label: string;
  format: "raster" | "vector";
  dataLicense: string;
  styleLicense: string;
  hosting: string;
  recurringLicenseCost: "none" | "uncertain" | "paid-requires-approval";
  commercialConfidence: "high" | "medium" | "low";
  externalDependency: string;
  selfHostPossible: boolean;
  notes: string;
};

export const MAP_FOUNDATION_META: Record<MapFoundationId, MapFoundationMeta> = {
  "current-esri": {
    id: "current-esri",
    label: MAP_FOUNDATION_LABELS["current-esri"],
    format: "raster",
    dataLicense: "Esri ArcGIS Online basemap terms (third-party data)",
    styleLicense: "Esri-hosted raster (not editable vector style)",
    hosting: "Esri ArcGIS Online tile servers",
    recurringLicenseCost: "uncertain",
    commercialConfidence: "low",
    externalDependency: "Esri public tile endpoints",
    selfHostPossible: false,
    notes:
      "Licensing concern for scaled commercial use; soft raster labels; land-heavy.",
  },
  "openfreemap-dark": {
    id: "openfreemap-dark",
    label: MAP_FOUNDATION_LABELS["openfreemap-dark"],
    format: "vector",
    dataLicense: "ODbL (OpenStreetMap) Produced Work",
    styleLicense:
      "OpenFreeMap styles (MIT project; OpenMapTiles design CC-BY attribution)",
    hosting: "OpenFreeMap public instance (donation-funded) or self-host",
    recurringLicenseCost: "none",
    commercialConfidence: "high",
    externalDependency: "tiles.openfreemap.org (optional if self-hosted)",
    selfHostPossible: true,
    notes: "Commercial use allowed; attribution required; no API key.",
  },
  "openfreemap-fiord": {
    id: "openfreemap-fiord",
    label: MAP_FOUNDATION_LABELS["openfreemap-fiord"],
    format: "vector",
    dataLicense: "ODbL (OpenStreetMap) Produced Work",
    styleLicense:
      "OpenFreeMap Fiord fork (OpenMapTiles fiord-color; CC-BY attribution)",
    hosting: "OpenFreeMap public instance or self-host",
    recurringLicenseCost: "none",
    commercialConfidence: "high",
    externalDependency: "tiles.openfreemap.org (optional if self-hosted)",
    selfHostPossible: true,
    notes: "Cooler blue-gray seas; useful maritime visual reference.",
  },
  "openfreemap-premium-proof": {
    id: "openfreemap-premium-proof",
    label: MAP_FOUNDATION_LABELS["openfreemap-premium-proof"],
    format: "vector",
    dataLicense: "ODbL (OpenStreetMap) Produced Work",
    styleLicense:
      "CargoConnect paint overrides on OpenFreeMap Dark (preview only)",
    hosting: "Same OpenFreeMap vector tiles; style JSON mutated client-side",
    recurringLicenseCost: "none",
    commercialConfidence: "high",
    externalDependency: "tiles.openfreemap.org (optional if self-hosted)",
    selfHostPossible: true,
    notes:
      "Visual proof of Premium Maritime direction — not a permanent theme lock.",
  },
};

/**
 * Protomaps / PMTiles is researched as a long-term self-host path, not a live
 * explorer option here (planet ~120GB; demo API is not commercial-safe free).
 */
export const PROTOMAPS_RESEARCH_NOTE = {
  dataLicense: "ODbL Produced Work — © OpenStreetMap attribution required",
  styleLicense: "Protomaps basemap visual design CC0; code BSD-3",
  tileFormat: "PMTiles (vector)",
  hosting:
    "Self-host on object storage (e.g. R2/S3) + CDN; no Recurring Protomaps license",
  demoApi:
    "PAID / REQUIRES APPROVAL for commercial use of Protomaps hosted demo API",
  planetSizeApprox: "~120 GB z0–15",
  mapLibre: "Native via pmtiles protocol",
} as const;

export function isVectorFoundation(id: MapFoundationId): boolean {
  return MAP_FOUNDATION_META[id].format === "vector";
}

/**
 * Resolve basemap style for foundation exploration.
 * Esri path preserves existing theme raster tunes; vector paths ignore Esri tunes
 * unless Day View requests premium blue water paint overrides.
 */
export async function resolveMapFoundationStyle(
  foundationId: MapFoundationId,
  envStyleUrl: string | undefined,
  theme: OverlayTheme,
): Promise<string | StyleSpecification> {
  const wantsDaySea = theme.id === "day-view";

  switch (foundationId) {
    case "current-esri":
      return resolveMapStyleForTheme(envStyleUrl, theme);
    case "openfreemap-dark":
      if (wantsDaySea) {
        return buildOpenFreeMapDayViewStyle(OPENFREEMAP_STYLE_DARK);
      }
      return OPENFREEMAP_STYLE_DARK;
    case "openfreemap-fiord":
      if (wantsDaySea) {
        return buildOpenFreeMapDayViewStyle(OPENFREEMAP_STYLE_FIORD);
      }
      return OPENFREEMAP_STYLE_FIORD;
    case "openfreemap-premium-proof":
      if (wantsDaySea) {
        // Liberty land + day maritime water — clearer daytime premium blue sea.
        return buildOpenFreeMapDayViewStyle(OPENFREEMAP_STYLE_LIBERTY);
      }
      return buildOpenFreeMapPremiumProofStyle();
    default:
      return resolveMapStyleForTheme(envStyleUrl, theme);
  }
}

/** Day View vector proof — premium blue sea on OpenFreeMap tiles. */
export async function buildOpenFreeMapDayViewStyle(
  styleUrl: string = OPENFREEMAP_STYLE_LIBERTY,
): Promise<StyleSpecification> {
  const res = await fetch(styleUrl);
  if (!res.ok) {
    throw new Error(`Failed to load OpenFreeMap day style (${res.status})`);
  }
  const style = (await res.json()) as StyleSpecification;
  return applyDayViewMaritimeOverrides(style);
}

/**
 * Bright maritime day: rich blue water, soft land, restrained roads.
 * Overlay layers remain CargoConnect-owned.
 */
export function applyDayViewMaritimeOverrides(
  style: StyleSpecification,
): StyleSpecification {
  const next = structuredClone(style);
  next.name = "CargoConnect Day View (OFM)";

  for (const layer of next.layers ?? []) {
    const id = layer.id;
    const paint = (layer.paint ?? {}) as Record<string, unknown>;
    layer.paint = paint as typeof layer.paint;

    if (layer.type === "background") {
      paint["background-color"] = "#7eb6d9";
      continue;
    }

    if (id === "water" || id === "waterway") {
      if (layer.type === "fill") {
        paint["fill-color"] = "#1a7bb8";
        paint["fill-opacity"] = 1;
      }
      if (layer.type === "line") {
        paint["line-color"] = "#156fa8";
        paint["line-opacity"] = 0.9;
      }
      continue;
    }

    if (id === "water_name" || id.startsWith("water_name")) {
      paint["text-color"] = "rgba(255, 255, 255, 0.72)";
      paint["text-halo-color"] = "rgba(12, 74, 110, 0.55)";
      paint["text-halo-width"] = 1.2;
      continue;
    }

    if (id.startsWith("landuse_") || id.startsWith("landcover_")) {
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.55;
        paint["fill-color"] = "#e8e2d4";
      }
      continue;
    }

    if (id === "landcover" || id === "landuse") {
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.5;
      }
      continue;
    }

    if (id === "building") {
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.35;
        paint["fill-color"] = "#d4cfc4";
        paint["fill-outline-color"] = "#c4bfb4";
      }
      continue;
    }

    if (id.startsWith("boundary_")) {
      if (layer.type === "line") {
        paint["line-color"] = "rgba(71, 85, 105, 0.35)";
        paint["line-opacity"] = 0.45;
        paint["line-width"] = 0.7;
      }
      continue;
    }

    if (
      id.startsWith("highway_") ||
      id.startsWith("railway") ||
      id.startsWith("road_") ||
      id.startsWith("aeroway")
    ) {
      if (layer.type === "line") {
        paint["line-opacity"] = 0.22;
      }
      if (layer.type === "symbol") {
        paint["icon-opacity"] = 0.15;
        paint["text-opacity"] = 0.2;
      }
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.12;
      }
      continue;
    }

    if (id.startsWith("place_")) {
      if (layer.type === "symbol") {
        const quiet =
          id.includes("suburb") ||
          id.includes("village") ||
          id.includes("other") ||
          id.includes("town");
        paint["text-opacity"] = quiet ? 0.35 : 0.7;
        paint["text-color"] = "rgba(30, 41, 59, 0.85)";
        paint["text-halo-color"] = "rgba(255, 255, 255, 0.75)";
        paint["icon-opacity"] = 0.4;
        if (quiet && layer.minzoom == null) {
          layer.minzoom = 7.5;
        }
      }
      continue;
    }
  }

  return next;
}

/** Client-side Premium Maritime proof on OpenFreeMap Dark vector tiles. */
export async function buildOpenFreeMapPremiumProofStyle(): Promise<StyleSpecification> {
  const res = await fetch(OPENFREEMAP_STYLE_DARK);
  if (!res.ok) {
    throw new Error(`Failed to load OpenFreeMap dark style (${res.status})`);
  }
  const style = (await res.json()) as StyleSpecification;
  return applyPremiumMaritimeProofOverrides(style);
}

/**
 * Isolate basemap foundation quality: quieter land, navy sea, suppressed roads,
 * restrained labels. Overlay layers remain CargoConnect-owned.
 */
export function applyPremiumMaritimeProofOverrides(
  style: StyleSpecification,
): StyleSpecification {
  const next = structuredClone(style);
  next.name = "CargoConnect Premium Maritime Proof (OFM)";

  for (const layer of next.layers ?? []) {
    const id = layer.id;
    const paint = (layer.paint ?? {}) as Record<string, unknown>;
    layer.paint = paint as typeof layer.paint;

    if (layer.type === "background") {
      paint["background-color"] = "#141c28";
      continue;
    }

    if (id === "water" || id === "waterway") {
      if (layer.type === "fill") {
        paint["fill-color"] = "#071018";
        paint["fill-opacity"] = 1;
      }
      if (layer.type === "line") {
        paint["line-color"] = "#0a1624";
        paint["line-opacity"] = 0.85;
      }
      continue;
    }

    if (id === "water_name") {
      paint["text-color"] = "rgba(148, 183, 198, 0.55)";
      paint["text-halo-color"] = "rgba(4, 10, 18, 0.75)";
      paint["text-halo-width"] = 1.1;
      continue;
    }

    if (id.startsWith("landuse_") || id.startsWith("landcover_")) {
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.18;
        paint["fill-color"] = "#1a2433";
      }
      continue;
    }

    if (id === "building") {
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.25;
        paint["fill-color"] = "#121820";
        paint["fill-outline-color"] = "#1c2430";
      }
      continue;
    }

    if (id.startsWith("boundary_")) {
      if (layer.type === "line") {
        paint["line-color"] = "rgba(100, 116, 139, 0.22)";
        paint["line-opacity"] = 0.35;
        paint["line-width"] = 0.6;
        paint["line-blur"] = 0;
      }
      continue;
    }

    if (
      id.startsWith("highway_") ||
      id.startsWith("railway") ||
      id.startsWith("road_") ||
      id.startsWith("aeroway")
    ) {
      if (layer.type === "line") {
        paint["line-opacity"] = 0.08;
      }
      if (layer.type === "symbol") {
        paint["icon-opacity"] = 0;
        paint["text-opacity"] = 0;
      }
      if (layer.type === "fill") {
        paint["fill-opacity"] = 0.05;
      }
      continue;
    }

    if (id.startsWith("place_")) {
      if (layer.type === "symbol") {
        const quiet =
          id.includes("suburb") ||
          id.includes("village") ||
          id.includes("other") ||
          id.includes("town");
        paint["text-opacity"] = quiet ? 0.2 : 0.45;
        paint["text-color"] = "rgba(148, 163, 184, 0.7)";
        paint["text-halo-color"] = "rgba(6, 12, 22, 0.85)";
        paint["icon-opacity"] = 0.25;
        if (quiet && layer.minzoom == null) {
          layer.minzoom = 8;
        }
        if (id.includes("city") && layer.minzoom == null) {
          layer.minzoom = 4.5;
        }
      }
      continue;
    }
  }

  return next;
}
