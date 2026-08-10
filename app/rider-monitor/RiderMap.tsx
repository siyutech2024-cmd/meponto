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
  /** 模式二: PRO 骑手点位加金色描边环(填充色仍表状态,环表身份)。 */
  pro?: boolean;
  /** Pre-localized summary lines shown in the hover tooltip (shift, zone, …). */
  metaLines?: string[];
};

/** PRO 身份色 —— 与列表徽章、监控 chips 同一个金。 */
const PRO_GOLD = "#eda100";
/** 点位样式:PRO = 金环加粗加大一号;普通 = 描边同填充色。 */
const markerStyle = (r: MapRider) => ({
  radius: r.pro ? 9 : 8,
  color: r.pro ? PRO_GOLD : r.color,
  weight: r.pro ? 3.5 : 2,
  fillColor: r.color,
  fillOpacity: 0.85,
});

const FOCUS_ZOOM = 16;
const DEFAULT_CENTER: [number, number] = [-23.63, -46.66];
const DEFAULT_ZOOM = 12;

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
  const zoneBoundsRef = useRef<any>(null);
  const prevFocusRef = useRef<string | null>(null);
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
    zoneBoundsRef.current = zones.length
      ? (window as any).L.latLngBounds(zones.flatMap((z) => z.points.map(([lng, lat]) => [lat, lng])))
      : null;
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
        // 全量样式 —— pool 会被入库自动标记流转(普通→PRO),环得跟着变。
        existing.setStyle(markerStyle(r));
        existing.setRadius(r.pro ? 9 : 8);
        existing.setPopupContent(popupHtml(r));
        existing.setTooltipContent(tooltipHtml(r));
      } else {
        const m = L.circleMarker([r.lat, r.lng], markerStyle(r))
          .addTo(map)
          .bindPopup(popupHtml(r))
          // Hover card: rider summary (name, status, shift, zone, online, done).
          .bindTooltip(tooltipHtml(r), { direction: "top", offset: [0, -8], opacity: 0.95 });
        m.on("click", () => {
          onSelectRef.current(r.key);
          map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), FOCUS_ZOOM));
        });
        markers.set(r.key, m);
      }
    }
  }, [riders, ready]);

  // Fly to the focused rider (selected from the list or drawer). When the
  // focus is CLEARED (detail drawer closed), fly back to the default view:
  // the visible zones' bounds, or the city default when no zones are drawn.
  useEffect(() => {
    const map = mapRef.current;
    const hadFocus = prevFocusRef.current;
    prevFocusRef.current = focusKey;
    if (!map) return;
    if (!focusKey) {
      if (hadFocus) {
        map.closePopup();
        if (zoneBoundsRef.current) map.flyToBounds(zoneBoundsRef.current, { padding: [24, 24] });
        else map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
      return;
    }
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

/** 弹窗/悬浮卡里的金色 PRO 徽章(与列表同款)。 */
const proTag = (r: MapRider) =>
  r.pro ? ` <span style="background:${PRO_GOLD};color:#171b33;border-radius:99px;padding:0 5px;font-size:10px;font-weight:900">PRO</span>` : "";

function popupHtml(r: MapRider): string {
  return `<b>${esc(r.name)}</b>${proTag(r)}<br><span style="color:${esc(r.color)};font-weight:700">${esc(r.statusText)}</span>${r.phone ? `<br><small>${esc(r.phone)}</small>` : ""}`;
}

function tooltipHtml(r: MapRider): string {
  const meta = (r.metaLines ?? []).map((l) => `<br><small>${esc(l)}</small>`).join("");
  return `<b>${esc(r.name)}</b>${proTag(r)}<br><span style="color:${esc(r.color)};font-weight:700">${esc(r.statusText)}</span>${meta}${r.phone ? `<br><small>${esc(r.phone)}</small>` : ""}`;
}
