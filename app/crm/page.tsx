"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AddButton, AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import type { CrmPartner, CrmPartnerCategory, CrmPartnerRisk, CrmPartnerStatus, CrmPartnerTier } from "../lib/crm";

const categories: CrmPartnerCategory[] = ["Repair Shop", "Partner Vehicle Shop", "Supplier", "Vehicle Partner"];
const statuses: CrmPartnerStatus[] = ["Active", "Prospect", "Review", "Suspended"];
const tiers: CrmPartnerTier[] = ["Strategic", "Preferred", "Standard", "Watchlist"];
const risks: CrmPartnerRisk[] = ["Low", "Medium", "High"];

const emptyForm = {
  name: "",
  category: "Repair Shop" as CrmPartnerCategory,
  contactName: "",
  phone: "",
  bairro: "",
  owner: "MePonto Partnerships",
  status: "Prospect" as CrmPartnerStatus,
  tier: "Standard" as CrmPartnerTier,
  risk: "Medium" as CrmPartnerRisk,
  monthlyVolume: 0,
  vehiclesAvailable: 0,
  services: "",
  lat: -23.5505,
  lng: -46.6333,
};

export default function CrmPage() {
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [riskFilter, setRiskFilter] = useState("All Risk");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/crm", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { data: CrmPartner[] }) => {
        if (active) {
          setPartners(payload.data);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Service-location map picker (shown on the rider app). Inits when the form opens.
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  useEffect(() => {
    if (!formOpen) { mapRef.current = null; return; }
    let disposed = false;
    const init = () => {
      const L = (window as any).L;
      if (!L || disposed || !mapDiv.current || mapRef.current) return;
      const start: [number, number] = [form.lat || -23.5505, form.lng || -46.6333];
      const map = L.map(mapDiv.current).setView(start, 12);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const marker = L.marker(start, { draggable: true }).addTo(map);
      const set = (ll: any) => setForm((f) => ({ ...f, lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 }));
      marker.on("dragend", () => set(marker.getLatLng()));
      map.on("click", (e: any) => { marker.setLatLng(e.latlng); set(e.latlng); });
      setTimeout(() => map.invalidateSize(), 120);
    };
    if (!document.getElementById("leaflet-css")) {
      const css = document.createElement("link"); css.id = "leaflet-css"; css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    }
    if ((window as any).L) init();
    else { const js = document.createElement("script"); js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; js.onload = init; document.body.appendChild(js); }
    return () => { disposed = true; if (mapRef.current) { mapRef.current.remove?.(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen]);

  const filteredPartners = useMemo(() => {
    const term = query.trim().toLowerCase();
    return partners.filter((partner) => {
      const matchesTerm =
        !term ||
        [partner.name, partner.contactName, partner.phone, partner.bairro, partner.owner].some((value) =>
          value.toLowerCase().includes(term),
        );
      const matchesCategory = categoryFilter === "All Categories" || partner.category === categoryFilter;
      const matchesStatus = statusFilter === "All Status" || partner.status === statusFilter;
      const matchesRisk = riskFilter === "All Risk" || partner.risk === riskFilter;
      return matchesTerm && matchesCategory && matchesStatus && matchesRisk;
    });
  }, [categoryFilter, partners, query, riskFilter, statusFilter]);

  const activeCount = partners.filter((partner) => partner.status === "Active").length;
  const reviewCount = partners.filter((partner) => partner.status === "Review" || partner.risk === "High").length;
  const monthlyVolume = partners.reduce((sum, partner) => sum + partner.monthlyVolume, 0);
  const vehiclesAvailable = partners.reduce((sum, partner) => sum + partner.vehiclesAvailable, 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    const response = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        services: form.services
          .split(",")
          .map((service) => service.trim())
          .filter(Boolean),
      }),
    });
    const payload = (await response.json()) as { data?: CrmPartner };

    if (payload.data) {
      setPartners((current) => [payload.data as CrmPartner, ...current]);
      setForm(emptyForm);
      setFormOpen(false);
    }

    setIsSaving(false);
  }

  const [notice, setNotice] = useState<string | null>(null);

  async function setStatus(partner: CrmPartner, status: CrmPartnerStatus) {
    const response = await fetch("/api/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setStatus", id: partner.id, status }),
    });
    const payload = (await response.json()) as { data?: CrmPartner; error?: string };
    if (payload.data) setPartners((current) => current.map((item) => (item.id === partner.id ? (payload.data as CrmPartner) : item)));
    else setNotice(payload.error ?? "Failed to update status");
  }

  async function provisionAccount(partner: CrmPartner) {
    const identifier = window.prompt(`Login (e-mail or phone) for ${partner.name}:`, partner.phone || "");
    if (!identifier?.trim()) return;
    const response = await fetch("/api/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "provisionAccount", id: partner.id, identifier: identifier.trim() }),
    });
    const payload = (await response.json()) as { data?: { identifier: string; portal: string; tempPassword: string }; error?: string };
    if (payload.data) {
      setPartners((current) => current.map((item) => (item.id === partner.id ? { ...item, status: "Active" as CrmPartnerStatus } : item)));
      setNotice(`Conta criada — ${payload.data.identifier} · portal ${payload.data.portal} · senha temporária: ${payload.data.tempPassword}. Entregue com segurança; o parceiro troca no primeiro acesso.`);
    } else {
      setNotice(payload.error ?? "Failed to create account");
    }
  }

  return (
    <AppShell>
      <PageTitle title="Partner CRM" eyebrow="Repair, fleet, supplier network" action={<AddButton label="Add Partner" onClick={() => setFormOpen((open) => !open)} />} />
      {notice ? (
        <div className="panel mb-3 flex items-start justify-between gap-3 border-l-4 border-[var(--accent)] p-3 text-sm font-bold">
          <span className="break-all">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[var(--muted)]">✕</button>
        </div>
      ) : null}
      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Active Partners" value={String(activeCount)} />
        <Field label="Monthly Cases" value={String(monthlyVolume)} />
        <Field label="Vehicles Available" value={String(vehiclesAvailable)} />
        <Field label="Review Queue" value={String(reviewCount)} />
      </section>

      {formOpen ? (
        <form onSubmit={handleSubmit} className="panel mt-4 grid gap-3 p-4 lg:grid-cols-4">
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Partner name" />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CrmPartnerCategory })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Contact" />
          <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Phone" />
          <input value={form.bairro} onChange={(event) => setForm({ ...form, bairro: event.target.value })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Bairro" />
          <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Owner" />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CrmPartnerStatus })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value as CrmPartnerTier })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
            {tiers.map((tier) => (
              <option key={tier}>{tier}</option>
            ))}
          </select>
          <select value={form.risk} onChange={(event) => setForm({ ...form, risk: event.target.value as CrmPartnerRisk })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
            {risks.map((risk) => (
              <option key={risk}>{risk}</option>
            ))}
          </select>
          <input type="number" min="0" value={form.monthlyVolume} onChange={(event) => setForm({ ...form, monthlyVolume: Number(event.target.value) })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Monthly cases" />
          <input type="number" min="0" value={form.vehiclesAvailable} onChange={(event) => setForm({ ...form, vehiclesAvailable: Number(event.target.value) })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Vehicles" />
          <input value={form.services} onChange={(event) => setForm({ ...form, services: event.target.value })} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" placeholder="Services, comma separated" />
          <div className="lg:col-span-4">
            <div className="mb-1 text-[11px] font-black uppercase text-[var(--muted)]">服务点位置（点地图或拖图钉 · 骑手 App 地图按此显示）</div>
            <div ref={mapDiv} className="h-56 w-full overflow-hidden rounded-[10px] border border-[var(--line)]" style={{ background: "#dfe7ef" }} />
            <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">坐标 {form.lat?.toFixed(5)}, {form.lng?.toFixed(5)}</div>
          </div>
          <div className="flex gap-2 lg:col-span-4">
            <button disabled={isSaving} className="h-11 rounded border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">
              {isSaving ? "Saving" : "Create Partner"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-black text-[var(--text-soft)]">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel my-4 grid gap-3 p-3 md:grid-cols-[1fr_210px_170px_150px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none"
          placeholder="Search partners, contacts, phone, bairro"
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          <option>All Categories</option>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          <option>All Status</option>
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          <option>All Risk</option>
          {risks.map((risk) => (
            <option key={risk}>{risk}</option>
          ))}
        </select>
      </div>

      <DataTable
        headers={["Partner", "Category", "Contact", "Bairro", "Status", "Risk", "Services", "Ações"]}
        rows={filteredPartners.map((partner) => [
          <div key="partner">
            <div className="font-black">{partner.name}</div>
            <div className="text-xs text-[var(--muted)]">{partner.tier} · {partner.category === "Supplier" ? "供应商" : "合作方"}</div>
          </div>,
          partner.category,
          <div key="contact">
            <div>{partner.contactName}</div>
            <div className="text-xs text-[var(--muted)]">{partner.phone}</div>
          </div>,
          partner.bairro,
          <Badge key="status" value={partner.status} />,
          <Badge key="risk" value={partner.risk} />,
          <div key="services" className="flex flex-wrap gap-1">
            {partner.services.map((service) => (
              <span className="tag" key={service}>{service}</span>
            ))}
          </div>,
          <div key="actions" className="flex flex-wrap gap-1.5">
            {partner.status !== "Active" ? (
              <button type="button" onClick={() => void setStatus(partner, "Active")} className="h-8 rounded-[7px] bg-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent-ink)]">批准</button>
            ) : (
              <button type="button" onClick={() => void setStatus(partner, "Suspended")} className="h-8 rounded-[7px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)]">挂起</button>
            )}
            <button type="button" onClick={() => void provisionAccount(partner)} className="h-8 rounded-[7px] border border-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent)]">开通账号</button>
          </div>,
        ])}
      />
    </AppShell>
  );
}
