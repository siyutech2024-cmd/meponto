"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Building2, CircleDollarSign, ClipboardList, Download, LayoutDashboard, PackagePlus, RefreshCcw, Tags, Truck, UserPlus, Users } from "lucide-react";
import { AppShell, FormDialog } from "../../components/ui";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import type { MarketplaceProduct } from "../../lib/points";
import type { PriceChangeRequest, PurchaseOrder, SupplierStatement } from "../../lib/mall-ops";
import type { FranchisePurchaseOrder } from "../../lib/procurement";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";
import { Chip, DataTable, Drawer, SearchInput, SectionCard, Stat, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn } from "../kit";

type SupplierProfileT = { id: string; companyName: string; brand: string; cnpj: string; contactName: string; contactEmail: string; contactPhone: string; address: string; pixKey: string; logoUrl: string; about: string; updatedAt?: string };
type TeamMember = { id: string; name: string; identifier: string; phone: string; role: string; status: string; organization?: string; createdAt: string; lastLoginAt?: string };
type SupplierOrder = { id: string; productName: string; createdAt: string; status: string; accountType: string; supplyPrice: number; station: string; franchise: string };
type SupplierData = { profile: SupplierProfileT; team: TeamMember[]; orders: SupplierOrder[] };

/**
 * Supplier supply-chain workspace (supplier.meponto.com): catalog + quotes,
 * price-change requests, purchase orders, monthly statements and a
 * performance dashboard — scoped to the logged-in supplier organization.
 * Rebuilt on the shared mall kit (Stat/TodoCard/DataTable/Drawer/SectionCard).
 */

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

/** StatusBadge semantics — green = flowing, amber = waiting on a human, red = exception, gray = terminal. */
const productStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  active: { key: "swPStActive", tone: "success" },
  paused: { key: "swPStPaused", tone: "neutral" },
  pending_pricing: { key: "swPStPending", tone: "warn" },
};
const orderStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  created: { key: "swOStCreated", tone: "success" },
  arrived: { key: "swOStArrived", tone: "success" },
  fulfilled: { key: "swOStFulfilled", tone: "neutral" },
  held: { key: "swOStHeld", tone: "warn" },
};
const poStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  draft: { key: "swPoStDraft", tone: "neutral" },
  ordered: { key: "swPoStOrdered", tone: "warn" },
  confirmed: { key: "swPoStConfirmed", tone: "success" },
  shipped: { key: "swPoStShipped", tone: "success" },
  received: { key: "swPoStReceived", tone: "neutral" },
  cancelled: { key: "swPoStCancelled", tone: "neutral" },
};
const fpoStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  submitted: { key: "fpStSubmitted", tone: "warn" },
  approved: { key: "fpStApproved", tone: "warn" },
  confirmed: { key: "fpStConfirmed", tone: "success" },
  shipped: { key: "fpStShipped", tone: "success" },
  arrived: { key: "fpStArrived", tone: "success" },
  received: { key: "fpStReceived", tone: "neutral" },
  rejected: { key: "fpStRejected", tone: "danger" },
  cancelled: { key: "fpStCancelled", tone: "neutral" },
};
const stmtStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  draft: { key: "swStmtDraft", tone: "warn" },
  confirmed: { key: "swStmtConfirmed", tone: "success" },
  disputed: { key: "swStmtDisputed", tone: "danger" },
  paid: { key: "swStmtPaid", tone: "neutral" },
};
const priceChangeMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  pending: { key: "swPcPending", tone: "warn" },
  approved: { key: "swPcApproved", tone: "success" },
  rejected: { key: "swPcRejected", tone: "danger" },
};

