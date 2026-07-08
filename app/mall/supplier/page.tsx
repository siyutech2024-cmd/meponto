"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Building2, ChevronRight, CircleDollarSign, ClipboardList, Download, LayoutDashboard, PackagePlus, RefreshCcw, Tags, Truck, UserPlus, Users } from "lucide-react";
import { AppShell, Badge, FormDialog } from "../../components/ui";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import type { MarketplaceProduct } from "../../lib/points";
import type { PriceChangeRequest, PurchaseOrder, SupplierStatement } from "../../lib/mall-ops";
import { poStatusLabel, statementStatusLabel } from "../../lib/mall-ops";
import type { FranchisePurchaseOrder } from "../../lib/procurement";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";

type SupplierProfileT = { id: string; companyName: string; brand: string; cnpj: string; contactName: string; contactEmail: string; contactPhone: string; address: string; pixKey: string; logoUrl: string; about: string; updatedAt?: string };
type TeamMember = { id: string; name: string; identifier: string; phone: string; role: string; status: string; organization?: string; createdAt: string; lastLoginAt?: string };
type SupplierOrder = { id: string; productName: string; createdAt: string; status: string; accountType: string; supplyPrice: number; station: string; franchise: string };
type SupplierData = { profile: SupplierProfileT; team: TeamMember[]; orders: SupplierOrder[] };

/**
 * Supplier supply-chain workspace (supplier.meponto.com): catalog + quotes,
 * price-change requests, purchase orders, monthly statements and a
 * performance dashboard — scoped to the logged-in supplier organization.
 */

const statusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待商城定价" };

type OpsPayload = {
  priceChanges: PriceChangeRequest[];
  purchaseOrders: PurchaseOrder[];
  statements: SupplierStatement[];
  summary: { orders: number; pointsGmv: number; cashGmv: number; daily: Array<{ date: string; count: number }> };
};

const TABS = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "catalog", label: "商品与报价", icon: Tags },
  { id: "orders", label: "订单", icon: ClipboardList },
  { id: "pos", label: "物流·补货", icon: Boxes },
  { id: "statements", label: "账单·对账", icon: Truck },
  { id: "prices", label: "调价申请", icon: CircleDollarSign },
  { id: "company", label: "公司资料", icon: Building2 },
  { id: "team", label: "团队账户", icon: Users },
] as const;

const orderStatusLabel: Record<string, string> = { created: "待履约", arrived: "已到站", fulfilled: "已完成", held: "审核中" };


