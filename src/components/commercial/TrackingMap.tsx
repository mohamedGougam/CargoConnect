"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Port, Vessel } from "@/domain/models";
import type { MaritimeCorridor } from "@/domain/search/types";
import {
  corridorToGeoJSON,
  portsToGeoJSON,
  vesselsToGeoJSON,
} from "@/lib/map/geo";
import { resolveMapStyle } from "@/lib/map/style";
import { ensureMapLibreWorker } from "@/lib/map/setupWorker";
import { registerVesselIcons } from "@/lib/map/vesselIcons";

interface TrackingMapProps {
  vessels: Vessel[];
  ports: Port[];
  corridor?: MaritimeCorridor | null;
  originPortId?: string | null;
  destinationPortId?: string | null;
  relevantVesselIds?: string[];
  trail?: Array<{ latitude: number; longitude: number }>;
}

/** Focused tracking map — reuses MapLibre stack; not a full landing map. */
export function TrackingMap({
  vessels,
  ports,
  corridor = null,
  originPortId = null,
  destinationPortId = null,
  relevantVesselIds = [],
  trail = [],
}: TrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureMapLibreWorker();
    const center: [number, number] =
      vessels[0]
        ? [vessels[0].position.longitude, vessels[0].position.latitude]
        : ports[0]
          ? [ports[0].position.longitude, ports[0].position.latitude]
          : [15, 40];

    const map = new MapLibreMap({
      container: containerRef.current,
      style: resolveMapStyle(),
      center,
      zoom: 4.2,
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      registerVesselIcons(map);
      map.addSource("cc-ports", {
        type: "geojson",
        data: portsToGeoJSON(ports, {
          originId: originPortId ?? undefined,
          destinationId: destinationPortId ?? undefined,
        }),
      });
      map.addSource("cc-vessels", {
        type: "geojson",
        data: vesselsToGeoJSON(vessels, {
          relevantIds: new Set(relevantVesselIds),
          searchActive: true,
        }),
      });
      map.addSource("cc-corridor", {
        type: "geojson",
        data: corridor
          ? corridorToGeoJSON(corridor)
          : { type: "FeatureCollection", features: [] },
      });
      map.addSource("cc-trail", {
        type: "geojson",
        data: trailToGeoJSON(trail),
      });

      map.addLayer({
        id: "cc-corridor-line",
        type: "line",
        source: "cc-corridor",
        paint: {
          "line-color": "#5eead4",
          "line-width": 2,
          "line-opacity": 0.45,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "cc-trail-line",
        type: "line",
        source: "cc-trail",
        paint: {
          "line-color": "#fcd34d",
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "cc-ports-circle",
        type: "circle",
        source: "cc-ports",
        paint: {
          "circle-radius": 6,
          "circle-color": "#99f6e4",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0f172a",
        },
      });
      map.addLayer({
        id: "cc-vessels-dot",
        type: "circle",
        source: "cc-vessels",
        paint: {
          "circle-radius": 7,
          "circle-color": "#fbbf24",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0f172a",
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const portsSrc = map.getSource("cc-ports") as GeoJSONSource | undefined;
    const vesselsSrc = map.getSource("cc-vessels") as GeoJSONSource | undefined;
    const corridorSrc = map.getSource("cc-corridor") as GeoJSONSource | undefined;
    const trailSrc = map.getSource("cc-trail") as GeoJSONSource | undefined;
    portsSrc?.setData(
      portsToGeoJSON(ports, {
        originId: originPortId ?? undefined,
        destinationId: destinationPortId ?? undefined,
      }),
    );
    vesselsSrc?.setData(
      vesselsToGeoJSON(vessels, {
        relevantIds: new Set(relevantVesselIds),
        searchActive: true,
      }),
    );
    corridorSrc?.setData(
      corridor
        ? corridorToGeoJSON(corridor)
        : { type: "FeatureCollection", features: [] },
    );
    trailSrc?.setData(trailToGeoJSON(trail));

    if (vessels[0]) {
      map.easeTo({
        center: [vessels[0].position.longitude, vessels[0].position.latitude],
        duration: 600,
      });
    }
  }, [
    vessels,
    ports,
    corridor,
    originPortId,
    destinationPortId,
    relevantVesselIds,
    trail,
  ]);

  return <div ref={containerRef} className="h-72 w-full lg:h-[28rem]" />;
}

function trailToGeoJSON(
  trail: Array<{ latitude: number; longitude: number }>,
): GeoJSON.FeatureCollection {
  if (trail.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "ais_trail" },
        geometry: {
          type: "LineString",
          coordinates: trail
            .slice()
            .reverse()
            .map((p) => [p.longitude, p.latitude]),
        },
      },
    ],
  };
}
