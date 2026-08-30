"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MaritimeRoute, Port, Vessel } from "@/domain/models";
import { appConfig } from "@/lib/config/env";
import {
  interpolateAlongRoute,
  portsToGeoJSON,
  routesToGeoJSON,
  vesselsToGeoJSON,
} from "@/lib/map/geo";
import { INITIAL_MAP_VIEW, resolveMapStyle } from "@/lib/map/style";
import { ensureMapLibreWorker } from "@/lib/map/setupWorker";
import { registerVesselIcons } from "@/lib/map/vesselIcons";

const VESSELS_SOURCE = "cc-vessels";
const PORTS_SOURCE = "cc-ports";
const ROUTES_SOURCE = "cc-routes";
const INTERACTIVE_LAYERS = ["cc-vessels-symbol", "cc-vessels-dot", "cc-ports-hit"];

/** Idle vessel motion cadence — NOT every paint frame (setData is expensive). */
const VESSEL_ANIM_INTERVAL_MS = 200;

interface MaritimeMapProps {
  vessels: Vessel[];
  ports: Port[];
  routes: MaritimeRoute[];
  /** When false, vessels stay at reported positions (live AIS). Demo animation needs routes. */
  allowDemoAnimation?: boolean;
  /** Camera override (e.g. Eastern Med for live prototype). */
  initialView?: {
    center: [number, number];
    zoom: number;
    minZoom?: number;
    maxZoom?: number;
  };
  onVesselHover: (id: string | null, x: number, y: number) => void;
  onPortHover: (id: string | null, x: number, y: number) => void;
  onVesselClick: (id: string) => void;
  onPortClick: (id: string) => void;
  onMapClick: () => void;
}

/**
 * Full-screen MapLibre canvas.
 * Vessel motion is throttled and paused during user navigation so zoom/pan stay fluid.
 */
