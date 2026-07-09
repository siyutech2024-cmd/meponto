"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { HotZone } from "./hot-zones";

/**
 * Live rider overview map (Leaflet + OpenStreetMap, CDN-loaded — same pattern
 * as app/rider-app/map). Draws the Eastwind hot-zone polygons plus one dot per
 * rider, colored by status category. Clicking a dot selects the rider (opens
 * the detail drawer via onSelect) and zooms to it; selecting a rider anywhere
 * else (list / drawer) flies the map to that rider via focusKey.
 */

export type MapRider = {
  key: string;
  name: string;
  phone: string | null;
  statusText: string;
  color: string;
  lat: number;
  lng: number;
};

const FOCUS_ZOOM = 16;

export default function RiderMap({
  riders,
  zones,
  zoneLabel,
  focusKey,
  onSelect,
}: {
  riders: MapRider[];
  /** Hot zones visible to this portal (HQ: all; franchise: assigned only). */
  zones: HotZone[];
  /** Extra tooltip line per zone id (e.g. assigned franchise name). */
  zoneLabel?: (zoneId: string) => string | null;
  focusKey: string | null;
  onSelect: (key: string) => void;
}) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const zoneLayerRef = useRef<any>(null);
  const zoneLabelRef = useRef(zoneLabel);
  zoneLabelRef.current = zoneLabel;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);

  // Init once: tiles + hot-zone polygons.
  useEffect(() => {
    let disposed = false;

    function init() {
      const L = (window as any).L;
      if (!L || disposed || !mapDiv.current || mapRef.current) return;
      const map = L.map(mapDiv.current).setView([-23.63, -46.66], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      mapRef.current = map;
      setReady(true); // re-runs the marker effect if riders arrived before Leaflet
    }

    if (!(window as any).L) {
      if (!document.getElementById("leaflet-css")) {
        const css = document.createElement("link");
        css.id = "leaflet-css";
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
      }
      const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
      if (existing) {
        if ((window as any).L) init();
        else existing.addEventListener("load", init);
      } else {
        const js = document.createElement("script");
        js.id = "leaflet-js";
        js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        js.onload = init;
        document.body.appendChild(js);
      }
    } else {
      init();
    }

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  // (Re)draw the hot-zone polygons whenever the visible zone set changes
  // (e.g. HQ re-assigns a zone, or a franchise portal loads its own subset).
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (zoneLayerRef.current) zoneLayerRef.current.remove();
    const layer = L.layerGroup();
    for (const z of zones) {
      const extra = zoneLabelRef.current?.(z.id);
      L.polygon(
        z.points.map(([lng, lat]: [number, number]) => [lat, lng]),
        { color: z.color, weight: 1.5, fillColor: z.color, fillOpacity: 0.14 },
      )
        .bindTooltip(`${z.group}${z.hotZone ? ` · ${z.hotZone}` : ""}${extra ? `<br>${esc(extra)}` : ""}`, { sticky: true })
        .addTo(layer);
    }
    layer.addTo(map);
    zoneLayerRef.current = layer;
  }, [zones, ready]);

  // Sync markers whenever riders change (and once the map is ready).
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const markers = markersRef.current;
    const nextKeys = new Set(riders.map((r) => r.key));
    for (const [key, m] of markers) {
      if (!nextKeys.has(key)) {
        m.remove();
        markers.delete(key);
      }
    }
    for (const r of riders) {
      const existing = markers.get(r.key);
      if (existing) {
        existing.setLatLng([r.lat, r.lng]);
        existing.setStyle({ color: r.color, fillColor: r.color });
        existing.setPopupContent(popupHtml(r));
      } else {
        const m = L.circleMarker([r.lat, r.lng], {
          radius: 8,
          color: r.color,
          weight: 2,
          fillColor: r.color,
          fillOpacity: 0.85,
        })
          .addTo(map)
          .bindPopup(popupHtml(r));
        m.on("click", () => {
          onSelectRef.current(r.key);
          map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), FOCUS_ZOOM));
        });
        markers.set(r.key, m);
      }
    }
  }, [riders, ready]);

  // Fly to the focused rider (selected from the list or drawer).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusKey) return;
    const r = riders.find((x) => x.key === focusKey);
    if (!r) return;
    map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), FOCUS_ZOOM));
    markersRef.current.get(focusKey)?.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div
      ref={mapDiv}
      className="relative z-0 h-[420px] w-full overflow-hidden rounded-[10px] border border-[var(--line)]"
      style={{ background: "#dfe7ef", isolation: "isolate" }}
    />
  );
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

function popupHtml(r: MapRider): string {
  return `<b>${esc(r.name)}</b><br><span style="color:${esc(r.color)};font-weight:700">${esc(r.statusText)}</span>${r.phone ? `<br><small>${esc(r.phone)}</small>` : ""}`;
}