/** Unified secondary button (per design: at most one solid yellow primary per view). */
const btnGhost = "h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50";
const btnDanger = "h-8 rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger)]";
const inputCls = "rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] text-sm font-bold outline-none focus:border-[var(--accent)]";

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
  const [activeStmtId, setActiveStmtId] = useState<string | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [fpos, setFpos] = useState<FranchisePurchaseOrder[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const emptyForm = { name: "", supplyPrice: "", deliveryCycleDays: "7", stock: "", description: "", imageUrl: "", category: "", isVirtual: false, audience: "rider", type: "equipment" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  /** Draft suggested distribution price per product (direct-procurement consent). */
  const [suggestDraft, setSuggestDraft] = useState<Record<string, string>>({});
  const [pixDraft, setPixDraft] = useState("");
  const [orderFilter, setOrderFilter] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
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
    if (!response.ok) {
      // Procurement API errors carry a tri-lingual errorKey — prefer it.
      const key = payload.errorKey as TranslationKey | undefined;
      setMessage({ tone: "err", text: key ? t(key) : payload.error ?? t("dynReqFail", { s: response.status }) });
      return null;
    }
    if (okText) setMessage({ tone: "ok", text: okText });
    void load();
    return payload.data;
  }

  /** Distribution consent as the SERVER resolves it (grandfather rule: a
   *  product already procurement-enabled without the field counts approved). */
  function consentOf(product: MarketplaceProduct): "none" | "pending" | "approved" {
    return product.procurementConsent ?? ((product.procurementMode ?? "off") !== "off" ? "approved" : "none");
  }
  const consentMeta: Record<"none" | "pending" | "approved", { key: TranslationKey; tone: BadgeTone }> = {
    none: { key: "fpoConsentNone", tone: "neutral" },
    pending: { key: "fpoConsentPending", tone: "warn" },
    approved: { key: "fpoConsentApproved", tone: "success" },
  };

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
    rows.push([t("fpTotal"), "", "", statement.total.toFixed(2)]);
    downloadCsv(`extrato-${supplierName}-${statement.month}`, [t("mkColDate"), t("mkColOrder"), t("mkColProduct"), t("swColSupply")], rows);
  }

  const payableTotal = (ops?.statements ?? []).filter((statement) => statement.status !== "paid").reduce((sum, statement) => sum + statement.total, 0);
  const paidTotal = (ops?.statements ?? []).filter((statement) => statement.status === "paid").reduce((sum, statement) => sum + statement.total, 0);
  const maxDaily = Math.max(1, ...(ops?.summary.daily ?? []).map((day) => day.count));
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExpected = (sup?.orders ?? []).filter((o) => o.createdAt.slice(0, 7) === monthKey && (o.status === "fulfilled" || o.status === "arrived")).reduce((sum, o) => sum + o.supplyPrice, 0);
  const draftStatementCount = (ops?.statements ?? []).filter((statement) => statement.status === "draft").length;
  const oq = orderQuery.trim().toLowerCase();
  const filteredOrders = (sup?.orders ?? []).filter((o) =>
    (!orderFilter || o.status === orderFilter) &&
    (!oq || o.id.toLowerCase().includes(oq) || o.productName.toLowerCase().includes(oq) || (o.station ?? "").toLowerCase().includes(oq)));
  const pq = productQuery.trim().toLowerCase();
  const myProducts = products.filter((product) => product.supplierName === supplierName);
  const visibleProducts = myProducts.filter((product) => !pq || product.name.toLowerCase().includes(pq) || (product.category ?? "").toLowerCase().includes(pq));
  const activeStmt = (ops?.statements ?? []).find((statement) => statement.id === activeStmtId) ?? null;

  const badgeOf = (meta: { key: TranslationKey; tone: BadgeTone } | undefined, raw: string) =>
    meta ? <StatusBadge tone={meta.tone} label={t(meta.key)} /> : <StatusBadge tone="neutral" label={raw} />;

  // ---- DataTable column defs ----------------------------------------------

  const productCols: Array<DataColumn<MarketplaceProduct>> = [
    {
      key: "product", label: t("mkColProduct"), render: (product) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-sm">🎁</span>}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black">{product.name}</span>
            {product.category && <span className="block truncate text-[11px] text-[var(--muted)]">{product.category}</span>}
          </span>
        </span>
      ),
    },
    { key: "status", label: t("mkColStatus"), render: (product) => badgeOf(productStatusMeta[product.status], product.status) },
    { key: "supply", label: t("swColSupply"), align: "right", render: (product) => <>R$ {(product.supplyPrice ?? 0).toFixed(2)}</> },
    { key: "stock", label: t("swColStock"), align: "right", render: (product) => <>{product.stock}</> },
    { key: "cycle", label: t("swColCycle"), render: (product) => t("swDays", { n: product.deliveryCycleDays ?? 7 }) },
    {
      key: "mall", label: t("swColMallPrice"), render: (product) =>
        product.pointsPrice ? <>{product.pointsPrice} {t("dynPts")}{product.cashPriceBRL ? ` + R$${product.cashPriceBRL.toFixed(2)}` : ""}</> : <span className="text-[var(--muted)]">—</span>,
    },
    {
      key: "actions", label: t("mkColActions"), align: "right", render: (product) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {product.status === "pending_pricing" ? (
            <>
              <button type="button" onClick={() => startEdit(product)} className={btnGhost}>{t("swEdit")}</button>
              <button type="button" onClick={async () => { if (await dialog.confirm(t("swDelTitle"), { message: t("dynDelUnpriced", { n: product.name }), confirmText: t("swDelBtn"), tone: "danger" })) void post("/api/mall", { action: "supplierDeleteProduct", productId: product.id }, t("swOkDeleted")); }} className={btnDanger}>{t("swDelBtn")}</button>
            </>
          ) : (
            <>
              <input value={priceDraft[product.id] ?? ""} onChange={(e) => setPriceDraft((prev) => ({ ...prev, [product.id]: e.target.value }))} placeholder={t("swNewPricePh")} className={`h-8 w-24 px-2 ${inputCls}`} />
              <button type="button" disabled={!(Number(priceDraft[product.id]) > 0)} onClick={() => void post("/api/mall/ops", { action: "requestPriceChange", productId: product.id, newPrice: Number(priceDraft[product.id]) }, t("swOkPriceReq")).then(() => setPriceDraft((prev) => ({ ...prev, [product.id]: "" })))} className={btnGhost}>{t("swAskPrice")}</button>
            </>
          )}
        </span>
      ),
    },
  ];

  const orderCols: Array<DataColumn<SupplierOrder>> = [
    { key: "id", label: t("mkColOrder"), render: (o) => <span className="font-mono text-xs text-[var(--muted)]">{o.id}</span> },
    { key: "product", label: t("mkColProduct"), render: (o) => o.productName },
    { key: "date", label: t("mkColDate"), render: (o) => <span className="text-[var(--muted)]">{o.createdAt.slice(0, 10)}</span> },
    { key: "type", label: "类型", render: (o) => <span className="tag">{o.accountType === "partner" ? "Partner" : t("swAudRider")}</span> },
    { key: "status", label: t("mkColStatus"), render: (o) => badgeOf(orderStatusMeta[o.status], o.status) },
    { key: "price", label: t("swColSupply"), align: "right", render: (o) => <>R$ {o.supplyPrice.toFixed(2)}</> },
  ];

  const poCols: Array<DataColumn<PurchaseOrder>> = [
    { key: "id", label: t("mkColOrder"), render: (po) => <span className="font-mono text-xs">{po.id}</span> },
    { key: "status", label: t("mkColStatus"), render: (po) => badgeOf(poStatusMeta[po.status], po.status) },
    { key: "qty", label: t("fpQty"), align: "right", render: (po) => <>{po.items.reduce((sum, item) => sum + item.qty, 0)}</> },
    { key: "cost", label: t("swColCost"), align: "right", render: (po) => <>R$ {po.totalCost.toFixed(2)}</> },
    {
      key: "items", label: t("mkColItems"), className: "max-w-[280px]", render: (po) => (
        <span className="block truncate text-xs text-[var(--muted)]">
          {po.items.map((item) => `${item.name}×${item.qty}`).join("、")}{po.note ? t("dynNote", { x: po.note }) : ""}{po.shipNote ? t("dynLogistics", { x: po.shipNote }) : ""}
        </span>
      ),
    },
    { key: "date", label: t("mkColDate"), render: (po) => <span className="text-[var(--muted)]">{po.createdAt.slice(0, 10)}</span> },
    {
      key: "actions", label: t("mkColActions"), align: "right", render: (po) => (
        <span className="inline-flex justify-end gap-1.5">
          {po.status === "ordered" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmPO", poId: po.id }, t("swOkPoConfirmed"))} className={btnGhost}>{t("swConfirmPo")}</button>}
          {po.status === "confirmed" && <button type="button" onClick={() => setShipTarget(po)} className={btnGhost}>{t("swShipPo")}</button>}
          {po.status !== "ordered" && po.status !== "confirmed" && <span className="text-[var(--muted)]">—</span>}
        </span>
      ),
    },
  ];

  const fpoCols: Array<DataColumn<FranchisePurchaseOrder>> = [
    { key: "id", label: t("mkColOrder"), render: (fpo) => <span className="font-mono text-xs">{fpo.id}</span> },
    { key: "mode", label: t("fpoModeCol"), render: (fpo) => <StatusBadge tone="info" label={t(fpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} /> },
    { key: "status", label: t("mkColStatus"), render: (fpo) => badgeOf(fpoStatusMeta[fpo.status], fpo.status) },
    { key: "route", label: `${t("fpoMarginFranchise")} → ${t("fpStation")}`, render: (fpo) => <span className="text-xs">{fpo.franchise} → {fpo.stationName}</span> },
    { key: "qty", label: t("fpQty"), align: "right", render: (fpo) => <>{fpo.items.reduce((sum, item) => sum + item.qty, 0)}</> },
    {
      key: "items", label: t("mkColItems"), className: "max-w-[240px]", render: (fpo) => (
        <span className="block truncate text-xs text-[var(--muted)]">{fpo.items.map((item) => `${item.name}×${item.qty}`).join("、")}{fpo.shipNote ? t("dynLogistics", { x: fpo.shipNote }) : ""}</span>
      ),
    },
    { key: "date", label: t("mkColDate"), render: (fpo) => <span className="text-[var(--muted)]">{fpo.createdAt.slice(0, 10)}</span> },
    {
      key: "actions", label: t("mkColActions"), align: "right", render: (fpo) => (
        <span className="inline-flex justify-end gap-1.5">
          {fpo.status === "approved" && <button type="button" onClick={() => void fpoPost({ action: "confirmFPO", fpoId: fpo.id }, t("swOkFpoConfirmed"))} className={btnGhost}>{t("swConfirmPo")}</button>}
          {fpo.status === "confirmed" && <button type="button" onClick={() => { const note = prompt(t("spShipNote")) ?? ""; void fpoPost({ action: "shipFPO", fpoId: fpo.id, shipNote: note }, t("swOkShipped")); }} className={btnGhost}>{t("swShipPo")}</button>}
          {fpo.status === "shipped" && <button type="button" onClick={() => void fpoPost({ action: "arriveFPO", fpoId: fpo.id }, t("swOkFpoArrived"))} className={btnGhost}>{t("fpoArriveBtn")}</button>}
          {!["approved", "confirmed", "shipped"].includes(fpo.status) && <span className="text-[var(--muted)]">—</span>}
        </span>
      ),
    },
  ];

  const stmtCols: Array<DataColumn<SupplierStatement>> = [
    { key: "month", label: t("fpoMarginMonth"), render: (statement) => <span className="font-black">{statement.month}</span> },
    { key: "status", label: t("mkColStatus"), render: (statement) => badgeOf(stmtStatusMeta[statement.status], statement.status) },
    { key: "lines", label: t("swColLines"), align: "right", render: (statement) => <>{statement.lines.length}</> },
    { key: "total", label: t("mkColAmount"), align: "right", render: (statement) => <>R$ {statement.total.toFixed(2)}</> },
    {
      key: "note", label: "", className: "max-w-[300px]", render: (statement) => (
        <span className="block truncate text-xs text-[var(--muted)]">
          {statement.status === "disputed" && (statement as SupplierStatement & { disputeNote?: string }).disputeNote ? t("swDisputeNote", { x: (statement as SupplierStatement & { disputeNote?: string }).disputeNote }) : statement.paidAt ? t("swPaidLine", { x: statement.paidAt }) : ""}
        </span>
      ),
    },
    { key: "view", label: t("mkColActions"), align: "right", render: () => <span className="text-xs font-black text-[var(--muted)]">{t("mkView")} ›</span> },
  ];

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
        title={t("swShipPo")}
        body={shipTarget ? t("swShipBody", { id: shipTarget.id, n: shipTarget.items.reduce((sum, item) => sum + item.qty, 0) }) : undefined}
        fields={[
          { key: "trackingNo", label: t("swShipTrack"), placeholder: t("swShipTrackPh") },
          { key: "note", label: t("swShipNoteL"), placeholder: t("swShipNotePh") },
        ]}
        confirmText={t("swShipConfirm")}
        onClose={() => setShipTarget(null)}
        onConfirm={(values) => {
          if (!shipTarget) return;
          const parts = [values.trackingNo.trim() ? `${t("swShipTrack")}: ${values.trackingNo.trim()}` : "", values.note.trim()].filter(Boolean);
          const poId = shipTarget.id;
          setShipTarget(null);
          void post("/api/mall/ops", { action: "shipPO", poId, shipNote: parts.join(" · ") }, t("swOkShipped"));
        }}
      />

      {/* Statement detail drawer (was an inline expander). */}
      <Drawer
        open={activeStmt !== null}
        onClose={() => setActiveStmtId(null)}
        width={520}
        ariaLabel={t("swStTitle")}
        title={activeStmt ? (
          <div className="flex items-center gap-2">
            <span className="text-base font-black">{activeStmt.month}</span>
            {badgeOf(stmtStatusMeta[activeStmt.status], activeStmt.status)}
            <span className="text-xs font-bold text-[var(--muted)]">{t("swLinesCount", { n: activeStmt.lines.length })}</span>
          </div>
        ) : null}
      >
        {activeStmt && (
          <div className="space-y-4">
            <div className="flex items-end justify-between rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <div>
                <div className="text-[11px] font-black uppercase text-[var(--muted)]">{t("fpTotal")}</div>
                <div className="mt-1 text-2xl font-black">R$ {activeStmt.total.toFixed(2)}</div>
              </div>
              <button type="button" onClick={() => exportStatement(activeStmt)} className={`inline-flex items-center gap-1 ${btnGhost}`}><Download size={12} /> CSV</button>
            </div>

            {(activeStmt.status as string) === "disputed" && (activeStmt as SupplierStatement & { disputeNote?: string }).disputeNote && (
              <div className="rounded-[8px] border border-[var(--warn)]/40 bg-[var(--warn-bg)] px-3 py-2 text-xs font-bold text-[var(--warn)]">{t("swDisputeNote", { x: (activeStmt as SupplierStatement & { disputeNote?: string }).disputeNote })}</div>
            )}
            {activeStmt.paidAt && (
              <div className="rounded-[8px] border border-[var(--success)]/40 bg-[var(--success-bg)] px-3 py-2 text-xs font-bold text-[var(--success)]">{t("swPaidLine", { x: activeStmt.paidAt })}{activeStmt.receiptNote ? ` · ${activeStmt.receiptNote}` : ""}</div>
            )}

            {activeStmt.status === "draft" && (
              <div className="space-y-2 rounded-[10px] border border-[var(--line)] p-4">
                <label className="block text-[11px] font-black text-[var(--muted)]">{t("swPixPh")}
                  <input value={pixDraft} onChange={(e) => setPixDraft(e.target.value)} placeholder={t("swPixPh")} className={`mt-1 h-10 w-full px-3 font-mono ${inputCls}`} />
                </label>
                <button type="button" onClick={() => { const statementId = activeStmt.id; setActiveStmtId(null); void post("/api/mall/ops", { action: "confirmStatement", statementId, pixKey: pixDraft }, t("swOkStmtConfirmed")); }} className="h-10 w-full rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)]">{t("swConfirmStmt")}</button>
              </div>
            )}
            {(activeStmt.status === "draft" || activeStmt.status === "confirmed") && (
              <button
                type="button"
                onClick={async () => {
                  const note = await dialog.prompt(t("swDisputeTitle"), { message: t("swDisputeMsg", { m: activeStmt.month, n: activeStmt.lines.length, v: activeStmt.total.toFixed(2) }), placeholder: t("swDisputePh") });
                  if (note === null) return;
                  if (!note.trim()) { setMessage({ tone: "err", text: t("swDisputeNeedReason") }); return; }
                  const statementId = activeStmt.id;
                  setActiveStmtId(null);
                  void post("/api/mall/ops", { action: "disputeStatement", statementId, note: note.trim() }, t("swOkDisputed"));
                }}
                className="h-10 w-full rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger)]"
              >{t("swDispute")}</button>
            )}

            <div className="overflow-hidden rounded-[8px] border border-[var(--line)]">
              <table className="w-full text-xs">
                <thead><tr className="bg-[var(--surface-raised)] text-left font-black uppercase text-[var(--muted)]"><th className="px-3 py-1.5">{t("mkColDate")}</th><th className="px-3 py-1.5">{t("mkColProduct")}</th><th className="px-3 py-1.5">{t("mkColOrder")}</th><th className="px-3 py-1.5 text-right">{t("swColSupply")}</th></tr></thead>
                <tbody>
                  {activeStmt.lines.map((l, i) => (
                    <tr key={`${l.orderId}-${i}`} className="border-t border-[var(--line)] font-bold"><td className="px-3 py-1.5">{l.date}</td><td className="px-3 py-1.5">{l.productName}</td><td className="px-3 py-1.5 font-mono text-[var(--muted)]">{l.orderId}</td><td className="px-3 py-1.5 text-right">R$ {l.supplyPrice.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>

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

      {/* ============ 概览 ============ */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label={t("swStatSold")} value={String(ops?.summary.orders ?? 0)} hint={t("swStatSoldHint")} />
            <Stat label={t("swStatActive")} value={String(myProducts.filter((product) => product.status === "active").length)} hint={t("dynSkuCount", { n: myProducts.length })} />
            <Stat label={t("swStatPayable")} value={`R$ ${payableTotal.toFixed(2)}`} hint={t("swStatPayableHint")} />
            <Stat label={t("swStatPaid")} value={`R$ ${paidTotal.toFixed(2)}`} hint={t("swStatPaidHint")} />
            <Stat label={t("swStatMonth")} value={`R$ ${monthExpected.toFixed(2)}`} hint={t("swStatMonthHint")} />
            <TodoCard label={t("swTodoStatements")} value={draftStatementCount} tone={draftStatementCount > 0 ? "warn" : "neutral"} hint={t("swTodoStatementsHint")} onClick={() => setTab("statements")} />
          </div>
          <SectionCard title={t("swTrend30")}>
            <div className="flex h-28 items-end gap-[3px]">
              {(ops?.summary.daily ?? []).map((day) => (
                <div key={day.date} className="group relative flex-1 rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${Math.max(3, (day.count / maxDaily) * 100)}%`, opacity: day.count > 0 ? 0.9 : 0.18 }}>
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">{day.date.slice(5)} · {day.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ============ 商品与报价 ============ */}
      {tab === "catalog" && (
        <div className="space-y-5">
          {/* 提报/编辑表单 — 两列宽松 */}
          <SectionCard title={<span className="inline-flex items-center gap-2"><PackagePlus size={14} /> {editingId ? t("swFormEdit") : t("swFormNew")}</span>}>
            <div className="grid gap-4 md:grid-cols-2">
              {([
                { key: "name", label: t("swFieldName") },
                { key: "supplyPrice", label: t("swFieldSupplyPrice") },
                { key: "deliveryCycleDays", label: t("swFieldCycle") },
                { key: "stock", label: t("swFieldStock") },
                { key: "category", label: t("swFieldCategory") },
              ] as const).map((field) => (
                <label key={field.key} className="text-[11px] font-black text-[var(--muted)]">{field.label}
                  <input value={(form as Record<string, unknown>)[field.key] as string} onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))} className={`mt-1.5 h-10 w-full px-3 ${inputCls}`} />
                </label>
              ))}
              <label className="text-[11px] font-black text-[var(--muted)]">{t("swFieldAudience")}
                <select value={form.audience} onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))} className={`mt-1.5 h-10 w-full px-2 ${inputCls}`}>
                  <option value="rider">{t("swAudRider")}</option>
                  <option value="partner">{t("swAudPartner")}</option>
                  <option value="both">{t("swAudBoth")}</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-[var(--muted)]">{t("swFieldType")}
                <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className={`mt-1.5 h-10 w-full px-2 ${inputCls}`}>
                  <option value="equipment">{t("swTypeEquipment")}</option>
                  <option value="safety_item">{t("swTypeSafety")}</option>
                  <option value="fuel_coupon">{t("swTypeFuel")}</option>
                  <option value="maintenance_coupon">{t("swTypeMaintenance")}</option>
                  <option value="phone_data">{t("swTypePhone")}</option>
                  <option value="partner_voucher">{t("swTypeVoucher")}</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-[var(--muted)]">{t("swFieldDesc")}
                <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className={`mt-1.5 h-10 w-full px-3 ${inputCls}`} />
              </label>
              <div className="md:col-span-2">
                <div className="text-[11px] font-black text-[var(--muted)]">{t("swFieldImage")}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {form.imageUrl ? <img src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg text-[var(--muted)]">🖼️</div>}
                  </div>
                  <label className="cursor-pointer rounded-[8px] border border-[var(--line)] px-3 py-2 text-xs font-black text-[var(--muted)] hover:border-[var(--accent)]">
                    {uploading ? t("swUploading") : t("swUpload")}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickImage(f); e.target.value = ""; }} />
                  </label>
                  <input value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl} onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder={t("swPasteUrl")} className={`h-9 min-w-0 flex-1 px-3 ${inputCls}`} />
                  {form.imageUrl && <button type="button" onClick={() => setForm((prev) => ({ ...prev, imageUrl: "" }))} className="text-xs font-black text-[var(--danger)]">{t("swClear")}</button>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                <label className="flex h-10 cursor-pointer items-center gap-2 text-xs font-black text-[var(--muted)]">
                  <input type="checkbox" checked={form.isVirtual} onChange={(e) => setForm((prev) => ({ ...prev, isVirtual: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" /> {t("swVirtual")}
                </label>
                {/* 本视图唯一主按钮 */}
                <button
                  type="button"
                  disabled={uploading || !form.name.trim() || !(Number(form.supplyPrice) > 0)}
                  onClick={() => {
                    const fields = { name: form.name.trim(), supplyPrice: Number(form.supplyPrice), deliveryCycleDays: Number(form.deliveryCycleDays) || 7, stock: Number(form.stock) || 0, description: form.description, imageUrl: form.imageUrl, category: form.category, isVirtual: form.isVirtual, audience: form.audience, type: form.type };
                    const payload = editingId ? { action: "supplierUpdateProduct", productId: editingId, ...fields } : { action: "supplierAddProduct", supplierName, ...fields };
                    void post("/api/mall", payload, editingId ? t("swOkSaved") : t("swOkSubmitted")).then(() => { setForm(emptyForm); setEditingId(null); });
                  }}
                  className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50"
                >{editingId ? t("swBtnSave") : t("swBtnSubmit")}</button>
                {editingId && <button type="button" onClick={() => { setForm(emptyForm); setEditingId(null); }} className="text-xs font-black text-[var(--muted)] underline">{t("swCancelEdit")}</button>}
              </div>
            </div>
          </SectionCard>

          {/* 商品列表 */}
          <Toolbar right={<span className="text-xs font-bold text-[var(--muted)]">{t("dynSkuCount", { n: myProducts.length })}</span>}>
            <span className="text-xs font-black uppercase text-[var(--muted)]">{t("swMyProducts")}</span>
            <SearchInput value={productQuery} onChange={setProductQuery} placeholder={t("swSearchProductsPh")} />
          </Toolbar>
          <DataTable columns={productCols} rows={visibleProducts} rowKey={(product) => product.id} minWidth={860} empty={t("swNoProducts")} />

          {/* 分销（开放直采）— 供应商 opt-in；总部审批后加盟商方可买断/代销 */}
          <SectionCard title={t("spConsentTitle")} desc={t("spConsentHint")}>
            <div className="space-y-2.5">
              {visibleProducts.filter((product) => product.isVirtual !== true).map((product) => (
                <div key={product.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{product.name}</span>
                  {badgeOf(consentMeta[consentOf(product)], consentOf(product))}
                  <input
                    value={suggestDraft[product.id] ?? (product.suggestedBuyoutPrice ? String(product.suggestedBuyoutPrice) : "")}
                    onChange={(e) => setSuggestDraft((prev) => ({ ...prev, [product.id]: e.target.value }))}
                    placeholder={t("spConsentSuggestedPrice")}
                    className={`h-9 w-52 px-2 text-xs ${inputCls}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const raw = (suggestDraft[product.id] ?? "").trim();
                      const body: Record<string, unknown> = { action: "setProcurementConsent", productId: product.id, consent: true };
                      if (raw !== "" && Number(raw) >= 0) body.suggestedPrice = Number(raw);
                      void fpoPost(body, t("spConsentPendingHint"));
                    }}
                    className={btnGhost}
                  >{t("spConsentOn")}</button>
                  {consentOf(product) !== "none" && (
                    <button type="button" onClick={() => void fpoPost({ action: "setProcurementConsent", productId: product.id, consent: false }, t("fpoDecideOk"))} className={btnDanger}>{t("spConsentOff")}</button>
                  )}
                  {consentOf(product) === "pending" && <span className="basis-full text-[11px] font-bold text-[var(--muted)]">{t("spConsentPendingHint")}</span>}
                </div>
              ))}
              {visibleProducts.filter((product) => product.isVirtual !== true).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">{t("fpNoData")}</div>}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ============ 订单 ============ */}
      {tab === "orders" && (
        <div className="space-y-4">
          <Toolbar
            right={
              <button type="button" onClick={() => downloadCsv(`supplier-orders-${supplierName || "meponto"}`, [t("mkColOrder"), t("mkColProduct"), t("fpStation"), t("fpoMarginFranchise"), t("mkColStatus"), t("swColSupply"), t("mkColDate")], filteredOrders.map((o) => [o.id, o.productName, o.station, o.franchise, orderStatusMeta[o.status] ? t(orderStatusMeta[o.status].key) : o.status, o.supplyPrice.toFixed(2), o.createdAt]))} className={`inline-flex items-center gap-1 ${btnGhost}`}><Download size={12} /> {t("swExportCsv")}</button>
            }
          >
            <span className="text-xs font-black uppercase text-[var(--muted)]">{t("swOrdersTitle")}</span>
            <span className="mx-1 h-5 w-px bg-[var(--line)]" />
            {["", "created", "arrived", "fulfilled"].map((status) => (
              <Chip key={status || "all"} active={orderFilter === status} onClick={() => setOrderFilter(status)}>
                {status === "" ? t("swAll") : t(orderStatusMeta[status].key)}
              </Chip>
            ))}
            <SearchInput value={orderQuery} onChange={setOrderQuery} placeholder={t("swSearchOrdersPh")} className="w-56" />
          </Toolbar>
          <DataTable columns={orderCols} rows={filteredOrders} rowKey={(o) => o.id} minWidth={820} empty={t("swNoOrders")} />
        </div>
      )}

      {/* ============ 物流·补货 ============ */}
      {tab === "pos" && (
        <div className="space-y-5">
          <div>
            <div className="mb-1 text-xs font-black uppercase text-[var(--muted)]">{t("swPoTitle")}</div>
            <p className="mb-3 text-[11px] font-bold text-[var(--muted)]">{t("swPoDesc")}</p>
            <DataTable columns={poCols} rows={ops?.purchaseOrders ?? []} rowKey={(po) => po.id} minWidth={920} empty={t("swNoPos")} />
          </div>

          {/* 加盟商直发订货单（FPO）：确认 → 发货 → 站点收货入库 */}
          <div>
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">{t("spFpoTitle")}</div>
            <DataTable columns={fpoCols} rows={fpos} rowKey={(fpo) => fpo.id} minWidth={960} empty={t("spFpoNone")} />
          </div>
        </div>
      )}

      {/* ============ 账单·对账 ============ */}
      {tab === "statements" && (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-black uppercase text-[var(--muted)]">{t("swStTitle")}</div>
            <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{t("swStDesc")}</div>
          </div>
          <DataTable
            columns={stmtCols}
            rows={ops?.statements ?? []}
            rowKey={(statement) => statement.id}
            onRowClick={(statement) => setActiveStmtId(statement.id)}
            minWidth={760}
            empty={t("swNoStatements")}
          />
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
                {badgeOf(priceChangeMeta[row.status], row.status)}
              </div>
            ))}
            {(ops?.priceChanges ?? []).length === 0 && <div className="py-6 text-center text-xs font-bold text-[var(--muted)]">暂无调价记录——在「商品与报价」里对单个商品发起调价。</div>}
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
                  {uploading ? t("swUploading") : "上传 Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickLogo(f); e.target.value = ""; }} />
                </label>
                <input value={profileForm.logoUrl.startsWith("data:") ? "" : profileForm.logoUrl} onChange={(e) => setProfileForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="或粘贴 Logo URL" className={`h-9 min-w-0 flex-1 px-3 ${inputCls}`} />
                {profileForm.logoUrl && <button type="button" onClick={() => setProfileForm((p) => ({ ...p, logoUrl: "" }))} className="text-xs font-black text-[var(--danger)]">{t("swClear")}</button>}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[{ k: "companyName", l: "公司名称" }, { k: "brand", l: "品牌名" }, { k: "cnpj", l: "CNPJ" }, { k: "contactName", l: "联系人" }, { k: "contactEmail", l: "联系邮箱" }, { k: "contactPhone", l: "联系电话" }, { k: "pixKey", l: "收款 PIX Key" }].map((f) => (
              <label key={f.k} className="text-[11px] font-black text-[var(--muted)]">{f.l}
                <input value={(profileForm as unknown as Record<string, string>)[f.k] ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, [f.k]: e.target.value }))} className={`mt-1 h-10 w-full px-3 ${inputCls}`} />
              </label>
            ))}
            <label className="text-[11px] font-black text-[var(--muted)] sm:col-span-2 lg:col-span-2">地址
              <input value={profileForm.address} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} className={`mt-1 h-10 w-full px-3 ${inputCls}`} />
            </label>
            <label className="text-[11px] font-black text-[var(--muted)] sm:col-span-2 lg:col-span-2">公司简介
              <textarea value={profileForm.about} onChange={(e) => setProfileForm((p) => ({ ...p, about: e.target.value }))} className={`mt-1 h-10 min-h-10 w-full p-2.5 ${inputCls}`} />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            {/* 本视图唯一主按钮 */}
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
              <input value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} placeholder="姓名" className={`h-10 px-3 ${inputCls}`} />
              <input value={member.identifier} onChange={(e) => setMember({ ...member, identifier: e.target.value })} placeholder="登录邮箱 / 手机" className={`h-10 px-3 ${inputCls}`} />
              <input value={member.phone} onChange={(e) => setMember({ ...member, phone: e.target.value })} placeholder="电话(可空)" className={`h-10 px-3 ${inputCls}`} />
              {/* 本视图唯一主按钮 */}
              <button type="button" disabled={!member.name.trim() || !member.identifier.trim()} onClick={async () => { const d = await supplierPost({ action: "createMember", ...member }, "已创建账号"); if (d) { setNewCred({ identifier: d.identifier, tempPassword: d.tempPassword }); setMember({ name: "", identifier: "", phone: "" }); } }} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">创建账号</button>
            </div>
            {newCred && <div className="mt-3 rounded-[8px] border border-[var(--accent)] bg-[var(--accent)]/10 p-3 text-sm font-bold">新账号已建:<b>{newCred.identifier}</b> · 一次性临时密码 <span className="font-mono text-[var(--accent)]">{newCred.tempPassword}</span> —— 请转交本人,首次登录后让其修改。</div>}
          </div>
          <div className="panel p-5">
            <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">团队成员</div>
            <div className="space-y-2">
              {(sup?.team ?? []).map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
                  <span className="font-black">{m.name}</span>
                  <span className="font-mono text-xs text-[var(--muted)]">{m.identifier}</span>
                  {m.organization && <span className="tag text-[10px]">🏢 {m.organization}</span>}
                  <StatusBadge tone={m.status === "active" ? "success" : "neutral"} label={m.status === "active" ? "启用中" : "已停用"} />
                  <button type="button" onClick={() => void supplierPost({ action: "toggleMember", userId: m.id }, m.status === "active" ? "已停用" : "已启用")} className={`ml-auto ${btnGhost}`}>{m.status === "active" ? "停用" : "启用"}</button>
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