export const MaritimeMap = memo(function MaritimeMap({
  vessels,
  ports,
  routes,
  allowDemoAnimation = true,
  initialView,
  onVesselHover,
  onPortHover,
  onVesselClick,
  onPortClick,
  onMapClick,
}: MaritimeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);
  const vesselMotionRef = useRef<Vessel[]>(vessels);
  const routesRef = useRef(routes);
  const portsRef = useRef(ports);
  const layersAttachedRef = useRef(false);
  const interactingRef = useRef(false);
  const animStartedRef = useRef(0);
  const lastAnimAtRef = useRef(0);
  const view = initialView ?? INITIAL_MAP_VIEW;
  const demoMotionEnabled = allowDemoAnimation && routes.length > 0;
  const initialViewRef = useRef(view);
  // Capture first mount camera only — avoid remounting MapLibre on mode flickers
  if (!mapRef.current) {
    initialViewRef.current = view;
  }

  const handlersRef = useRef({
    onVesselHover,
    onPortHover,
    onVesselClick,
    onPortClick,
    onMapClick,
  });

  useEffect(() => {
    handlersRef.current = {
      onVesselHover,
      onPortHover,
      onVesselClick,
      onPortClick,
      onMapClick,
    };
  }, [onVesselHover, onPortHover, onVesselClick, onPortClick, onMapClick]);

  useEffect(() => {
    vesselMotionRef.current = vessels;
    routesRef.current = routes;
    portsRef.current = ports;
  }, [vessels, routes, ports]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureMapLibreWorker();

    const style = resolveMapStyle(appConfig.mapStyleUrl);

    const camera = initialViewRef.current;
    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center: camera.center,
      zoom: camera.zoom,
      minZoom: camera.minZoom ?? INITIAL_MAP_VIEW.minZoom,
      maxZoom: camera.maxZoom ?? INITIAL_MAP_VIEW.maxZoom,
      attributionControl: { compact: true },
      pitch: 0,
      maxPitch: 0,
      // Snappy tile cross-fades; avoid laggy fade during wheel zoom
      fadeDuration: 0,
      renderWorldCopies: true,
      // Prefer immediate camera response over heavy post-processing
      refreshExpiredTiles: false,
      maxTileCacheSize: 80,
    });

    // Natural wheel/trackpad feel (MapLibre defaults are conservative)
    map.scrollZoom.setWheelZoomRate(1 / 350);
    map.scrollZoom.setZoomRate(1 / 90);
    map.dragPan.enable();
    map.touchZoomRotate.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();

    map.addControl(new NavigationControl({ visualizePitch: false }), "bottom-right");
    mapRef.current = map;

    const bindLayerHover = (
      layerId: string,
      onHover: (id: string | null, x: number, y: number) => void,
    ) => {
      map.on("mousemove", layerId, (e: MapLayerMouseEvent) => {
        // Skip hover work while the camera is moving — protects FPS during zoom
        if (interactingRef.current || map.isMoving()) return;
        map.getCanvas().style.cursor = "pointer";
        const id = String(e.features?.[0]?.properties?.id ?? "");
        if (id) onHover(id, e.point.x, e.point.y);
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        onHover(null, 0, 0);
      });
    };

    const seedOverlayData = () => {
      const portsSource = map.getSource(PORTS_SOURCE) as GeoJSONSource | undefined;
      const routesSource = map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined;
      const vesselsSource = map.getSource(VESSELS_SOURCE) as GeoJSONSource | undefined;
      portsSource?.setData(portsToGeoJSON(portsRef.current));
      routesSource?.setData(routesToGeoJSON(routesRef.current));
      vesselsSource?.setData(vesselsToGeoJSON(vesselMotionRef.current));
    };

    const attachOverlayLayers = () => {
      if (layersAttachedRef.current || !mapRef.current) return;
      try {
        registerVesselIcons(map);
        addLayers(map);
        seedOverlayData();

        // Worker may still be warming up on first paint — re-seed once.
        window.setTimeout(() => {
          if (!mapRef.current) return;
          seedOverlayData();
        }, 120);

        layersAttachedRef.current = true;
        setMapReady(true);
        setStyleFailed(false);
        bindLayerHover("cc-vessels-symbol", (id, x, y) =>
          handlersRef.current.onVesselHover(id, x, y),
        );
        bindLayerHover("cc-vessels-dot", (id, x, y) =>
          handlersRef.current.onVesselHover(id, x, y),
        );
        bindLayerHover("cc-ports-hit", (id, x, y) =>
          handlersRef.current.onPortHover(id, x, y),
        );
      } catch (err) {
        console.error("[CargoConnect map] failed to attach overlay layers", err);
        setStyleFailed(true);
      }
      requestAnimationFrame(() => {
        map.resize();
      });
    };

    map.on("load", attachOverlayLayers);
    if (map.loaded()) {
      attachOverlayLayers();
    }

    map.on("error", (event) => {
      const message = event.error?.message ?? String(event.error ?? "");
      console.warn("[CargoConnect map]", message);
      if (/style|sprites|Failed to fetch|Load failed|NetworkError/i.test(message)) {
        setStyleFailed(true);
      }
    });

    const beginInteraction = () => {
      interactingRef.current = true;
      // Clear hover once — avoids React work every wheel tick
      handlersRef.current.onVesselHover(null, 0, 0);
      handlersRef.current.onPortHover(null, 0, 0);
    };
    const endInteraction = () => {
      interactingRef.current = false;
    };

    map.on("movestart", beginInteraction);
    map.on("zoomstart", beginInteraction);
    map.on("rotatestart", beginInteraction);
    map.on("pitchstart", beginInteraction);
    map.on("moveend", endInteraction);
    map.on("zoomend", endInteraction);
    map.on("rotateend", endInteraction);
    map.on("pitchend", endInteraction);

    map.on("click", (e) => {
      const layers = INTERACTIVE_LAYERS.filter((id) => Boolean(map.getLayer(id)));
      const features = layers.length
        ? map.queryRenderedFeatures(e.point, { layers })
        : [];
      if (!features.length) {
        handlersRef.current.onMapClick();
        return;
      }
      const feature = features[0];
      const id = String(feature.properties?.id ?? "");
      if (!id) return;
      if (
        feature.layer.id === "cc-vessels-symbol" ||
        feature.layer.id === "cc-vessels-dot"
      ) {
        handlersRef.current.onVesselClick(id);
      } else {
        handlersRef.current.onPortClick(id);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize during layout thrash
      map.resize();
    });
    resizeObserver.observe(containerRef.current);
    const onWindowResize = () => map.resize();
    window.addEventListener("resize", onWindowResize);

    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __ccMap?: MapLibreMap }).__ccMap = map;
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
      layersAttachedRef.current = false;
      if (process.env.NODE_ENV === "development") {
        delete (window as unknown as { __ccMap?: MapLibreMap }).__ccMap;
      }
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Static port/route data — only when underlying data changes (not every frame)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const portsSource = map.getSource(PORTS_SOURCE) as GeoJSONSource | undefined;
    const routesSource = map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined;
    portsSource?.setData(portsToGeoJSON(ports));
    routesSource?.setData(routesToGeoJSON(routes));
  }, [ports, routes, mapReady]);

  // Static vessel positions when demo route animation is off (live AIS).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || demoMotionEnabled) return;
    const source = map.getSource(VESSELS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(vesselsToGeoJSON(vessels));
  }, [vessels, mapReady, demoMotionEnabled]);

  // Throttled demo vessel motion along sample routes only; paused while user zooms/pans.
  // Live AIS vessels are never interpolated onto fabricated routes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !demoMotionEnabled) return;

    let raf = 0;
    animStartedRef.current = performance.now();
    lastAnimAtRef.current = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      // Yield entirely to MapLibre while the camera is moving
      if (
        interactingRef.current ||
        map.isMoving() ||
        map.isZooming() ||
        map.isRotating()
      ) {
        return;
      }

      if (now - lastAnimAtRef.current < VESSEL_ANIM_INTERVAL_MS) {
        return;
      }
      lastAnimAtRef.current = now;

      const routeIndex = new Map<string, (typeof routesRef.current)[number]>();
      for (const route of routesRef.current) {
        routeIndex.set(`${route.originPortId}→${route.destinationPortId}`, route);
      }

      const elapsedMin = (now - animStartedRef.current) / 60000;
      const animated = vesselMotionRef.current.map((vessel, index) => {
        // Never invent motion for live AIS vessels
        if (vessel.meta?.source === "AISSTREAM") return vessel;
        if (vessel.status !== "underway") return vessel;
        const route = routeIndex.get(
          `${vessel.originPortId ?? ""}→${vessel.destinationPortId ?? ""}`,
        );
        if (!route) return vessel;

        const phase = (index * 0.113) % 1;
        const speedFactor = Math.max(0.12, (vessel.speed ?? 10) / 55);
        const t = (phase + elapsedMin * speedFactor * 0.045) % 1;
        const next = interpolateAlongRoute(route.waypoints, t);
        return {
          ...vessel,
          position: { longitude: next.longitude, latitude: next.latitude },
          course: next.course,
        };
      });

      const source = map.getSource(VESSELS_SOURCE) as GeoJSONSource | undefined;
      source?.setData(vesselsToGeoJSON(animated));
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapReady, demoMotionEnabled]);

  const overlayMessage = useMemo(() => {
    if (styleFailed) {
      return "Map basemap issue detected. Check network access.";
    }
    return null;
  }, [styleFailed]);

  return (
    <div className="absolute inset-0 z-0 bg-[#0b1520]">
      <div ref={containerRef} className="cc-map-canvas absolute inset-0 h-full w-full" />
      {overlayMessage ? (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300/30 bg-amber-950/70 px-4 py-2 text-xs text-amber-100">
          {overlayMessage}
        </div>
      ) : null}
    </div>
  );
});

