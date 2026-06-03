"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

  return (
    <AppShell>
      <PageTitle title="Partner CRM" eyebrow="Repair, fleet, supplier network" action={<AddButton label="Add Partner" onClick={() => setFormOpen((open) => !open)} />} />
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
        headers={["Partner", "Category", "Contact", "Bairro", "Owner", "SLA", "Volume", "Vehicles", "Status", "Risk", "Services"]}
        rows={filteredPartners.map((partner) => [
          <div key="partner">
            <div className="font-black">{partner.name}</div>
            <div className="text-xs text-[var(--muted)]">{partner.tier}</div>
          </div>,
          partner.category,
          <div key="contact">
            <div>{partner.contactName}</div>
            <div className="text-xs text-[var(--muted)]">{partner.phone}</div>
          </div>,
          partner.bairro,
          partner.owner,
          `${partner.slaHours}h`,
          partner.monthlyVolume,
          partner.vehiclesAvailable,
          <Badge key="status" value={partner.status} />,
          <Badge key="risk" value={partner.risk} />,
          <div key="services" className="flex flex-wrap gap-1">
            {partner.services.map((service) => (
              <span className="tag" key={service}>{service}</span>
            ))}
          </div>,
        ])}
      />
    </AppShell>
  );
}
