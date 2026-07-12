"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useEffect, useRef, useState } from "react";
import { normalizeBrPhone } from "../lib/phone";
import type { CrmPartnerCategory } from "../lib/crm";

const CATEGORY_LABELS: Record<CrmPartnerCategory, string> = {
  "Repair Shop": "Oficina / manutenção",
  "Partner Vehicle Shop": "Loja de veículos parceira",
  Supplier: "Fornecedor (catálogo do mall)",
  "Vehicle Partner": "Parceiro de veículos",
};
// Seeded fallback shown until the live category list loads.
const DEFAULT_CATEGORIES = Object.keys(CATEGORY_LABELS) as CrmPartnerCategory[];

type FieldKey = "name" | "category" | "contactName" | "phone" | "mapUrl" | "address";

function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function PartnerRegisterPage() {
  const [form, setForm] = useState({ name: "", category: "Repair Shop" as CrmPartnerCategory, contactName: "", phone: "", bairro: "", address: "", mapUrl: "", notes: "", lat: 0, lng: 0, inviterId: "" });
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, boolean>>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? params.get("invite");
    if (ref) setForm((f) => ({ ...f, inviterId: ref }));
  }, []);

  // Service-type options come from the CRM's configurable category list
  // (public, lightweight endpoint — active categories only).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm?public=categories", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const labels = ((payload?.data ?? []) as Array<{ label?: string }>).map((c) => String(c.label ?? "")).filter(Boolean);
        if (!cancelled && labels.length > 0) {
          setCategories(labels);
          setForm((f) => (labels.includes(f.category) ? f : { ...f, category: labels[0] }));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
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

    // Client-side required-field validation (the server re-validates).
    const missing: Partial<Record<FieldKey, boolean>> = {};
    if (!form.name.trim()) missing.name = true;
    if (!form.category.trim()) missing.category = true;
    if (!form.contactName.trim()) missing.contactName = true;
    if (!form.phone.trim()) missing.phone = true;
    if (!form.mapUrl.trim()) missing.mapUrl = true;
    if (!form.address.trim()) missing.address = true;
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      setError("Preencha os campos obrigatórios destacados.");
      return;
    }
    if (!isValidHttpUrl(form.mapUrl.trim())) {
      setFieldErrors({ mapUrl: true });
      setError("Link do mapa inválido — cole uma URL http(s) válida.");
      return;
    }
    setFieldErrors({});

    setState("sending");
    const response = await fetch("/api/partner-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Phone goes out canonical (+55…) — the server normalizes again anyway.
      body: JSON.stringify({ ...form, phone: normalizeBrPhone(form.phone) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Server 400 carries `fields` — highlight exactly what it rejected.
      if (Array.isArray(payload.fields)) {
        setFieldErrors(Object.fromEntries((payload.fields as FieldKey[]).map((field) => [field, true])));
      }
      setError(payload.error ?? "Não foi possível enviar. Tente novamente.");
      setState("idle");
      return;
    }
    setState("done");
  }

  /** Red border + subtle red background on invalid required fields. */
  const errStyle = (key: FieldKey) => (fieldErrors[key] ? { borderColor: "#c4423b", background: "#fff7f6" } : undefined);

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
          <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            {form.inviterId ? (
              <div className="rounded-[10px] bg-[#e8f6ee] px-3 py-2 text-xs font-bold text-[#1d7a3e]">
                Indicado por: <b data-i18n-skip>{form.inviterId}</b>
              </div>
            ) : null}
            <label className="block text-xs font-black uppercase text-black/45">Tipo de serviço *
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CrmPartnerCategory })} className={`${input} mt-1`} style={errStyle("category")}>
                {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Nome do negócio *
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} style={errStyle("name")} placeholder="Ex.: Oficina Paulista 24h" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Responsável *
              <input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={`${input} mt-1`} style={errStyle("contactName")} placeholder="Nome do contato" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Telefone / WhatsApp *
              <span className="mt-1 flex items-center gap-2">
                <span aria-hidden="true" data-i18n-skip className="grid h-12 shrink-0 select-none place-items-center rounded-[10px] border border-black/10 bg-[#fff7df] px-3 text-sm font-black text-[#9a7400]">+55</span>
                <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} style={errStyle("phone")} placeholder="(11) 98765-4321" inputMode="tel" autoComplete="tel" />
              </span>
              <span className="mt-0.5 block text-[11px] font-bold normal-case text-black/45">Brasil (+55) — digite o DDD e o número</span>
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Endereço completo *
              <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={`${input} mt-1`} style={errStyle("address")} placeholder="Rua, número, bairro, cidade" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Link do mapa (Google Maps) *
              <input
                required
                type="url"
                inputMode="url"
                value={form.mapUrl}
                onChange={(e) => setForm({ ...form, mapUrl: e.target.value })}
                className={`${input} mt-1`}
                style={errStyle("mapUrl")}
                placeholder="https://maps.app.goo.gl/..."
              />
              <span className="mt-0.5 block text-[11px] font-bold normal-case text-black/45">Cole o link do Google Maps do seu ponto de serviço.</span>
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
