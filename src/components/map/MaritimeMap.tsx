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
import type { MaritimeCorridor } from "@/domain/search/types";
import { appConfig } from "@/lib/config/env";
import {
  corridorToGeoJSON,
  interpolateAlongRoute,
  portsToGeoJSON,
  routesToGeoJSON,
  vesselsToGeoJSON,
} from "@/lib/map/geo";
import { INITIAL_MAP_VIEW, resolveMapStyleForTheme } from "@/lib/map/style";
import { ensureMapLibreWorker } from "@/lib/map/setupWorker";
import { registerVesselIcons } from "@/lib/map/vesselIcons";
import {
  THEME_PREMIUM_MARITIME,
  type OverlayTheme,
} from "@/lib/map/visualThemes";
import {
  DEFAULT_MAP_FOUNDATION_ID,
  resolveMapFoundationStyle,
  type MapFoundationId,
} from "@/lib/map/mapFoundations";

const VESSELS_SOURCE = "cc-vessels";
const PORTS_SOURCE = "cc-ports";
const ROUTES_SOURCE = "cc-routes";
const CORRIDOR_SOURCE = "cc-corridor";
const INTERACTIVE_LAYERS = [
  "cc-vessels-symbol",
  "cc-vessels-dot",
  "cc-vessels-cluster",
  "cc-ports-hit",
];

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
  /** Active visual/search corridor (NL route search). */
  corridor?: MaritimeCorridor | null;
  originPortId?: string | null;
  destinationPortId?: string | null;
  /** Alternate destination candidates to show as subtle markers. */
  candidatePortIds?: string[];
  highlightCandidatePortId?: string | null;
  relevantVesselIds?: string[];
  searchActive?: boolean;
  onVesselHover: (id: string | null, x: number, y: number) => void;
  onPortHover: (id: string | null, x: number, y: number) => void;
  onVesselClick: (id: string) => void;
  onPortClick: (id: string) => void;
  onMapClick: () => void;
  /** Debounced by parent — reports camera bounds for viewport AIS. */
  onViewportChange?: (viewport: {
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
  }) => void;
  /** Visual-only overlay/basemap theme (beautification exploration). */
  visualTheme?: OverlayTheme;
  /** Visual-only map foundation (research / proof exploration). */
  mapFoundationId?: MapFoundationId;
  /** One-shot camera focus on a port (token changes re-trigger). */
  focusPort?: {
    longitude: number;
    latitude: number;
    zoom?: number;
    token: number;
  } | null;
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
  corridor = null,
  originPortId = null,
  destinationPortId = null,
  candidatePortIds = [],
  highlightCandidatePortId = null,
  relevantVesselIds = [],
  searchActive = false,
  onVesselHover,
  onPortHover,
  onVesselClick,
  onPortClick,
  onMapClick,
  onViewportChange,
  visualTheme = THEME_PREMIUM_MARITIME,
  mapFoundationId = DEFAULT_MAP_FOUNDATION_ID,
  focusPort = null,
}: MaritimeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);
  const themeRef = useRef(visualTheme);
  themeRef.current = visualTheme;
  const foundationRef = useRef(mapFoundationId);
  foundationRef.current = mapFoundationId;
  const vesselMotionRef = useRef<Vessel[]>(vessels);
  const routesRef = useRef(routes);
  const portsRef = useRef(ports);
  const relevantRef = useRef(new Set(relevantVesselIds));
  const searchActiveRef = useRef(searchActive);
  const originPortIdRef = useRef(originPortId);
  const destinationPortIdRef = useRef(destinationPortId);
  const candidatePortIdsRef = useRef(candidatePortIds);
  const highlightCandidatePortIdRef = useRef(highlightCandidatePortId);
  const corridorRef = useRef(corridor);
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
    onViewportChange,
  });

  useEffect(() => {
    handlersRef.current = {
      onVesselHover,
      onPortHover,
      onVesselClick,
      onPortClick,
      onMapClick,
      onViewportChange,
    };
  }, [onVesselHover, onPortHover, onVesselClick, onPortClick, onMapClick, onViewportChange]);

  useEffect(() => {
    vesselMotionRef.current = vessels;
    routesRef.current = routes;
    portsRef.current = ports;
    relevantRef.current = new Set(relevantVesselIds);
    searchActiveRef.current = searchActive;
    originPortIdRef.current = originPortId;
    destinationPortIdRef.current = destinationPortId;
    candidatePortIdsRef.current = candidatePortIds;
    highlightCandidatePortIdRef.current = highlightCandidatePortId;
    corridorRef.current = corridor;
  }, [
    vessels,
    routes,
    ports,
    relevantVesselIds,
    searchActive,
    originPortId,
    destinationPortId,
    candidatePortIds,
    highlightCandidatePortId,
    corridor,
  ]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    let map: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const onWindowResize = () => map?.resize();

    const boot = async () => {
      ensureMapLibreWorker();

      let style;
      try {
        style = await resolveMapFoundationStyle(
          foundationRef.current,
          appConfig.mapStyleUrl,
          themeRef.current,
        );
      } catch (err) {
        console.warn("[CargoConnect map] foundation style failed; falling back to Esri", err);
        style = resolveMapStyleForTheme(appConfig.mapStyleUrl, themeRef.current);
        setStyleFailed(true);
      }

      if (cancelled || !containerRef.current) return;

      const camera = initialViewRef.current;
      map = new MapLibreMap({
        container: containerRef.current,
        style,
        center: camera.center,
        zoom: camera.zoom,
        minZoom: camera.minZoom ?? INITIAL_MAP_VIEW.minZoom,
        maxZoom: camera.maxZoom ?? INITIAL_MAP_VIEW.maxZoom,
        attributionControl: { compact: true },
        pitch: 0,
        maxPitch: 0,
        fadeDuration: 0,
        renderWorldCopies: true,
        refreshExpiredTiles: false,
        maxTileCacheSize: 80,
      });

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
        map!.on("mousemove", layerId, (e: MapLayerMouseEvent) => {
          if (interactingRef.current || map!.isMoving()) return;
          map!.getCanvas().style.cursor = "pointer";
          const id = String(e.features?.[0]?.properties?.id ?? "");
          if (id) onHover(id, e.point.x, e.point.y);
        });
        map!.on("mouseleave", layerId, () => {
          map!.getCanvas().style.cursor = "";
          onHover(null, 0, 0);
        });
      };

      const seedOverlayData = () => {
        const portsSource = map!.getSource(PORTS_SOURCE) as GeoJSONSource | undefined;
        const routesSource = map!.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined;
        const vesselsSource = map!.getSource(VESSELS_SOURCE) as GeoJSONSource | undefined;
        const corridorSource = map!.getSource(CORRIDOR_SOURCE) as GeoJSONSource | undefined;
        portsSource?.setData(
          portsToGeoJSON(portsRef.current, {
            originId: originPortIdRef.current ?? undefined,
            destinationId: destinationPortIdRef.current ?? undefined,
            candidateIds: candidatePortIdsRef.current,
            highlightCandidateId: highlightCandidatePortIdRef.current,
          }),
        );
        routesSource?.setData(
          routesToGeoJSON(searchActiveRef.current ? [] : routesRef.current),
        );
        corridorSource?.setData(corridorToGeoJSON(corridorRef.current ?? undefined));
        vesselsSource?.setData(
          vesselsToGeoJSON(vesselMotionRef.current, {
            relevantIds: relevantRef.current,
            searchActive: searchActiveRef.current,
          }),
        );
      };

      const attachOverlayLayers = () => {
        if (layersAttachedRef.current || !mapRef.current) return;
        try {
          registerVesselIcons(map!, themeRef.current);
          addLayers(map!, themeRef.current);
          seedOverlayData();

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
          map!.resize();
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
        handlersRef.current.onVesselHover(null, 0, 0);
        handlersRef.current.onPortHover(null, 0, 0);
      };

      const reportViewport = (m: MapLibreMap) => {
        const b = m.getBounds();
        handlersRef.current.onViewportChange?.({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
          zoom: m.getZoom(),
        });
      };

      const endInteraction = () => {
        interactingRef.current = false;
        reportViewport(map!);
      };

      map.on("movestart", beginInteraction);
      map.on("zoomstart", beginInteraction);
      map.on("rotatestart", beginInteraction);
      map.on("pitchstart", beginInteraction);
      map.on("moveend", endInteraction);
      map.on("zoomend", endInteraction);
      map.on("rotateend", endInteraction);
      map.on("pitchend", endInteraction);

      map.once("idle", () => reportViewport(map!));

      map.on("click", (e) => {
        const layers = INTERACTIVE_LAYERS.filter((id) => Boolean(map!.getLayer(id)));
        const features = layers.length
          ? map!.queryRenderedFeatures(e.point, { layers })
          : [];
        if (!features.length) {
          handlersRef.current.onMapClick();
          return;
        }
        const feature = features[0];
        if (feature.layer.id === "cc-vessels-cluster") {
          const clusterId = feature.properties?.cluster_id;
          const source = map!.getSource(VESSELS_SOURCE) as GeoJSONSource | undefined;
          if (source && typeof clusterId === "number") {
            source.getClusterExpansionZoom(clusterId)
              .then((zoom) => {
                const coords = (feature.geometry as GeoJSON.Point).coordinates as [
                  number,
                  number,
                ];
                map!.easeTo({ center: coords, zoom });
              })
              .catch(() => undefined);
          }
          return;
        }
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

      if (cancelled) {
        map.remove();
        mapRef.current = null;
        return;
      }

      resizeObserver = new ResizeObserver(() => {
        map?.resize();
      });
      resizeObserver.observe(containerRef.current);
      window.addEventListener("resize", onWindowResize);

      (window as unknown as { __ccMap?: MapLibreMap }).__ccMap = map;
    };

    void boot();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      layersAttachedRef.current = false;
      delete (window as unknown as { __ccMap?: MapLibreMap }).__ccMap;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  // Static port/route/corridor data — only when underlying data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const portsSource = map.getSource(PORTS_SOURCE) as GeoJSONSource | undefined;
    const routesSource = map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined;
    const corridorSource = map.getSource(CORRIDOR_SOURCE) as GeoJSONSource | undefined;
    portsSource?.setData(
      portsToGeoJSON(ports, {
        originId: originPortId ?? undefined,
        destinationId: destinationPortId ?? undefined,
        candidateIds: candidatePortIds,
        highlightCandidateId: highlightCandidatePortId,
      }),
    );
    // Hide demo routes while a search corridor is active
    routesSource?.setData(routesToGeoJSON(searchActive ? [] : routes));
    corridorSource?.setData(corridorToGeoJSON(corridor ?? undefined));
  }, [
    ports,
    routes,
    mapReady,
    corridor,
    originPortId,
    destinationPortId,
    candidatePortIds,
    highlightCandidatePortId,
    searchActive,
  ]);

  // Fit camera to corridor when search becomes active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !searchActive || !corridor?.waypoints.length) return;
    const lngs = corridor.waypoints.map((p) => p.longitude);
    const lats = corridor.waypoints.map((p) => p.latitude);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    map.fitBounds(bounds, { padding: 80, duration: 1200, maxZoom: 6.5 });
  }, [searchActive, corridor, mapReady]);

  // Zoom to a specific port when the route switcher requests focus
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusPort) return;
    map.easeTo({
      center: [focusPort.longitude, focusPort.latitude],
      zoom: focusPort.zoom ?? 7.2,
      duration: 900,
    });
  }, [focusPort, mapReady]);

  // Subtle corridor glow pulse — paint only, never setData / never per-frame scoring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !searchActive) return;
    const pulseBright = visualTheme.corridor.glowPulseBright;
    const pulseDim = visualTheme.corridor.glowPulseDim;
    const pulseRest = visualTheme.corridor.glowOpacity;
    let bright = false;
    const id = window.setInterval(() => {
      if (!map.getLayer("cc-corridor-glow") || interactingRef.current) return;
      bright = !bright;
      map.setPaintProperty("cc-corridor-glow", "line-opacity", bright ? pulseBright : pulseDim);
    }, 1100);
    return () => {
      window.clearInterval(id);
      if (map.getLayer("cc-corridor-glow")) {
        map.setPaintProperty("cc-corridor-glow", "line-opacity", pulseRest);
      }
    };
  }, [searchActive, mapReady, visualTheme]);

  // Static vessel positions when demo route animation is off (live AIS).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || demoMotionEnabled) return;
    const source = map.getSource(VESSELS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(
      vesselsToGeoJSON(vessels, {
        relevantIds: new Set(relevantVesselIds),
        searchActive,
      }),
    );
  }, [vessels, mapReady, demoMotionEnabled, relevantVesselIds, searchActive]);

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
      source?.setData(
        vesselsToGeoJSON(animated, {
          relevantIds: relevantRef.current,
          searchActive: searchActiveRef.current,
        }),
      );
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
    <div className="absolute inset-0 z-0" style={{ background: "var(--background, #0b1520)" }}>
      <div ref={containerRef} className="cc-map-canvas absolute inset-0 h-full w-full" />
      {overlayMessage ? (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300/30 bg-amber-950/70 px-4 py-2 text-xs text-amber-100">
          {overlayMessage}
        </div>
      ) : null}
    </div>
  );
});

