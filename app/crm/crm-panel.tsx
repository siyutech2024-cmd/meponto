"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AddButton } from "../components/ui";
import { useDialog } from "../components/dialog";
import { DataTable, Drawer, Pager, SearchInput, Skeleton, Stat, StatusBadge, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import type { CrmCategory, CrmPartner, CrmPartnerCategory, CrmPartnerRisk, CrmPartnerStatus, CrmPartnerTier } from "../lib/crm";

/**
 * CrmPanel — 合作伙伴 CRM workbench body (partner directory, review actions,
 * login-account provisioning, category manager, map picker). Rendered by BOTH
 * the PontoSys page (/crm) and the PontoMall back-office CRM(合作伙伴) tab
 * (app/mall/tabs/crm.tsx) — one implementation, two homes (same pattern as
 * MembersPanel / MallInsightsPanel).
 */

const DEFAULT_CATEGORIES: CrmPartnerCategory[] = ["Repair Shop", "Partner Vehicle Shop", "Supplier", "Vehicle Partner"];
const statuses: CrmPartnerStatus[] = ["Active", "Prospect", "Review", "Suspended"];
const tiers: CrmPartnerTier[] = ["Strategic", "Preferred", "Standard", "Watchlist"];
const risks: CrmPartnerRisk[] = ["Low", "Medium", "High"];

const statusTone = (status: CrmPartnerStatus): BadgeTone =>
  status === "Active" ? "success" : status === "Review" ? "warn" : status === "Suspended" ? "danger" : "info";
const riskTone = (risk: CrmPartnerRisk): BadgeTone =>
  risk === "High" ? "danger" : risk === "Medium" ? "warn" : "neutral";

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

type AccountInfo = { identifier: string; status: string; portal: string; total: number; active: number };

const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";
const filterSelect = "h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

export default function CrmPanel() {
  const dialog = useDialog();
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  /** True until the first fetch settles — stats show "…" + table shows Skeleton. */
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
  const [catConfig, setCatConfig] = useState<CrmCategory[]>([]);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [catForm, setCatForm] = useState<{ id: string | null; label: string; accountType: "supplier" | "partner" }>({ id: null, label: "", accountType: "partner" });

  // Active category labels for the dropdowns (config first, seeded fallback).
  const categories = catConfig.length ? catConfig.filter((c) => c.active).map((c) => c.label) : DEFAULT_CATEGORIES;
  const accountTypeOf = (label: string): "supplier" | "partner" =>
    catConfig.find((c) => c.label === label)?.accountType ?? (["Supplier", "供应商", "Fornecedor"].includes(label) ? "supplier" : "partner");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [riskFilter, setRiskFilter] = useState("All Risk");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(partner: CrmPartner) {
    setForm({
      name: partner.name, category: partner.category, contactName: partner.contactName, phone: partner.phone,
      bairro: partner.bairro, owner: partner.owner, status: partner.status, tier: partner.tier, risk: partner.risk,
      monthlyVolume: partner.monthlyVolume, vehiclesAvailable: partner.vehiclesAvailable,
      services: partner.services.join(", "), lat: partner.lat, lng: partner.lng,
    });
    setEditingId(partner.id);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/crm", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { data: CrmPartner[]; accounts?: Record<string, AccountInfo>; categories?: CrmCategory[] }) => {
        if (active) {
          setPartners(payload.data);
          setAccounts(payload.accounts ?? {});
          setCatConfig(payload.categories ?? []);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /** First load still in flight — show "…" stats + skeleton, never fake zeros. */
  const booting = loading && partners.length === 0;

  // Service-location map picker (shown on the rider app). Inits when the form drawer opens.
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

  // ---- 名录分页（20/页；搜索或任一筛选变化重置页码） ----
  const PAGE_SIZE = 20;
  const pages = Math.max(1, Math.ceil(filteredPartners.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pagedPartners = useMemo(() => filteredPartners.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filteredPartners, safePage]);

  const activeCount = partners.filter((partner) => partner.status === "Active").length;
  const reviewCount = partners.filter((partner) => partner.status === "Review" || partner.risk === "High").length;
  const monthlyVolume = partners.reduce((sum, partner) => sum + partner.monthlyVolume, 0);
  const vehiclesAvailable = partners.reduce((sum, partner) => sum + partner.vehiclesAvailable, 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    const payloadBody = { ...form, services: form.services.split(",").map((service) => service.trim()).filter(Boolean) };
    const response = editingId
      ? await fetch("/api/crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: editingId, ...payloadBody }) })
      : await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadBody) });
    const payload = (await response.json()) as { data?: CrmPartner };

    if (payload.data) {
      const saved = payload.data;
      setPartners((current) => (editingId ? current.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...current]));
      setForm(emptyForm);
      setFormOpen(false);
      setEditingId(null);
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

  async function saveCategory() {
    const label = catForm.label.trim();
    if (!label) return;
    const body = catForm.id
      ? { action: "updateCategory", categoryId: catForm.id, label, accountType: catForm.accountType }
      : { action: "addCategory", label, accountType: catForm.accountType };
    const response = await fetch("/api/crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json()) as { data?: CrmCategory; error?: string };
    if (payload.data) {
      const saved = payload.data;
      setCatConfig((current) => (catForm.id ? current.map((c) => (c.id === saved.id ? saved : c)) : [...current, saved]));
      setCatForm({ id: null, label: "", accountType: "partner" });
    } else setNotice(payload.error ?? "保存类型失败");
  }

  async function removeCategory(category: CrmCategory) {
    if (!(await dialog.confirm("删除类型", { message: `删除合作伙伴类型「${category.label}」？该类型下仍有公司时服务端会拒绝删除。`, confirmText: "删除", tone: "danger" }))) return;
    const response = await fetch("/api/crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteCategory", categoryId: category.id }) });
    const payload = (await response.json()) as { data?: { deleted: string }; error?: string };
    if (payload.data) setCatConfig((current) => current.filter((c) => c.id !== category.id));
    else setNotice(payload.error ?? "删除失败");
  }

  async function resetAccountPassword(partner: CrmPartner) {
    if (!window.confirm(`重置「${partner.name}」主账号的登录密码？将生成一次性临时密码。`)) return;
    const response = await fetch("/api/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetAccountPassword", id: partner.id }),
    });
    const payload = (await response.json()) as { data?: { identifier: string; tempPassword: string }; error?: string };
    if (payload.data) setNotice(`已重置 ${payload.data.identifier} 的密码 · 一次性临时密码：${payload.data.tempPassword}，请安全转交，登录后立即修改。`);
    else setNotice(payload.error ?? "重置失败");
  }

  async function setAccountStatus(partner: CrmPartner, accountStatus: "active" | "disabled") {
    const response = await fetch("/api/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setAccountStatus", id: partner.id, accountStatus }),
    });
    const payload = (await response.json()) as { data?: { identifier: string; status: string }; error?: string };
    if (payload.data) {
      setAccounts((current) => ({ ...current, [partner.id]: { ...current[partner.id], status: payload.data!.status, active: payload.data!.status === "active" ? Math.max(1, current[partner.id]?.active ?? 1) : Math.max(0, (current[partner.id]?.active ?? 1) - 1) } }));
      setNotice(`账号 ${payload.data.identifier} 已${payload.data.status === "active" ? "启用" : "停用"}。`);
    } else setNotice(payload.error ?? "操作失败");
  }

  async function deletePartner(partner: CrmPartner) {
    const label = accountTypeOf(partner.category) === "supplier" ? "供应商" : "合作方";
    if (!(await dialog.confirm(`删除${label}`, { message: `确认删除${label}「${partner.name}」？将同时移除其登录账号，且不可恢复。仍有未结合作方积分或未核销服务记录时，服务端会拒绝删除。`, confirmText: "删除", tone: "danger" }))) return;
    const response = await fetch("/api/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: partner.id }),
    });
    const payload = (await response.json()) as { data?: { deleted: string; accountsRemoved: number }; error?: string };
    if (payload.data) {
      setPartners((current) => current.filter((item) => item.id !== partner.id));
      setNotice(`已删除「${partner.name}」${payload.data.accountsRemoved ? ` 及 ${payload.data.accountsRemoved} 个登录账号` : ""}。`);
    } else {
      setNotice(payload.error ?? "删除失败");
    }
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
      setAccounts((current) => ({ ...current, [partner.id]: { identifier: payload.data!.identifier, status: "active", portal: payload.data!.portal, total: 1, active: 1 } }));
      setNotice(`账号已开通 ✓ 登录地址 mall.meponto.com · 账号 ${payload.data.identifier} · 一次性临时密码 ${payload.data.tempPassword}。请安全转交给对方；对方登录后点右上角头像「修改密码」自行设置新密码。`);
    } else {
      setNotice(payload.error ?? "Failed to create account");
    }
  }

  const columns: Array<DataColumn<CrmPartner>> = [
    {
      key: "partner",
      label: "Partner",
      className: "max-w-[220px]",
      render: (partner) => (
        <div>
          <div className="truncate font-black">{partner.name}</div>
          <div className="text-xs font-bold text-[var(--muted)]">{partner.tier} · {accountTypeOf(partner.category) === "supplier" ? "供应商" : "合作方"}</div>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (partner) => <span className="font-bold text-[var(--muted-strong)]">{partner.category}</span> },
    {
      key: "contact",
      label: "Contact",
      render: (partner) => (
        <div>
          <div>{partner.contactName}</div>
          <div className="text-xs font-bold text-[var(--muted)]">{partner.phone}</div>
        </div>
      ),
    },
    { key: "bairro", label: "Bairro", render: (partner) => partner.bairro },
    { key: "status", label: "Status", render: (partner) => <StatusBadge tone={statusTone(partner.status)} label={partner.status} /> },
    { key: "risk", label: "Risk", render: (partner) => <StatusBadge tone={riskTone(partner.risk)} label={partner.risk} /> },
    {
      key: "services",
      label: "Services",
      className: "max-w-[200px]",
      render: (partner) => (
        <div className="flex flex-wrap gap-1">
          {partner.services.map((service) => (
            <span className="tag" key={service}>{service}</span>
          ))}
        </div>
      ),
    },
    {
      key: "account",
      label: "登录账号",
      render: (partner) => (
        <div className="text-xs">
          {accounts[partner.id] ? (
            <>
              <div className="break-all font-mono text-[var(--muted)]">{accounts[partner.id].identifier}</div>
              <div className="mt-0.5 flex items-center gap-1">
                <StatusBadge tone={accounts[partner.id].status === "active" ? "success" : "neutral"} label={accounts[partner.id].status === "active" ? "启用中" : "已停用"} />
                {accounts[partner.id].total > 1 ? <span className="font-bold text-[var(--muted)]">共 {accounts[partner.id].total} 个</span> : null}
              </div>
            </>
          ) : (
            <span className="font-bold text-[var(--muted)]">未开通</span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Ações",
      render: (partner) => (
        <div className="flex flex-wrap gap-1.5">
          {partner.status !== "Active" ? (
            <button type="button" onClick={() => void setStatus(partner, "Active")} className="h-8 rounded-[7px] border border-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent)]">批准</button>
          ) : (
            <button type="button" onClick={() => void setStatus(partner, "Suspended")} className="h-8 rounded-[7px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)]">挂起</button>
          )}
          <button type="button" onClick={() => startEdit(partner)} className="h-8 rounded-[7px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">编辑/改位置</button>
          {accounts[partner.id] ? (
            <>
              <button type="button" onClick={() => void resetAccountPassword(partner)} className="h-8 rounded-[7px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">重置密码</button>
              {accounts[partner.id].status === "active" ? (
                <button type="button" onClick={() => void setAccountStatus(partner, "disabled")} className="h-8 rounded-[7px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)]">停用账号</button>
              ) : (
                <button type="button" onClick={() => void setAccountStatus(partner, "active")} className="h-8 rounded-[7px] border border-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent)]">启用账号</button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => void provisionAccount(partner)} className="h-8 rounded-[7px] border border-[var(--accent)] px-2.5 text-xs font-black text-[var(--accent)]">开通账号</button>
          )}
          <button type="button" onClick={() => void deletePartner(partner)} className="h-8 rounded-[7px] border border-[#c4423b]/40 px-2.5 text-xs font-black text-[#c4423b] hover:border-[#c4423b]">删除</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Panel-level actions (was the PageTitle action slot — moved in so both
          homes, PontoSys page and PontoMall tab, get the same workbench). */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => setCatManagerOpen(true)} className="h-10 rounded-[8px] border border-[var(--line)] px-3 text-sm font-black text-[var(--muted)] hover:border-[var(--accent)]">类型管理</button>
        <AddButton label="Add Partner" onClick={startCreate} />
      </div>

      {notice ? (
        <div className="panel mb-3 flex items-start justify-between gap-3 border-l-4 border-[var(--accent)] p-3 text-sm font-bold">
          <span className="break-all">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[var(--muted)]">✕</button>
        </div>
      ) : null}

      {/* Stats */}
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Active Partners" value={booting ? "…" : String(activeCount)} />
        <Stat label="Monthly Cases" value={booting ? "…" : String(monthlyVolume)} />
        <Stat label="Vehicles Available" value={booting ? "…" : String(vehiclesAvailable)} />
        <Stat label="Review Queue" value={booting ? "…" : String(reviewCount)} />
      </section>

      {/* Toolbar: search + category / status / risk filters */}
      <div className="mt-4">
        <Toolbar
          right={
            <div className="flex items-center gap-2">
              <Pager page={safePage} pages={pages} total={filteredPartners.length} onPage={setPage} />
              <select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value); setPage(1); }} className={filterSelect}>
                <option value="All Risk">All Risk</option>
                {risks.map((risk) => (
                  <option key={risk} value={risk}>{risk}</option>
                ))}
              </select>
            </div>
          }
        >
          <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Search partners, contacts, phone, bairro" className="w-72" />
          <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} className={filterSelect}>
            <option value="All Categories">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className={filterSelect}>
            <option value="All Status">All Status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </Toolbar>
      </div>

      {/* Partner table — review actions stay inline per row */}
      <div className="mt-4">
        {booting ? (
          <Skeleton rows={7} />
        ) : (
          <DataTable<CrmPartner>
            columns={columns}
            rows={pagedPartners}
            rowKey={(partner) => partner.id}
            minWidth={1180}
            empty="No partners match the filters."
          />
        )}
      </div>

      {/* Create / edit drawer (with the rider-app map picker) */}
      <Drawer
        open={formOpen}
        onClose={closeForm}
        width={640}
        ariaLabel={editingId ? "编辑合作方" : "Add Partner"}
        title={<div className="text-sm font-black uppercase">{editingId ? "编辑合作方 / 改位置" : "Add Partner"}</div>}
      >
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={input} placeholder="Partner name" />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CrmPartnerCategory })} className={input}>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className={input} placeholder="Contact" />
          <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={input} placeholder="Phone" />
          <input value={form.bairro} onChange={(event) => setForm({ ...form, bairro: event.target.value })} className={input} placeholder="Bairro" />
          <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} className={input} placeholder="Owner" />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CrmPartnerStatus })} className={input}>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value as CrmPartnerTier })} className={input}>
            {tiers.map((tier) => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
          <select value={form.risk} onChange={(event) => setForm({ ...form, risk: event.target.value as CrmPartnerRisk })} className={input}>
            {risks.map((risk) => (
              <option key={risk} value={risk}>{risk}</option>
            ))}
          </select>
          <input type="number" min="0" value={form.monthlyVolume} onChange={(event) => setForm({ ...form, monthlyVolume: Number(event.target.value) })} className={input} placeholder="Monthly cases" />
          <input type="number" min="0" value={form.vehiclesAvailable} onChange={(event) => setForm({ ...form, vehiclesAvailable: Number(event.target.value) })} className={input} placeholder="Vehicles" />
          <input value={form.services} onChange={(event) => setForm({ ...form, services: event.target.value })} className={input} placeholder="Services, comma separated" />
          <div className="sm:col-span-2">
            <div className="mb-1 text-[11px] font-black uppercase text-[var(--muted)]">服务点位置（点地图或拖图钉 · 骑手 App 地图按此显示）</div>
            <div ref={mapDiv} className="h-56 w-full overflow-hidden rounded-[10px] border border-[var(--line)]" style={{ background: "#dfe7ef" }} />
            <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">坐标 {form.lat?.toFixed(5)}, {form.lng?.toFixed(5)}</div>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={isSaving} className="h-11 rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">
              {isSaving ? "Saving" : editingId ? "保存修改" : "Create Partner"}
            </button>
            <button type="button" onClick={closeForm} className="h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-black text-[var(--text-soft)]">
              Cancel
            </button>
          </div>
        </form>
      </Drawer>

      {/* Category manager drawer */}
      <Drawer
        open={catManagerOpen}
        onClose={() => { setCatManagerOpen(false); setCatForm({ id: null, label: "", accountType: "partner" }); }}
        width={520}
        ariaLabel="类型管理"
        title={<div className="text-sm font-black uppercase">合作伙伴类型</div>}
      >
        <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">每个类型决定开通账号后进哪个后台</div>
        <p className="mb-3 text-[11px] font-bold text-[var(--muted)]">落点「供应链」→ 登录进 /mall/supplier(供应链后台);落点「Partner」→ 进 /partner-points(服务点)。</p>
        <div className="space-y-2">
          {[...catConfig].sort((a, b) => a.sort - b.sort).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
              <span className="font-black">{c.label}</span>
              <StatusBadge tone={c.accountType === "supplier" ? "info" : "neutral"} label={c.accountType === "supplier" ? "供应链 → /mall/supplier" : "Partner → /partner-points"} />
              {!c.active && <span className="text-[11px] font-bold text-[var(--muted)]">已停用</span>}
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => setCatForm({ id: c.id, label: c.label, accountType: c.accountType })} className="h-8 rounded-[7px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">编辑</button>
                <button type="button" onClick={() => void removeCategory(c)} className="h-8 rounded-[7px] border border-[#c4423b]/40 px-2.5 text-xs font-black text-[#c4423b]">删除</button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3">
          <label className="text-[11px] font-black text-[var(--muted)]">类型名称
            <input value={catForm.label} onChange={(e) => setCatForm((f) => ({ ...f, label: e.target.value }))} placeholder="如 供应商 / 加油站" className={`mt-1 ${input}`} />
          </label>
          <label className="text-[11px] font-black text-[var(--muted)]">落点(账号类型)
            <select value={catForm.accountType} onChange={(e) => setCatForm((f) => ({ ...f, accountType: e.target.value as "supplier" | "partner" }))} className={`mt-1 ${input}`}>
              <option value="partner">Partner 服务点 → /partner-points</option>
              <option value="supplier">供应链 → /mall/supplier</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!catForm.label.trim()} onClick={() => void saveCategory()} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">{catForm.id ? "保存修改" : "新增类型"}</button>
            {catForm.id && <button type="button" onClick={() => setCatForm({ id: null, label: "", accountType: "partner" })} className="h-10 rounded-[8px] border border-[var(--line)] px-3 text-sm font-black text-[var(--muted)]">取消</button>}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