function addLayers(map: MapLibreMap) {
  for (const id of [
    "cc-vessels-symbol",
    "cc-vessels-dot",
    "cc-vessels-halo",
    "cc-ports-label",
    "cc-ports-hit",
    "cc-ports-core",
    "cc-ports-halo",
    "cc-routes-glow",
    "cc-routes-line",
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [VESSELS_SOURCE, PORTS_SOURCE, ROUTES_SOURCE]) {
    if (map.getSource(id)) map.removeSource(id);
  }

  map.addSource(ROUTES_SOURCE, {
    type: "geojson",
    data: routesToGeoJSON([]),
  });
  map.addSource(PORTS_SOURCE, {
    type: "geojson",
    data: portsToGeoJSON([]),
  });
  map.addSource(VESSELS_SOURCE, {
    type: "geojson",
    data: vesselsToGeoJSON([]),
  });

  // Soft route glow — no line-blur (expensive during zoom)
  map.addLayer({
    id: "cc-routes-glow",
    type: "line",
    source: ROUTES_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#2dd4bf",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 3.5, 5, 5, 8, 6],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.22, 5, 0.14],
    },
  });

  map.addLayer({
    id: "cc-routes-line",
    type: "line",
    source: ROUTES_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#5eead4",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.45, 5, 1.9, 8, 2.4],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.62, 5, 0.5],
      "line-dasharray": [1.5, 2.4],
    },
  });

  map.addLayer({
    id: "cc-ports-halo",
    type: "circle",
    source: PORTS_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 9, 6, 14],
      "circle-color": "#38bdf8",
      // Avoid circle-blur — it is costly while the camera moves
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.28, 5, 0.2],
    },
  });

  map.addLayer({
    id: "cc-ports-core",
    type: "circle",
    source: PORTS_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4.5, 4, 5, 6, 6.2],
      "circle-color": "#e0f2fe",
      "circle-stroke-color": "#0284c7",
      "circle-stroke-width": 1.6,
      "circle-opacity": 1,
    },
  });

  map.addLayer({
    id: "cc-ports-hit",
    type: "circle",
    source: PORTS_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 14, 6, 18],
      "circle-opacity": 0,
    },
  });

  map.addLayer({
    id: "cc-ports-label",
    type: "symbol",
    source: PORTS_SOURCE,
    minzoom: 2.8,
    layout: {
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2.8, 10, 5, 11.5],
      "text-offset": [0, 1.35],
      "text-anchor": "top",
      "text-optional": true,
      "text-allow-overlap": false,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": "rgba(226, 232, 240, 0.92)",
      "text-halo-color": "rgba(8, 16, 28, 0.85)",
      "text-halo-width": 1.4,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 2.8, 0.55, 3.6, 0.95],
    },
  });

  // World view: slightly larger presence so maritime activity reads immediately
  map.addLayer({
    id: "cc-vessels-halo",
    type: "circle",
    source: VESSELS_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 10, 4, 11, 6, 13],
      "circle-color": "#5eead4",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.32, 5, 0.22],
    },
  });

  map.addLayer({
    id: "cc-vessels-dot",
    type: "circle",
    source: VESSELS_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4.2, 4, 4.8, 6, 5.5],
      "circle-color": "#ccfbf1",
      "circle-stroke-color": "#042f2e",
      "circle-stroke-width": 1.3,
      "circle-opacity": 1,
    },
  });

  map.addLayer({
    id: "cc-vessels-symbol",
    type: "symbol",
    source: VESSELS_SOURCE,
    layout: {
      "icon-image": ["get", "icon"],
      // Larger at world zoom so ships read as the hero layer
      "icon-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        0.82,
        3.5,
        0.88,
        5,
        0.95,
        7,
        1.1,
      ],
      "icon-rotate": ["get", "course"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-padding": 1,
      "text-field": ["step", ["zoom"], "", 5.2, ["get", "name"]],
      "text-size": 10,
      "text-offset": [0, 1.75],
      "text-anchor": "top",
      "text-optional": true,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": "#e2e8f0",
      "text-halo-color": "rgba(8,16,28,0.85)",
      "text-halo-width": 1.2,
      "icon-opacity": 1,
    },
  });
}
