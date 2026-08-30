import type { StyleSpecification } from "maplibre-gl";

/**
 * Free MapLibre basemap — no paid API key.
 * ESRI World Ocean Base: clear ocean vs land, coastlines readable, maritime-appropriate.
 * (CARTO public raster tiles now watermark without a key; avoid those.)
 */
export const BUILTIN_OCEAN_STYLE: StyleSpecification = {
  version: 8,
  name: "CargoConnect Ocean",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    "esri-ocean": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri",
      maxzoom: 10,
    },
    "esri-ocean-ref": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Labels &copy; Esri",
      maxzoom: 10,
    },
  },
  layers: [
    {
      id: "esri-ocean-base",
      type: "raster",
      source: "esri-ocean",
      paint: {
        "raster-opacity": 1,
        "raster-brightness-min": 0.05,
        "raster-saturation": -0.25,
        "raster-contrast": 0.1,
      },
    },
    {
      id: "esri-ocean-labels",
      type: "raster",
      source: "esri-ocean-ref",
      paint: {
        "raster-opacity": 0.85,
      },
    },
  ],
};

/** Dark gray alternative (still free, no key). */
export const BUILTIN_DARK_STYLE: StyleSpecification = {
  version: 8,
  name: "CargoConnect Dark Gray",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    "esri-dark": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
      maxzoom: 16,
    },
    "esri-dark-ref": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Labels &copy; Esri",
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: "esri-dark-base",
      type: "raster",
      source: "esri-dark",
      paint: {
        "raster-opacity": 1,
        "raster-saturation": -0.1,
        "raster-contrast": 0.05,
      },
    },
    {
      id: "esri-dark-labels",
      type: "raster",
      source: "esri-dark-ref",
      paint: {
        "raster-opacity": 0.9,
      },
    },
  ],
};

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export const FALLBACK_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const INITIAL_MAP_VIEW = {
  center: [18, 36] as [number, number],
  zoom: 3.55,
  minZoom: 1.5,
  maxZoom: 12,
};

/**
 * Default live/composite camera for the Eastern Mediterranean AIS bbox
 * (≈ Greece, Aegean, Crete, western Turkey, Cyprus approaches).
 * Lon/lat center near the Cyclades / central Aegean.
 */
export const EASTERN_MED_MAP_VIEW = {
  center: [25.2, 37.2] as [number, number],
  zoom: 5.4,
  minZoom: 1.5,
  maxZoom: 12,
};

export type MapInitialView = {
  center: [number, number];
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
};

/**
 * Resolve MapLibre style from env.
 * Defaults to built-in free ESRI ocean style (no API key).
 */
export function resolveMapStyle(envStyleUrl?: string): string | StyleSpecification {
  const value = (envStyleUrl ?? "ocean").trim();
  switch (value) {
    case "ocean":
    case "builtin":
    case "carto-dark-raster": // legacy alias → free ocean style
      return BUILTIN_OCEAN_STYLE;
    case "dark":
    case "dark-gray":
      return BUILTIN_DARK_STYLE;
    default:
      return value;
  }
}
