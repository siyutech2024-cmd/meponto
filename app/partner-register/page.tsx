"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CrmPartnerCategory } from "../lib/crm";

const CATEGORY_LABELS: Record<CrmPartnerCategory, string> = {
  "Repair Shop": "Oficina / manutenção",
  "Partner Vehicle Shop": "Loja de veículos parceira",
  Supplier: "Fornecedor (catálogo do mall)",
  "Vehicle Partner": "Parceiro de veículos",
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as CrmPartnerCategory[];

export default function PartnerRegisterPage() {
  const [form, setForm] = useState({ name: "", category: "Repair Shop" as CrmPartnerCategory, contactName: "", phone: "", bairro: "", notes: "", lat: 0, lng: 0, inviterId: "" });

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setForm((f) => ({ ...f, inviterId: ref }));
  }, []);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    function render() {
      const L = (window as any).L;
      if (!L || disposed || !mapDiv.current || mapRef.current) return;
      const start: [number, number] = [-23.55, -46.63];
      const map = L.map(mapDiv.current).setView(start, 12);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const marker = L.marker(start, { draggable: true }).addTo(map);
      markerRef.current = marker;
      const set = (ll: any) => setForm((f) => ({ ...f, lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 }));
      marker.on("dragend", () => set(marker.getLatLng()));
      map.on("click", (e: any) => { marker.setLatLng(e.latlng); set(e.latlng); });
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
    return () => { disposed = true; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("sending");
    const response = await fetch("/api/partner-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível enviar. Tente novamente.");
      setState("idle");
      return;
    }
    setState("done");
  }

  const input = "h-12 w-full rounded-[10px] border border-black/10 bg-white px-3 text-sm font-bold outline-none focus:border-[#f5b301]";

  return (
    <main className="min-h-screen w-full" style={{ background: "linear-gradient(135deg,#fff7df,#ffe9a8)" }}>
      <div className="mx-auto max-w-lg px-5 py-10">
        <div className="mb-6 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#9a7400]">MePonto · PontoMall</div>
          <h1 className="mt-2 text-3xl font-black text-[#19202c]">Cadastro de parceiro / fornecedor</h1>
          <p className="mt-2 text-sm font-bold text-black/55">Envie seus dados. Após a análise da equipe MePonto, criamos seu acesso para gerenciar serviços ou produtos.</p>
        </div>

        {state === "done" ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="text-2xl">✅</div>
            <h2 className="mt-2 text-lg font-black text-[#19202c]">Cadastro recebido!</h2>
            <p className="mt-1 text-sm font-bold text-black/55">Sua solicitação está <b>em análise</b>. Entraremos em contato pelo telefone informado assim que aprovada.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <label className="block text-xs font-black uppercase text-black/45">Tipo de parceiro
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CrmPartnerCategory })} className={`${input} mt-1`}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Nome do negócio
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} placeholder="Ex.: Oficina Paulista 24h" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Responsável
              <input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={`${input} mt-1`} placeholder="Nome do contato" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Telefone / WhatsApp
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} mt-1`} placeholder="+55 11 9...." />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Bairro / região
              <input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className={`${input} mt-1`} placeholder="Opcional" />
            </label>
            <div>
              <div className="text-xs font-black uppercase text-black/45">Localização do ponto de serviço</div>
              <p className="mb-1.5 mt-0.5 text-[11px] font-bold text-black/45">Toque no mapa ou arraste o pino. (A retirada de produtos é sempre num Ponto — isto é só seu ponto de serviço.)</p>
              <div ref={mapDiv} className="h-56 w-full overflow-hidden rounded-[12px] border border-black/10" style={{ background: "#dfe7ef" }} />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) { setError("Geolocalização indisponível neste dispositivo."); return; }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
                        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
                        setForm((f) => ({ ...f, lat, lng }));
                        if (mapRef.current && markerRef.current) { mapRef.current.setView([lat, lng], 15); markerRef.current.setLatLng([lat, lng]); }
                      },
                      () => setError("Não foi possível obter sua localização."),
                    );
                  }}
                  className="h-10 shrink-0 rounded-[10px] bg-[#f5b301] px-4 text-sm font-black text-[#19202c]"
                >
                  📍 Minha localização
                </button>
                {form.lat !== 0 && form.lng !== 0 ? <span className="text-[11px] font-bold text-[#1d7a3e]">✓ {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</span> : <span className="text-[11px] font-bold text-black/40">Selecione no mapa</span>}
              </div>
            </div>
            <label className="block text-xs font-black uppercase text-black/45">Observações
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${input} mt-1 h-20 py-2`} placeholder="Serviços/produtos que oferece (opcional)" />
            </label>
            {error ? <div className="rounded-[10px] bg-[#fdeceb] px-3 py-2 text-sm font-bold text-[#c4423b]">{error}</div> : null}
            <button disabled={state === "sending"} className="h-12 w-full rounded-[10px] bg-[#19202c] text-sm font-black text-white disabled:opacity-50">
              {state === "sending" ? "Enviando..." : "Enviar cadastro"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
