"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { MapLocation } from "@/lib/queries";
import { pinStatus, PIN_COLORS } from "./map-explorer";

// OpenFreeMap: free vector tiles, no API key. Swap for Mapbox on handoff if preferred.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const FONT = ["Noto Sans Bold"];

type Point = { lat: number; lng: number };

export default function MapCanvas({
  locations,
  selectedId,
  onSelect,
  me,
  flyTo,
  dropPin,
  onMapClick,
  addMode,
}: {
  locations: MapLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  me: Point | null;
  flyTo: Point | null;
  dropPin: Point | null;
  onMapClick: (p: Point) => void;
  addMode: boolean;
}) {
  const ref = useRef<MapRef>(null);
  const [hovering, setHovering] = useState(false);

  // Pins as GeoJSON so MapLibre can cluster thousands of them on the GPU.
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: locations.map((l) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [l.lng, l.lat] },
        properties: { id: l.id, status: pinStatus(l), count: l.items.length },
      })),
    }),
    [locations],
  );

  const initial = useMemo(() => {
    const sel = locations.find((l) => l.id === selectedId);
    if (sel) return { latitude: sel.lat, longitude: sel.lng, zoom: 14 };
    if (locations.length === 0) return { latitude: 39.8, longitude: -98.6, zoom: 3.2 };
    // Contiguous-US-ish view when pins span the continent; otherwise fit them.
    const inner = locations.filter((l) => l.lat > 24 && l.lat < 50 && l.lng > -125 && l.lng < -66);
    const pts = inner.length > locations.length * 0.8 ? inner : locations;
    const lats = pts.map((l) => l.lat);
    const lngs = pts.map((l) => l.lng);
    return {
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 60, maxZoom: 14 },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (flyTo) ref.current?.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: Math.max(ref.current.getZoom(), 12), duration: 900 });
  }, [flyTo]);

  async function handleClick(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    if (!f || addMode) {
      onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      return;
    }
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    if (f.properties?.cluster) {
      const source = ref.current?.getSource("places") as GeoJSONSource | undefined;
      const zoom = await source?.getClusterExpansionZoom(f.properties.cluster_id as number);
      ref.current?.easeTo({ center: coords, zoom: (zoom ?? ref.current.getZoom() + 2) + 0.5, duration: 600 });
      return;
    }
    onSelect(String(f.properties?.id));
  }

  const colorExpr = ["match", ["get", "status"], "untried", PIN_COLORS.untried, "tried", PIN_COLORS.tried, PIN_COLORS.unknown] as unknown as string;

  return (
    <Map
      ref={ref}
      initialViewState={initial}
      mapStyle={STYLE}
      style={{ width: "100%", height: "100%" }}
      cursor={addMode ? "crosshair" : hovering ? "pointer" : undefined}
      interactiveLayerIds={["clusters", "points"]}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <Source id="places" type="geojson" data={data} cluster clusterMaxZoom={11} clusterRadius={44}>
        <Layer
          id="clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "#6b3a1f",
            "circle-opacity": 0.9,
            "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 24, 200, 30],
            "circle-stroke-width": 3,
            "circle-stroke-color": "rgba(253,248,241,0.9)",
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{ "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true }}
          paint={{ "text-color": "#fdf8f1" }}
        />
        <Layer
          id="points"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": colorExpr,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 12, 9, 16, 12],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
        <Layer
          id="point-count"
          type="symbol"
          filter={["all", ["!", ["has", "point_count"]], [">", ["get", "count"], 0]]}
          minzoom={10}
          layout={{ "text-field": ["to-string", ["get", "count"]], "text-font": FONT, "text-size": 10, "text-allow-overlap": true }}
          paint={{ "text-color": ["match", ["get", "status"], "tried", "#44403c", "#ffffff"] as unknown as string }}
        />
        <Layer
          id="point-selected"
          type="circle"
          filter={["==", ["get", "id"], selectedId ?? ""]}
          paint={{ "circle-color": "rgba(0,0,0,0)", "circle-radius": 16, "circle-stroke-width": 3, "circle-stroke-color": "#3f2213" }}
        />
      </Source>
      {me && (
        <Marker latitude={me.lat} longitude={me.lng}>
          <span className="block h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,0.25)]" />
        </Marker>
      )}
      {dropPin && (
        <Marker latitude={dropPin.lat} longitude={dropPin.lng} anchor="bottom">
          <svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 39s13-13.4 13-23.5A13 13 0 0 0 2 15.5C2 25.6 15 39 15 39z" fill="#c8742b" stroke="white" strokeWidth="2" /><circle cx="15" cy="15" r="4" fill="white" /></svg>
        </Marker>
      )}
    </Map>
  );
}