function Stat({ label, value, hint, onClick }: { label: string; value: string; hint?: string; onClick?: () => void }) {
  return (
    <div className={`panel p-4${onClick ? " cursor-pointer transition-colors hover:border-[var(--accent)]" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="text-[11px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

/** Page-local fallback while the ops backend rolls out the "disputed" state. */
const extraStatementLabel: Record<string, string> = { disputed: "有异议·待总部处理" };

export default function SupplierWorkspacePage() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [supplierName, setSupplierName] = useState("");
  const [sup, setSup] = useState<SupplierData | null>(null);
  const emptyProfile: SupplierProfileT = { id: "", companyName: "", brand: "", cnpj: "", contactName: "", contactEmail: "", contactPhone: "", address: "", pixKey: "", logoUrl: "", about: "" };
  const [profileForm, setProfileForm] = useState<SupplierProfileT>(emptyProfile);
  const [member, setMember] = useState({ name: "", identifier: "", phone: "" });
  const [newCred, setNewCred] = useState<{ identifier: string; tempPassword: string } | null>(null);
  const [openStmt, setOpenStmt] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [fpos, setFpos] = useState<FranchisePurchaseOrder[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const emptyForm = { name: "", supplyPrice: "", deliveryCycleDays: "7", stock: "", description: "", imageUrl: "", category: "", isVirtual: false, audience: "rider", type: "equipment" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [pixDraft, setPixDraft] = useState("");
  const [orderFilter, setOrderFilter] = useState("");
  /** PO currently being shipped via the structured ship dialog (tracking no + note). */
  const [shipTarget, setShipTarget] = useState<PurchaseOrder | null>(null);

  // Compress a picked image to a small JPEG and upload it (Supabase Storage when
  // available, else an inline data URL). Returns the final URL, or null on error.
  async function processImage(file: File, maxEdge: number): Promise<string | null> {
    if (!file.type.startsWith("image/")) {
      setMessage({ tone: "err", text: "Selecione um arquivo de imagem." });
      return null;
    }
    if (file.size > 15 * 1024 * 1024) {
      setMessage({ tone: "err", text: "Imagem muito grande (máx. 15 MB)." });
      return null;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("img"));
        i.src = dataUrl;
      });
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL("image/jpeg", 0.72);
      let finalUrl = out;
      try {
        const res = await fetch("/api/mall/upload", { method: "POST", headers, body: JSON.stringify({ dataUrl: out }) });
        const payload = await res.json().catch(() => ({}));
        if (res.ok && payload?.url) finalUrl = payload.url as string;
      } catch {
        /* storage unavailable — keep the inline data URL */
      }
      return finalUrl;
    } catch {
      setMessage({ tone: "err", text: "Não foi possível processar a imagem. Tente JPG ou PNG (HEIC do iPhone pode não funcionar)." });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function onPickImage(file: File) {
    const url = await processImage(file, 600);
    if (url) setForm((prev) => ({ ...prev, imageUrl: url }));
  }

  // Logo upload for the company profile — also auto-saves so it shows immediately.
  async function onPickLogo(file: File) {
    const url = await processImage(file, 320);
    if (!url) return;
    setProfileForm((prev) => ({ ...prev, logoUrl: url }));
    const saved = await supplierPost({ action: "saveProfile", ...profileForm, logoUrl: url }, "Logo 已更新");
    if (saved) setSup((prev) => (prev ? { ...prev, profile: saved as SupplierProfileT } : prev));
  }

  function startEdit(product: MarketplaceProduct) {
    setEditingId(product.id);
    setForm({
      name: product.name ?? "",
      supplyPrice: String(product.supplyPrice ?? ""),
      deliveryCycleDays: String(product.deliveryCycleDays ?? 7),
      stock: String(product.stock ?? ""),
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
      category: product.category ?? "",
      isVirtual: product.isVirtual === true,
      audience: product.audience ?? "rider",
      type: product.type ?? "equipment",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const load = useCallback(async () => {
    const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
    const sessionPayload = await sessionRes.json().catch(() => ({}));
    const organization = (sessionPayload?.user?.organization as string) || "";
    setSupplierName(organization);
    const [mallRes, opsRes] = await Promise.all([
      fetch("/api/mall", { headers, cache: "no-store" }),
      fetch("/api/mall/ops", { headers, cache: "no-store" }),
    ]);
    if (mallRes.ok) {
      const payload = await mallRes.json();
      const rows = (payload.data?.products ?? []) as MarketplaceProduct[];
      // Strictly scope to this supplier's own SKUs. An empty org shows nothing
      // (never the full catalog) so an unbound account can't see other suppliers.
      setProducts(rows.filter((product) => Boolean(organization) && product.supplierName === organization));
    }
    if (opsRes.ok) setOps((await opsRes.json()).data);
    // Franchise direct-ship purchase orders (procurement full chain).
    const fpoRes = await fetch("/api/mall/procurement", { headers, cache: "no-store" }).catch(() => null);
    if (fpoRes && fpoRes.ok) setFpos(((await fpoRes.json()).data?.fpos ?? []) as FranchisePurchaseOrder[]);
    const supRes = await fetch("/api/supplier", { headers, cache: "no-store" }).catch(() => null);
    if (supRes && supRes.ok) {
      const d = (await supRes.json()).data as SupplierData;
      setSup(d);
      setProfileForm({ ...emptyProfile, ...d.profile });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  async function post(path: "/api/mall" | "/api/mall/ops", body: Record<string, unknown>, okText?: string) {
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("dynReqFail", { s: response.status }) });
      return null;
    }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }

  async function fpoPost(body: Record<string, unknown>, okText?: string) {
    const response = await fetch("/api/mall/procurement", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage({ tone: "err", text: payload.error ?? t("dynReqFail", { s: response.status }) }); return null; }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }

  async function supplierPost(body: Record<string, unknown>, okText?: string) {
    const response = await fetch("/api/supplier", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage({ tone: "err", text: payload.error ?? t("dynReqFail", { s: response.status }) }); return null; }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }

  function exportStatement(statement: SupplierStatement) {
    const rows = statement.lines.map((l) => [l.date, l.orderId, l.productName, l.supplyPrice.toFixed(2)]);
    rows.push(["合计", "", "", statement.total.toFixed(2)]);
    downloadCsv(`extrato-${supplierName}-${statement.month}`, ["日期", "订单", "商品", "供货价"], rows);
  }

  const payableTotal = (ops?.statements ?? []).filter((statement) => statement.status !== "paid").reduce((sum, statement) => sum + statement.total, 0);
  const paidTotal = (ops?.statements ?? []).filter((statement) => statement.status === "paid").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(ops?.summary.daily ?? []).map((day) => day.count));
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExpected = (sup?.orders ?? []).filter((o) => o.createdAt.slice(0, 7) === monthKey && (o.status === "fulfilled" || o.status === "arrived")).reduce((sum, o) => sum + o.supplyPrice, 0);
  const draftStatementCount = (ops?.statements ?? []).filter((statement) => statement.status === "draft").length;
  const filteredOrders = (sup?.orders ?? []).filter((o) => !orderFilter || o.status === orderFilter);

  return (
    <AppShell>
      {message && (
        <div className={`mb-4 rounded-[10px] border px-4 py-3 text-sm font-bold ${message.tone === "ok" ? "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]" : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
          {message.text}
        </div>
      )}

      {/* Structured ship dialog: tracking number + note → merged shipNote text. */}
      <FormDialog
        open={shipTarget !== null}
        title="标记发货"
        body={shipTarget ? `补货单 ${shipTarget.id} · ${shipTarget.items.reduce((sum, item) => sum + item.qty, 0)} 件。填写物流信息后通知商城收货。` : undefined}
        fields={[
          { key: "trackingNo", label: "物流单号", placeholder: "如 BR123456789" },
          { key: "note", label: "备注（可空）", placeholder: "承运商 / 预计送达等" },
        ]}
        confirmText="确认发货"
        onClose={() => setShipTarget(null)}
        onConfirm={(values) => {
          if (!shipTarget) return;
          const parts = [values.trackingNo.trim() ? `单号: ${values.trackingNo.trim()}` : "", values.note.trim()].filter(Boolean);
          const poId = shipTarget.id;
          setShipTarget(null);
          void post("/api/mall/ops", { action: "shipPO", poId, shipNote: parts.join(" · ") }, "已标记发货");
        }}
      />

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:items-start lg:gap-6">
        {/* Left rail — company card + vertical section nav */}
        <aside className="mb-5 space-y-3 lg:mb-0 lg:sticky lg:top-[84px]">
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {sup?.profile.logoUrl ? <img src={sup.profile.logoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xl font-black text-[var(--accent)]">{(sup?.profile.companyName || supplierName || "S").slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="mt-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">供应商</div>
            <div className="truncate text-base font-black leading-tight">{sup?.profile.companyName || supplierName || "供应商"}</div>
            <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{sup?.profile.cnpj ? `CNPJ ${sup.profile.cnpj}` : "资料未完善"}</div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-2.5">
              <span className="text-[10px] font-black uppercase text-[var(--muted)]">待收货款</span>
              <span className="text-sm font-black text-[var(--accent)]">R$ {payableTotal.toFixed(2)}</span>
            </div>
          </div>

          <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-3.5 text-[13px] font-black transition-colors lg:w-full ${tab === id ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"}`}>
                <Icon size={16} /> <span className="whitespace-nowrap">{label}</span>
                {id === "pos" && (ops?.purchaseOrders ?? []).some((po) => po.status === "ordered") && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--danger)]" />}
                {id === "statements" && (ops?.statements ?? []).some((s) => s.status === "draft") && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--danger)]" />}
              </button>
            ))}
          </nav>

          <button type="button" onClick={() => void load()} className="hidden h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--line)] text-[12px] font-black text-[var(--muted)] hover:border-[var(--accent)] lg:inline-flex">
            <RefreshCcw size={13} /> 刷新
          </button>
        </aside>

        <div className="min-w-0 space-y-5">

      {/* ============ 商品与报价 ============ */}
      {tab === "catalog" && (
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><PackagePlus size={14} /> {editingId ? "编辑商品（仅未定价商品）" : "提报新商品（商城定价后上架）"}</div>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { key: "name", label: "商品名称 *" },
                { key: "supplyPrice", label: "供货价 R$ *" },
                { key: "deliveryCycleDays", label: "供货周期（天）" },
                { key: "stock", label: "首批库存" },
                { key: "category", label: "分类（如 Equipamento）" },
              ].map((field) => (
                <label key={field.key} className="text-[11px] font-black text-[var(--muted)]">{field.label}
                  <input value={(form as Record<string, unknown>)[field.key] as string} onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                </label>
              ))}
              <label className="text-[11px] font-black text-[var(--muted)]">面向对象
                <select value={form.audience} onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                  <option value="rider">骑手</option>
                  <option value="partner">合作方 Partner</option>
                  <option value="both">两者皆可</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-[var(--muted)]">类型
                <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                  <option value="equipment">装备</option>
                  <option value="safety_item">安全用品</option>
                  <option value="fuel_coupon">加油券</option>
                  <option value="maintenance_coupon">维修券</option>
                  <option value="phone_data">话费/流量</option>
                  <option value="partner_voucher">合作方券</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-[var(--muted)] md:col-span-3">描述
                <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              </label>
              <div className="md:col-span-3">
                <div className="text-[11px] font-black text-[var(--muted)]">商品图片（上传文件或粘贴 URL）</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {form.imageUrl ? <img src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg text-[var(--muted)]">🖼️</div>}
                  </div>
                  <label className="cursor-pointer rounded-[8px] border border-[var(--line)] px-3 py-2 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">
                    {uploading ? "处理中…" : "上传图片"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickImage(f); e.target.value = ""; }} />
                  </label>
                  <input value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl} onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="或粘贴图片 URL" className="h-9 min-w-0 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                  {form.imageUrl && <button type="button" onClick={() => setForm((prev) => ({ ...prev, imageUrl: "" }))} className="text-xs font-black text-[var(--danger)]">清除</button>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:col-span-3">
                <label className="flex h-10 cursor-pointer items-center gap-2 text-xs font-black text-[var(--muted)]">
                  <input type="checkbox" checked={form.isVirtual} onChange={(e) => setForm((prev) => ({ ...prev, isVirtual: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> 虚拟商品（即时发码）
                </label>
                <button
                  type="button"
                  disabled={uploading || !form.name.trim() || !(Number(form.supplyPrice) > 0)}
                  onClick={() => {
                    const fields = { name: form.name.trim(), supplyPrice: Number(form.supplyPrice), deliveryCycleDays: Number(form.deliveryCycleDays) || 7, stock: Number(form.stock) || 0, description: form.description, imageUrl: form.imageUrl, category: form.category, isVirtual: form.isVirtual, audience: form.audience, type: form.type };
                    const payload = editingId ? { action: "supplierUpdateProduct", productId: editingId, ...fields } : { action: "supplierAddProduct", supplierName, ...fields };
                    void post("/api/mall", payload, editingId ? "已保存修改" : "已提报，等待商城定价上架").then(() => { setForm(emptyForm); setEditingId(null); });
                  }}
                  className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50"
                >{editingId ? "保存修改" : "提报商品"}</button>
                {editingId && <button type="button" onClick={() => { setForm(emptyForm); setEditingId(null); }} className="text-xs font-black text-[var(--muted)] underline">取消编辑</button>}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {products.filter((product) => product.supplierName === supplierName).map((product) => (
              <div key={product.id} className="panel flex flex-wrap items-center gap-3 p-4">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg">🎁</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black">{product.name}</span>
                    <Badge value={statusLabel[product.status] ?? product.status} />
                  </div>
                  <div className="text-xs font-bold text-[var(--muted)]">供货价 R$ {(product.supplyPrice ?? 0).toFixed(2)} · 库存 {product.stock} · 周期 {product.deliveryCycleDays ?? 7} 天{product.pointsPrice ? ` · 商城售价 ${product.pointsPrice} 分${product.cashPriceBRL ? ` + R$${product.cashPriceBRL.toFixed(2)}` : ""}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {product.supplierName === supplierName && product.status === "pending_pricing" ? (
                    <>
                      <button type="button" onClick={() => startEdit(product)} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">编辑</button>
                      <button type="button" onClick={async () => { if (await dialog.confirm("删除商品", { message: t("dynDelUnpriced", { n: product.name }), confirmText: "删除", tone: "danger" })) void post("/api/mall", { action: "supplierDeleteProduct", productId: product.id }, "已删除"); }} className="h-9 rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger)]">删除</button>
                    </>
                  ) : (
                    <>
                      <input value={priceDraft[product.id] ?? ""} onChange={(e) => setPriceDraft((prev) => ({ ...prev, [product.id]: e.target.value }))} placeholder="新供货价" className="h-9 w-24 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                      <button type="button" disabled={!(Number(priceDraft[product.id]) > 0)} onClick={() => void post("/api/mall/ops", { action: "requestPriceChange", productId: product.id, newPrice: Number(priceDraft[product.id]) }, "调价申请已提交，等待商城审批").then(() => setPriceDraft((prev) => ({ ...prev, [product.id]: "" })))} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)] disabled:opacity-50">申请调价</button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {products.filter((product) => product.supplierName === supplierName).length === 0 && <div className="panel p-10 text-center text-sm font-bold text-[var(--muted)]">还没有你的商品，先在上方提报。</div>}
          </div>
        </div>
      )}

      {/* ============ 调价申请 ============ */}
      {tab === "prices" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">调价申请与价格历史</div>
          <div className="space-y-2">
            {(ops?.priceChanges ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black">{row.productName}</div>
                  <div className="text-xs font-bold text-[var(--muted)]">R$ {row.oldPrice.toFixed(2)} → R$ {row.newPrice.toFixed(2)} · 提交于 {row.createdAt}{row.decidedAt ? ` · 处理于 ${row.decidedAt}` : ""}</div>
                </div>
                <Badge value={row.status === "pending" ? "待审批" : row.status === "approved" ? "已批准" : "已拒绝"} />
              </div>
            ))}
            {(ops?.priceChanges ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">暂无调价记录——在「商品与报价」里对单个商品发起调价。</div>}
          </div>
        </div>
      )}

      {/* ============ 补货单 ============ */}
      {tab === "pos" && (
        <div className="panel p-5">
          <div className="mb-1 text-xs font-black uppercase text-[var(--muted)]">商城下达的补货单 · 确认 → 发货 → 商城入库</div>
          <p className="mb-3 text-[11px] font-bold text-[var(--muted)]">代销模式:补货单仅为备货/调拨流转,<b>不产生货款</b>。结算以月度对账(履约订单 × 供货价)为准,下方金额仅为备货参考成本。</p>
          <div className="space-y-2">
            {(ops?.purchaseOrders ?? []).map((po) => (
              <div key={po.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Boxes size={15} className="text-[var(--muted)]" />
                  <span className="text-sm font-black">{po.id}</span>
                  <Badge value={poStatusLabel[po.status]} />
                  <span className="text-xs font-bold text-[var(--muted)]">{po.items.reduce((sum, item) => sum + item.qty, 0)} 件 · 备货参考成本 R$ {po.totalCost.toFixed(2)} · {po.createdAt}</span>
                  <span className="ml-auto flex gap-1.5">
                    {po.status === "ordered" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmPO", poId: po.id }, "已确认，请按周期发货")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">确认接单</button>}
                    {po.status === "confirmed" && <button type="button" onClick={() => setShipTarget(po)} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">标记发货</button>}
                  </span>
                </div>
                <div className="mt-1 text-xs font-bold text-[var(--muted)]">{po.items.map((item) => `${item.name}×${item.qty}`).join("、")}{po.note ? t("dynNote", { x: po.note }) : ""}{po.shipNote ? t("dynLogistics", { x: po.shipNote }) : ""}</div>
              </div>
            ))}
            {(ops?.purchaseOrders ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">暂无补货单。</div>}
          </div>

          {/* 加盟商直发订货单（FPO）:确认 → 发货 → 站点收货入库 */}
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">{t("spFpoTitle")}</div>
            <div className="space-y-2">
              {fpos.map((fpo) => (
                <div key={fpo.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Boxes size={15} className="text-[var(--muted)]" />
                    <span className="text-sm font-black">{fpo.id}</span>
                    <Badge value={fpo.mode === "buyout" ? t("fpModeBuyout") : t("fpModeConsignment")} />
                    <Badge value={fpo.status} />
                    <span className="text-xs font-bold text-[var(--muted)]">{fpo.franchise} → {fpo.stationName} · {fpo.items.reduce((sum, item) => sum + item.qty, 0)} 件 · {fpo.createdAt}</span>
                    <span className="ml-auto flex gap-1.5">
                      {fpo.status === "approved" && <button type="button" onClick={() => void fpoPost({ action: "confirmFPO", fpoId: fpo.id }, "已确认备货")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">确认接单</button>}
                      {fpo.status === "confirmed" && <button type="button" onClick={() => { const note = prompt(t("spShipNote")) ?? ""; void fpoPost({ action: "shipFPO", fpoId: fpo.id, shipNote: note }, "已标记发货"); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">标记发货</button>}
                      {fpo.status === "shipped" && <button type="button" onClick={() => void fpoPost({ action: "arriveFPO", fpoId: fpo.id }, "已登记到站")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black">到站登记</button>}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-[var(--muted)]">{fpo.items.map((item) => `${item.name}×${item.qty}`).join("、")}{fpo.shipNote ? t("dynLogistics", { x: fpo.shipNote }) : ""}</div>
                </div>
              ))}
              {fpos.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">{t("spFpoNone")}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ============ 对账单 ============ */}
      {tab === "statements" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">月度对账单 · 确认后商城付款</div>
          <div className="space-y-2">
            {(ops?.statements ?? []).map((statement) => (
              <div key={statement.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CircleDollarSign size={15} className="text-[var(--muted)]" />
                  <span className="text-sm font-black">{statement.month}</span>
                  <Badge value={(statementStatusLabel as Record<string, string>)[statement.status] ?? extraStatementLabel[statement.status] ?? statement.status} />
                  <button type="button" onClick={() => setOpenStmt((prev) => { const n = new Set(prev); n.has(statement.id) ? n.delete(statement.id) : n.add(statement.id); return n; })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)]">
                    <ChevronRight size={13} className={`transition-transform ${openStmt.has(statement.id) ? "rotate-90" : ""}`} />{statement.lines.length} 笔 · <b className="text-[var(--text)]">R$ {statement.total.toFixed(2)}</b>
                  </button>
                  <span className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={() => exportStatement(statement)} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]"><Download size={12} /> CSV</button>
                    {statement.status === "draft" && (
                      <>
                        <input value={pixDraft} onChange={(e) => setPixDraft(e.target.value)} placeholder="收款 PIX Key" className="h-8 w-44 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2 font-mono text-xs font-bold outline-none focus:border-[var(--accent)]" />
                        <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmStatement", statementId: statement.id, pixKey: pixDraft }, "已确认对账单，等待商城付款")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">确认无误</button>
                      </>
                    )}
                    {(statement.status === "draft" || statement.status === "confirmed") && (
                      <button
                        type="button"
                        onClick={async () => {
                          const note = await dialog.prompt("对账单异议", { message: `对「${statement.month}」对账单（${statement.lines.length} 笔 · R$ ${statement.total.toFixed(2)}）提出异议，说明与实际不符之处（必填，总部会复核后重新打开）。`, placeholder: "如：缺少订单 xxx / 供货价不符…" });
                          if (note === null) return;
                          if (!note.trim()) { setMessage({ tone: "err", text: "请填写异议原因" }); return; }
                          void post("/api/mall/ops", { action: "disputeStatement", statementId: statement.id, note: note.trim() }, "异议已提交，等待总部处理");
                        }}
                        className="h-8 rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger)]"
                      >有异议</button>
                    )}
                  </span>
                </div>
                {openStmt.has(statement.id) && (
                  <div className="mt-2 overflow-hidden rounded-[8px] border border-[var(--line)]">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-[var(--surface)] text-left font-black uppercase text-[var(--muted)]"><th className="px-3 py-1.5">日期</th><th className="px-3 py-1.5">商品</th><th className="px-3 py-1.5">订单号</th><th className="px-3 py-1.5 text-right">供货价</th></tr></thead>
                      <tbody>
                        {statement.lines.map((l, i) => (
                          <tr key={`${l.orderId}-${i}`} className="border-t border-[var(--line)] font-bold"><td className="px-3 py-1.5">{l.date}</td><td className="px-3 py-1.5">{l.productName}</td><td className="px-3 py-1.5 font-mono text-[var(--muted)]">{l.orderId}</td><td className="px-3 py-1.5 text-right">R$ {l.supplyPrice.toFixed(2)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(statement.status as string) === "disputed" && (statement as SupplierStatement & { disputeNote?: string }).disputeNote && (
                  <div className="mt-1 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{(statement as SupplierStatement & { disputeNote?: string }).disputeNote} · 等待总部复核后重新打开</div>
                )}
                {statement.paidAt && <div className="mt-1 text-xs font-bold" style={{ color: "var(--success)" }}>已付款 · {statement.paidAt}{statement.receiptNote ? ` · ${statement.receiptNote}` : ""}</div>}
              </div>
            ))}
            {(ops?.statements ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">商城生成对账单后会出现在这里（自然月：履约订单 × 供货价）。</div>}
          </div>
        </div>
      )}

      {/* ============ 概览 ============ */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="累计售出（件）" value={String(ops?.summary.orders ?? 0)} hint="兑换订单数" />
            <Stat label="在售商品" value={String(products.filter((product) => product.status === "active").length)} hint={t("dynSkuCount", { n: products.length })} />
            <Stat label="待收货款" value={`R$ ${payableTotal.toFixed(2)}`} hint="未付对账单合计" />
            <Stat label="已结货款" value={`R$ ${paidTotal.toFixed(2)}`} hint="历史已付合计" />
            <Stat label="本月预计回款" value={`R$ ${monthExpected.toFixed(2)}`} hint="实时口径，以月度对账单为准" />
            <Stat label="待确认对账单" value={String(draftStatementCount)} hint="点击前往账单确认" onClick={() => setTab("statements")} />
          </div>
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">近 30 天售出趋势</div>
            <div className="flex h-28 items-end gap-[3px]">
              {(ops?.summary.daily ?? []).map((day) => (
                <div key={day.date} className="group relative flex-1 rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${Math.max(3, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }}>
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">{day.date.slice(5)} · {day.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ============ 订单 ============ */}
      {tab === "orders" && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">本供应商履约订单 · 计入月度对账</div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {["", "created", "arrived", "fulfilled"].map((status) => (
              <button key={status || "all"} type="button" onClick={() => setOrderFilter(status)} className={`rounded-full border px-3.5 py-1.5 text-xs font-black ${orderFilter === status ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
                {status === "" ? "全部" : orderStatusLabel[status]}
              </button>
            ))}
            <button type="button" onClick={() => downloadCsv(`supplier-orders-${supplierName || "meponto"}`, ["订单", "商品", "站点", "加盟商", "状态", "供货价", "时间"], filteredOrders.map((o) => [o.id, o.productName, o.station, o.franchise, orderStatusLabel[o.status] ?? o.status, o.supplyPrice.toFixed(2), o.createdAt]))} className="ml-auto inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]"><Download size={12} /> 导出 CSV</button>
          </div>
          <div className="overflow-x-auto rounded-[8px] border border-[var(--line)]">
            <table className="w-full text-sm">
              <thead><tr className="bg-[var(--surface-raised)] text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="px-3 py-2">订单号</th><th className="px-3 py-2">商品</th><th className="px-3 py-2">日期</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">状态</th><th className="px-3 py-2 text-right">供货价</th></tr></thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--line)] font-bold">
                    <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">{o.id}</td>
                    <td className="px-3 py-2">{o.productName}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{o.createdAt.slice(0, 10)}</td>
                    <td className="px-3 py-2"><span className="tag">{o.accountType === "partner" ? "Partner" : "骑手"}</span></td>
                    <td className="px-3 py-2"><Badge value={orderStatusLabel[o.status] ?? o.status} /></td>
                    <td className="px-3 py-2 text-right">R$ {o.supplyPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredOrders.length === 0 && <div className="py-8 text-center text-xs font-bold text-[var(--muted)]">暂无履约订单。骑手/合作方兑换你的商品并完成后,会计入对账并出现在这里。</div>}
          </div>
        </div>
      )}

      {/* ============ 公司资料 ============ */}
      {tab === "company" && (
        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><Building2 size={14} /> 公司 / 品牌资料</div>

          {/* Logo upload */}
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profileForm.logoUrl ? <img src={profileForm.logoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl font-black text-[var(--accent)]">{(profileForm.companyName || supplierName || "S").slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black uppercase text-[var(--muted)]">公司 Logo</div>
              <p className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">上传方形图片（自动压缩）。会显示在供应商门户与对账单上。</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-[8px] border border-[var(--line)] px-3 py-2 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">
                  {uploading ? "处理中…" : "上传 Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickLogo(f); e.target.value = ""; }} />
                </label>
                <input value={profileForm.logoUrl.startsWith("data:") ? "" : profileForm.logoUrl} onChange={(e) => setProfileForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="或粘贴 Logo URL" className="h-9 min-w-0 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
                {profileForm.logoUrl && <button type="button" onClick={() => setProfileForm((p) => ({ ...p, logoUrl: "" }))} className="text-xs font-black text-[var(--danger)]">清除</button>}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[{ k: "companyName", l: "公司名称" }, { k: "brand", l: "品牌名" }, { k: "cnpj", l: "CNPJ" }, { k: "contactName", l: "联系人" }, { k: "contactEmail", l: "联系邮箱" }, { k: "contactPhone", l: "联系电话" }, { k: "pixKey", l: "收款 PIX Key" }].map((f) => (
              <label key={f.k} className="text-[11px] font-black text-[var(--muted)]">{f.l}
                <input value={(profileForm as unknown as Record<string, string>)[f.k] ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, [f.k]: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              </label>
            ))}
            <label className="text-[11px] font-black text-[var(--muted)] sm:col-span-2 lg:col-span-2">地址
              <input value={profileForm.address} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="text-[11px] font-black text-[var(--muted)] sm:col-span-2 lg:col-span-2">公司简介
              <textarea value={profileForm.about} onChange={(e) => setProfileForm((p) => ({ ...p, about: e.target.value }))} className="mt-1 h-10 min-h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-2.5 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={async () => { const saved = await supplierPost({ action: "saveProfile", ...profileForm }, "公司资料已保存"); if (saved) setSup((prev) => (prev ? { ...prev, profile: saved as SupplierProfileT } : prev)); }} className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]">保存资料</button>
            {sup?.profile.updatedAt && <span className="text-[11px] font-bold text-[var(--muted)]">上次更新 {sup.profile.updatedAt}</span>}
          </div>
        </div>
      )}

      {/* ============ 团队账户 ============ */}
      {tab === "team" && (
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[12px] font-bold text-[var(--muted)]">
            数据隔离：本后台只显示并管理公司 <b className="text-[var(--text)]">{supplierName || "（未绑定公司）"}</b> 的团队与商品。你创建的成员都归属本公司，其它供应商互相不可见。
            {!supplierName && <span className="text-[var(--danger)]"> · 当前账号未绑定公司，请联系总部在 CRM 重新开通。</span>}
          </div>
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><UserPlus size={14} /> 新增团队成员（同公司多人协作)</div>
            <div className="grid gap-2 md:grid-cols-[1.2fr_1.4fr_1fr_auto]">
              <input value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} placeholder="姓名" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <input value={member.identifier} onChange={(e) => setMember({ ...member, identifier: e.target.value })} placeholder="登录邮箱 / 手机" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <input value={member.phone} onChange={(e) => setMember({ ...member, phone: e.target.value })} placeholder="电话(可空)" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <button type="button" disabled={!member.name.trim() || !member.identifier.trim()} onClick={async () => { const d = await supplierPost({ action: "createMember", ...member }, "已创建账号"); if (d) { setNewCred({ identifier: d.identifier, tempPassword: d.tempPassword }); setMember({ name: "", identifier: "", phone: "" }); } }} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">创建账号</button>
            </div>
            {newCred && <div className="mt-3 rounded-[8px] border p-3 text-sm font-bold" style={{ borderColor: "var(--accent)", background: "rgba(245,179,1,.1)" }}>新账号已建:<b>{newCred.identifier}</b> · 一次性临时密码 <span className="font-mono text-[var(--accent)]">{newCred.tempPassword}</span> —— 请转交本人,首次登录后让其修改。</div>}
          </div>
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">团队成员</div>
            <div className="space-y-2">
              {(sup?.team ?? []).map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
                  <span className="font-black">{m.name}</span>
                  <span className="font-mono text-xs text-[var(--muted)]">{m.identifier}</span>
                  {m.organization && <span className="tag text-[10px]">🏢 {m.organization}</span>}
                  <Badge value={m.status === "active" ? "启用中" : "已停用"} />
                  <button type="button" onClick={() => void supplierPost({ action: "toggleMember", userId: m.id }, m.status === "active" ? "已停用" : "已启用")} className="ml-auto h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">{m.status === "active" ? "停用" : "启用"}</button>
                </div>
              ))}
              {(sup?.team ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">还没有团队成员——上面创建账号,公司就能多人一起用这个后台。</div>}
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </AppShell>
  );
}