function addLayers(map: MapLibreMap, theme: OverlayTheme) {
  for (const id of [
    "cc-vessels-symbol",
    "cc-vessels-dot",
    "cc-vessels-halo",
    "cc-vessels-relevant-halo",
    "cc-vessels-cluster",
    "cc-vessels-cluster-count",
    "cc-ports-label",
    "cc-ports-hit",
    "cc-ports-core",
    "cc-ports-halo",
    "cc-routes-glow",
    "cc-routes-line",
    "cc-corridor-glow",
    "cc-corridor-underlay",
    "cc-corridor-line",
    "cc-corridor-dash",
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [VESSELS_SOURCE, PORTS_SOURCE, ROUTES_SOURCE, CORRIDOR_SOURCE]) {
    if (map.getSource(id)) map.removeSource(id);
  }

  map.addSource(ROUTES_SOURCE, {
    type: "geojson",
    data: routesToGeoJSON([]),
  });
  map.addSource(CORRIDOR_SOURCE, {
    type: "geojson",
    data: corridorToGeoJSON(undefined),
  });
  map.addSource(PORTS_SOURCE, {
    type: "geojson",
    data: portsToGeoJSON([]),
  });
  map.addSource(VESSELS_SOURCE, {
    type: "geojson",
    data: vesselsToGeoJSON([]),
    cluster: true,
    clusterMaxZoom: 5,
    clusterRadius: 42,
  });

  const c = theme.corridor;
  const p = theme.ports;
  const v = theme.vessels;
  const cl = theme.clusters;
  const scale = v.iconScale;

  map.addLayer({
    id: "cc-routes-glow",
    type: "line",
    source: ROUTES_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme.routes.glowColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 3, 5, 4.2, 8, 5],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.18, 5, 0.12],
    },
  });

  map.addLayer({
    id: "cc-routes-line",
    type: "line",
    source: ROUTES_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme.routes.lineColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.2, 5, 1.6, 8, 2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.58, 5, 0.48],
      "line-dasharray": [1.5, 2.4],
    },
  });

  map.addLayer({
    id: "cc-corridor-glow",
    type: "line",
    source: CORRIDOR_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": c.glowColor,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        c.glowWidth[0],
        5,
        c.glowWidth[1],
        8,
        c.glowWidth[2],
      ],
      "line-opacity": c.glowOpacity,
    },
  });

  map.addLayer({
    id: "cc-corridor-underlay",
    type: "line",
    source: CORRIDOR_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": c.underlayColor,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        c.underlayWidth[0],
        5,
        c.underlayWidth[1],
        8,
        c.underlayWidth[2],
      ],
      "line-opacity": c.underlayOpacity,
    },
  });

  map.addLayer({
    id: "cc-corridor-line",
    type: "line",
    source: CORRIDOR_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": c.coreColor,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        c.coreWidth[0],
        5,
        c.coreWidth[1],
        8,
        c.coreWidth[2],
      ],
      "line-opacity": c.coreOpacity,
    },
  });

  map.addLayer({
    id: "cc-corridor-dash",
    type: "line",
    source: CORRIDOR_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": c.dashColor,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        c.dashWidth[0],
        5,
        c.dashWidth[1],
      ],
      "line-opacity": c.dashOpacity,
      "line-dasharray": [0.5, 2.2],
    },
  });

  map.addLayer({
    id: "cc-ports-halo",
    type: "circle",
    source: PORTS_SOURCE,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          12,
          7.5,
        ],
        6,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          18,
          11,
        ],
      ],
      "circle-color": [
        "case",
        ["==", ["get", "role"], "origin"],
        p.originHalo,
        ["==", ["get", "role"], "destination"],
        p.destHalo,
        ["==", ["get", "role"], "candidate_hover"],
        p.candidateHoverHalo,
        ["==", ["get", "role"], "candidate"],
        p.candidateHalo,
        p.defaultHalo,
      ],
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          0.38,
          ["in", ["get", "role"], ["literal", ["candidate", "candidate_hover"]]],
          0.18,
          0.24,
        ],
        5,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          0.38,
          ["in", ["get", "role"], ["literal", ["candidate", "candidate_hover"]]],
          0.24,
          0.18,
        ],
      ],
    },
  });

  map.addLayer({
    id: "cc-ports-core",
    type: "circle",
    source: PORTS_SOURCE,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          5.5,
          ["==", ["get", "role"], "candidate_hover"],
          4.5,
          ["==", ["get", "role"], "candidate"],
          3.2,
          4,
        ],
        4,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          6,
          ["==", ["get", "role"], "candidate_hover"],
          5,
          ["==", ["get", "role"], "candidate"],
          3.6,
          4.5,
        ],
        6,
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          7.2,
          ["==", ["get", "role"], "candidate_hover"],
          5.8,
          ["==", ["get", "role"], "candidate"],
          4.4,
          5.5,
        ],
      ],
      "circle-color": [
        "case",
        ["==", ["get", "role"], "origin"],
        p.originCore,
        ["==", ["get", "role"], "candidate"],
        p.candidateCore,
        ["==", ["get", "role"], "candidate_hover"],
        p.candidateHoverCore,
        p.destCore,
      ],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "role"], "origin"],
        p.originStroke,
        ["==", ["get", "role"], "destination"],
        p.destStroke,
        ["==", ["get", "role"], "candidate_hover"],
        p.candidateHoverStroke,
        ["==", ["get", "role"], "candidate"],
        p.candidateStroke,
        p.destStroke,
      ],
      "circle-stroke-width": [
        "case",
        ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
        1.5,
        ["==", ["get", "role"], "candidate_hover"],
        1.25,
        ["==", ["get", "role"], "candidate"],
        1,
        1.4,
      ],
      "circle-opacity": [
        "case",
        ["==", ["get", "role"], "candidate"],
        0.72,
        1,
      ],
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
    minzoom: p.labelMinZoom,
    layout: {
      "text-field": [
        "step",
        ["zoom"],
        [
          "case",
          ["in", ["get", "role"], ["literal", ["origin", "destination"]]],
          ["get", "name"],
          "",
        ],
        p.labelMinZoom + 0.8,
        ["get", "name"],
      ],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        p.labelMinZoom,
        9.5,
        5,
        11,
      ],
      "text-offset": [0, 1.35],
      "text-anchor": "top",
      "text-optional": true,
      "text-allow-overlap": false,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": p.labelColor,
      "text-halo-color": p.labelHalo,
      "text-halo-width": 1.2,
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        p.labelMinZoom,
        0.5,
        p.labelMinZoom + 1,
        0.92,
      ],
    },
  });

  map.addLayer({
    id: "cc-vessels-cluster",
    type: "circle",
    source: VESSELS_SOURCE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": cl.fill,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        cl.radii[0],
        25,
        cl.radii[1],
        100,
        cl.radii[2],
      ],
      "circle-opacity": cl.opacity,
      "circle-stroke-width": cl.strokeWidth,
      "circle-stroke-color": cl.stroke,
    },
  });

  map.addLayer({
    id: "cc-vessels-cluster-count",
    type: "symbol",
    source: VESSELS_SOURCE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": cl.textSize,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": cl.textColor,
    },
  });

  map.addLayer({
    id: "cc-vessels-halo",
    type: "circle",
    source: VESSELS_SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 7, 4, 8.5, 6, 10],
      "circle-color": v.haloColor,
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        [
          "case",
          ["==", ["get", "muted"], 1],
          0.04,
          ["==", ["get", "relevant"], 1],
          0.06,
          0.2,
        ],
        5,
        [
          "case",
          ["==", ["get", "muted"], 1],
          0.04,
          ["==", ["get", "relevant"], 1],
          0.06,
          0.14,
        ],
      ],
    },
  });

  map.addLayer({
    id: "cc-vessels-relevant-halo",
    type: "circle",
    source: VESSELS_SOURCE,
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "relevant"], 1],
    ],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 11, 5, 14, 7, 17],
      "circle-color": v.relevantHaloColor,
      "circle-opacity": v.relevantHaloOpacity,
    },
  });

  map.addLayer({
    id: "cc-vessels-dot",
    type: "circle",
    source: VESSELS_SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        ["case", ["==", ["get", "relevant"], 1], 4.2, 3.2],
        4,
        ["case", ["==", ["get", "relevant"], 1], 4.8, 3.8],
        6,
        ["case", ["==", ["get", "relevant"], 1], 5.6, 4.4],
      ],
      "circle-color": [
        "case",
        ["==", ["get", "relevant"], 1],
        v.dotRelevant,
        ["==", ["get", "muted"], 1],
        v.dotMuted,
        v.dotDefault,
      ],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "relevant"], 1],
        v.strokeRelevant,
        v.strokeDefault,
      ],
      "circle-stroke-width": ["case", ["==", ["get", "relevant"], 1], 1.5, 1],
      "circle-opacity": ["case", ["==", ["get", "muted"], 1], 0.28, 1],
    },
  });

  map.addLayer({
    id: "cc-vessels-symbol",
    type: "symbol",
    source: VESSELS_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        ["case", ["==", ["get", "relevant"], 1], 0.82 * scale, 0.7 * scale],
        3.5,
        ["case", ["==", ["get", "relevant"], 1], 0.92 * scale, 0.78 * scale],
        5,
        ["case", ["==", ["get", "relevant"], 1], 1.02 * scale, 0.86 * scale],
        7,
        ["case", ["==", ["get", "relevant"], 1], 1.15 * scale, 0.98 * scale],
      ],
      "icon-rotate": ["get", "course"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-padding": 1,
      "text-field": ["step", ["zoom"], "", v.labelMinZoom, ["get", "name"]],
      "text-size": 9.5,
      "text-offset": [0, 1.65],
      "text-anchor": "top",
      "text-optional": true,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": v.labelColor,
      "text-halo-color": v.labelHalo,
      "text-halo-width": 1.1,
      "icon-opacity": ["case", ["==", ["get", "muted"], 1], 0.3, 1],
    },
  });
}
