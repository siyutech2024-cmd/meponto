"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Star, Wrench, Store as StoreIcon } from "lucide-react";

type Partner = {
  id: string;
  name: string;
  category: string;
  services: string[];
  bairro: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  discountBRL?: number;
  partnerPoints?: number;
  ratingAvg?: number;
  reviewCount?: number;
};
type StorePt = { id: string; name: string; bairro: string; franchise?: string; lat: number; lng: number; address?: string };

/** Rider service map (Leaflet + OpenStreetMap). Two layers: 🔧 partner service
 *  points and 🏪 Ponto pickup stations — pickups happen ONLY at Ponto. */
export default function ServiceMapPage() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ partners: Partner[]; stores: StorePt[] } | null>(null);
  const [show, setShow] = useState({ partners: true, stores: true });

  useEffect(() => {
    fetch("/api/service-map", { cache: "no-store" }).then((r) => r.json()).then((p) => setData(p.data)).catch(() => setData({ partners: [], stores: [] }));
  }, []);

  useEffect(() => {
    if (!data || !mapDiv.current) return;
    let map: any;
    let disposed = false;

    function render() {
      const L = (window as any).L;
      if (!L || disposed || !mapDiv.current) return;
      map = L.map(mapDiv.current).setView([-23.55, -46.63], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const markers: any[] = [];
      if (show.partners) {
        // Only partners WITH coordinates go on the map; the list below shows all.
        for (const p of data!.partners.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))) {
          markers.push(
            L.circleMarker([p.lat, p.lng], { radius: 9, color: "#ff7a00", weight: 2, fillColor: "#ff7a00", fillOpacity: 0.85 })
              .addTo(map)
              .bindPopup(`<b>🔧 ${p.name}</b><br>${(p.services && p.services.length ? p.services.join(", ") : p.category)}<br><small>${p.bairro || ""}</small>`),
          );
        }
      }
      if (show.stores) {
        for (const s of data!.stores) {
          markers.push(
            L.circleMarker([s.lat, s.lng], { radius: 10, color: "#1d4ed8", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.85 })
              .addTo(map)
              .bindPopup(`<b>🏪 ${s.name}</b><br>Ponto de retirada<br><small>${s.bairro || s.address || ""}</small>`),
          );
        }
      }
      if (markers.length) {
        try {
          map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
        } catch {
          /* single/no marker — keep default view */
        }
      }
    }

    if (!(window as any).L) {
      if (!document.getElementById("leaflet-css")) {
        const css = document.createElement("link");
        css.id = "leaflet-css";
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
      }
      const js = document.createElement("script");
      js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      js.onload = render;
      document.body.appendChild(js);
    } else {
      render();
    }

    return () => {
      disposed = true;
      if (map) map.remove();
    };
  }, [data, show]);

  return (
    <main className="min-h-screen bg-[#101010] text-[#050505]" style={{ fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#f3f2ee]">
        <header className="flex items-center gap-3 px-4 pb-2 pt-4">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-[8px] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"><ArrowLeft size={18} /></Link>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff7a00]">MePonto</div>
            <h1 className="text-lg font-black leading-5">Mapa de serviços</h1>
          </div>
        </header>

        <div className="flex gap-2 px-4 pb-2">
          <button type="button" onClick={() => setShow((s) => ({ ...s, partners: !s.partners }))} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${show.partners ? "bg-[#ff7a00] text-[#050505]" : "bg-white text-[#77746f]"}`}>
            <Wrench size={13} /> Parceiros {data ? `(${data.partners.length})` : ""}
          </button>
          <button type="button" onClick={() => setShow((s) => ({ ...s, stores: !s.stores }))} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${show.stores ? "bg-[#3b82f6] text-white" : "bg-white text-[#77746f]"}`}>
            <StoreIcon size={13} /> Pontos de retirada {data ? `(${data.stores.length})` : ""}
          </button>
        </div>

        <div ref={mapDiv} className="mx-4 mb-3 flex-1 overflow-hidden rounded-[12px] border border-[#e6e3dd]" style={{ minHeight: "50vh", background: "#dfe7ef" }} />

        <p className="px-4 pb-2 text-[11px] font-bold text-[#77746f]">
          🔧 parceiros = locais de serviço · 🏪 azul = Pontos de retirada (a retirada de produtos é sempre num Ponto).
        </p>

        {/* Partner LIST — every Active service partner (real CRM data), even
            those still without coordinates on the map. */}
        {data && data.partners.length > 0 && (
          <section className="px-4 pb-6">
            <h2 className="mb-2 text-sm font-black">Parceiros de serviço ({data.partners.length})</h2>
            <div className="space-y-2">
              {data.partners.map((p) => (
                <div key={p.id} className="rounded-[10px] bg-white p-3 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">🔧 {p.name}</div>
                      <div className="text-[11px] font-bold text-[#77746f]">
                        {(p.services && p.services.length ? p.services.join(" / ") : p.category) || "Serviços"}{p.bairro ? ` · ${p.bairro}` : ""}
                      </div>
                    </div>
                    {(p.reviewCount ?? 0) > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff4cf] px-2 py-0.5 text-[10px] font-black text-[#9a7400]">
                        <Star size={10} fill="currentColor" /> {p.ratingAvg} ({p.reviewCount})
                      </span>
                    )}
                  </div>
                  {((p.discountBRL ?? 0) > 0 || (p.partnerPoints ?? 0) > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(p.discountBRL ?? 0) > 0 && (
                        <span className="rounded-full bg-[#e8f6ee] px-2 py-0.5 text-[10px] font-black text-[#20a65a]">Desconto R$ {(p.discountBRL as number).toFixed(2)}</span>
                      )}
                      {(p.partnerPoints ?? 0) > 0 && (
                        <span className="rounded-full bg-[#fff1e0] px-2 py-0.5 text-[10px] font-black text-[#ff7a00]">+{p.partnerPoints} pts</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
