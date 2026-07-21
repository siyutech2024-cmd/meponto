"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "../../components/dialog";
import { statementStatusLabel } from "../../lib/mall-ops";
import type { SupplierProfile } from "../../lib/supplier";
import { DataTable, Drawer, ImagePreview, Pager, SearchInput, SectionCard, Skeleton, Stat, StatusBadge, Toolbar, type DataColumn } from "../kit";
import { extraStatementLabel, productStatusLabel, statusBadge, useMallAdmin } from "./context";

/**
 * 供应商 — flat HQ management of every supplier organization in ONE console
 * (no portal hop). List + drawer workbench:
 *  - rows aggregate client-side from /api/mall (products + supplierSettlement),
 *    /api/mall/ops (price changes, statements) and /api/mall/procurement (consent);
 *  - company profile / team / order details come from /api/supplier?org=<name>
 *    — the office support mode of the supplier self-service API (pontomall &
 *    pontosys sessions may pass ?org=), and profile edits save through the
 *    same `saveProfile` action, so there is exactly one write path.
 */

type SupplierDetail = {
  profile: SupplierProfile;
  team: Array<{ id: string; name: string; identifier: string; phone?: string; role: string; status: string; createdAt?: string; lastLoginAt?: string }>;
  orders: Array<{ id: string; productName: string; createdAt: string; status: string; supplyPrice: number; station: string }>;
};

type SupplierRow = {
  name: string;
  productCount: number;
  pendingPricing: number;
  distributionOpen: number;
  payable: number;
  /** CRM 准入档案状态: in=有档案, missing=有货无档案, unknown=CRM 未加载 */
  crmStatus: "in" | "missing" | "unknown";
};

/** Editable company-profile fields (subset of SupplierProfile, all strings). */
const PROFILE_FIELDS: Array<{ k: keyof SupplierProfile; l: string }> = [
  { k: "companyName", l: "公司名称" },
  { k: "brand", l: "品牌" },
  { k: "cnpj", l: "CNPJ" },
  { k: "contactName", l: "联系人" },
  { k: "contactEmail", l: "联系邮箱" },
  { k: "contactPhone", l: "联系电话" },
  { k: "address", l: "地址" },
  { k: "pixKey", l: "PIX 收款键" },
  { k: "logoUrl", l: "Logo URL" },
  { k: "about", l: "简介" },
];

const fieldCls = "mt-1 h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

const SUPPLIER_PAGE_SIZE = 20;

export default function SuppliersTab() {
  const { loading, mall, ops, procure, products, suppliers, setMessage, load, pendingPricing, priceChangePending, consentPendingIds } = useMallAdmin();
  const dialog = useDialog();
  /** First load still in flight — "…" stats + Skeleton table, never fake zeros. */
  const booting = loading && !mall;
  const n = (value: string | number) => (booting ? "…" : String(value));

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<Record<string, SupplierDetail>>({});
  const [drawerOrg, setDrawerOrg] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---- CRM supplier records (准入档案) — merged into this view so both
  // definitions meet in one place: CRM-registered suppliers without products
  // yet still show up (未供货), and product-side names without a CRM record
  // get flagged (无CRM档案).
  const [crmSupplierNames, setCrmSupplierNames] = useState<string[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/crm", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()).data ?? {};
        const partners = Array.isArray(payload) ? payload : payload.partners ?? [];
        const cats = Array.isArray(payload) ? [] : payload.categories ?? [];
        const supplierLabels = new Set([
          "Supplier", "供应商", "Fornecedor",
          ...cats.filter((c: { accountType?: string }) => c.accountType === "supplier").map((c: { label: string }) => c.label),
        ]);
        setCrmSupplierNames(partners.filter((p: { category?: string }) => supplierLabels.has(String(p.category ?? ""))).map((p: { name: string }) => p.name));
      } catch {
        // CRM unavailable — the view degrades to the product-side list only.
      }
    })();
  }, []);

  // ---- Office support mode: hydrate profile/team/orders per supplier -------
  const loadDetail = useCallback(async (org: string) => {
    const response = await fetch(`/api/supplier?org=${encodeURIComponent(org)}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const detail = (await response.json()).data as SupplierDetail;
    setDetails((prev) => ({ ...prev, [org]: detail }));
  }, []);

  useEffect(() => {
    for (const org of suppliers) void loadDetail(org);
  }, [suppliers, loadDetail]);

  // ---- Client-side aggregation: one row per supplier organization ----------
  const rows = useMemo<SupplierRow[]>(() => {
    const payableBySupplier = new Map((mall?.supplierSettlement ?? []).map((row) => [row.supplier, row.payable]));
    const term = q.trim().toLowerCase();
    // Union of both definitions: product-side supplier names + CRM supplier
    // records (准入档案) that have no products yet.
    const allNames = [...new Set([...suppliers, ...(crmSupplierNames ?? [])])];
    const inCrm = new Set(crmSupplierNames ?? []);
    return allNames
      .map((name) => {
        const own = products.filter((product) => product.supplierName === name);
        return {
          name,
          productCount: own.length,
          pendingPricing: own.filter((product) => product.status === "pending_pricing").length,
          distributionOpen: (procure?.products ?? []).filter((product) => product.supplierName === name && product.procurementConsent === "approved" && product.procurementMode !== "off").length,
          payable: payableBySupplier.get(name) ?? 0,
          crmStatus: (crmSupplierNames === null ? "unknown" : inCrm.has(name) ? "in" : "missing") as SupplierRow["crmStatus"],
        };
      })
      .filter((row) => {
        if (!term) return true;
        const detail = details[row.name];
        return [row.name, detail?.profile.brand ?? "", detail?.profile.cnpj ?? "", detail?.profile.contactName ?? ""].some((text) => text.toLowerCase().includes(term));
      })
      .sort((a, b) => b.payable - a.payable || b.productCount - a.productCount);
  }, [suppliers, products, mall, procure, details, q, crmSupplierNames]);

  // ---- Pagination (20/page; search resets to page 1) -----------------------
  const pages = Math.max(1, Math.ceil(rows.length / SUPPLIER_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pagedRows = useMemo(() => rows.slice((safePage - 1) * SUPPLIER_PAGE_SIZE, safePage * SUPPLIER_PAGE_SIZE), [rows, safePage]);

  const priceChangePendingOf = (org: string) => (ops?.priceChanges ?? []).filter((row) => row.supplierName === org && row.status === "pending").length;

  const columns: Array<DataColumn<SupplierRow>> = [
    { key: "name", label: "供应商", render: (row) => (
      <div className="min-w-0">
        <div className="flex max-w-[240px] items-center gap-1.5">
          <span className="truncate font-black">{details[row.name]?.profile.companyName ?? row.name}</span>
          {row.productCount === 0 && <StatusBadge tone="info" label="未供货" />}
          {row.crmStatus === "missing" && <StatusBadge tone="warn" label="无CRM档案" />}
        </div>
        <div className="max-w-[240px] truncate text-[11px] font-bold text-[var(--muted)]">{row.name}</div>
      </div>
    ) },
    { key: "brand", label: "品牌", render: (row) => details[row.name]?.profile.brand || "—" },
    { key: "cnpj", label: "CNPJ", render: (row) => <span className="font-mono text-xs">{details[row.name]?.profile.cnpj || "—"}</span> },
    { key: "contact", label: "联系人", render: (row) => {
      const profile = details[row.name]?.profile;
      return profile?.contactName ? <span>{profile.contactName}<span className="ml-1 text-[11px] text-[var(--muted)]">{profile.contactPhone || profile.contactEmail}</span></span> : "—";
    } },
    { key: "products", label: "商品数", align: "right", render: (row) => row.productCount },
    { key: "pending", label: "待定价", align: "right", render: (row) => row.pendingPricing > 0 ? <span className="font-black text-[var(--warn)]">{row.pendingPricing}</span> : <span className="text-[var(--muted)]">0</span> },
    { key: "distribution", label: "分销开放", align: "right", render: (row) => row.distributionOpen },
    { key: "payable", label: "本月应付（履约口径）", align: "right", render: (row) => <b>R$ {row.payable.toFixed(2)}</b> },
  ];

  // ---- Drawer state ---------------------------------------------------------
  const drawerDetail = drawerOrg ? details[drawerOrg] : undefined;
  const drawerProducts = useMemo(() => products.filter((product) => product.supplierName === drawerOrg), [products, drawerOrg]);
  const drawerStatements = useMemo(() => (ops?.statements ?? []).filter((statement) => statement.supplierName === drawerOrg).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12), [ops, drawerOrg]);

  function openDrawer(org: string) {
    setDrawerOrg(org);
    setDraft({});
    if (!details[org]) void loadDetail(org);
  }

  const draftValue = (key: keyof SupplierProfile) => draft[key] ?? String(drawerDetail?.profile[key] ?? "");

  async function saveProfile() {
    if (!drawerOrg || saving) return;
    setSaving(true);
    const body: Record<string, unknown> = { action: "saveProfile" };
    for (const field of PROFILE_FIELDS) if (draft[field.k] !== undefined) body[field.k] = draft[field.k];
    const response = await fetch(`/api/supplier?org=${encodeURIComponent(drawerOrg)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setMessage({ tone: "err", text: payload?.error ?? "保存失败，请重试。" });
      return;
    }
    setMessage({ tone: "ok", text: `已保存「${drawerOrg}」公司资料（总部代管）。` });
    setDraft({});
    void loadDetail(drawerOrg);
  }

  /** Danger zone: delete the supplier organization. Server guards refuse when
   *  the supplier still has active products or unpaid (non-draft) statements. */
  async function deleteSupplier() {
    if (!drawerOrg || deleting) return;
    const activeCount = drawerProducts.filter((product) => product.status === "active").length;
    const confirmed = await dialog.confirm("删除供应商", {
      message: `删除供应商「${drawerOrg}」？将删除其公司资料与待定价商品，并停用其全部门户登录账号（${drawerDetail?.team.length ?? 0} 个）。${activeCount > 0 ? `注意：该供应商仍有 ${activeCount} 个在售商品，服务端将拒绝删除。` : ""}此操作不可恢复。`,
      confirmText: "删除供应商",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    const response = await fetch(`/api/supplier?org=${encodeURIComponent(drawerOrg)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteSupplier" }),
    }).catch(() => null);
    setDeleting(false);
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setMessage({ tone: "err", text: payload?.error ?? "删除失败，请重试。" });
      return;
    }
    setMessage({ tone: "ok", text: `已删除供应商「${drawerOrg}」：停用 ${payload?.data?.accountsDisabled ?? 0} 个门户账号，移除 ${payload?.data?.pendingProductsRemoved ?? 0} 个待定价商品（审计已留痕）。` });
    setDrawerOrg("");
    void load();
  }

  return (
    <div className="space-y-3">
      {/* ---- 顶部统计 ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="供应商总数" value={n(suppliers.length)} hint="有在册商品的供应商组织" />
        <Stat label="待定价商品" value={n(pendingPricing)} hint="供应商已报价，等总部定售价" />
        <Stat label="待审调价" value={n(priceChangePending)} hint="供货价调整等审批（资金 Tab 处理）" />
        <Stat label="待审分销同意" value={n(consentPendingIds.size)} hint="直采开放申请等审批（直采 Tab 处理）" />
      </div>

      {/* ---- 搜索 + 分页 ---- */}
      <Toolbar right={<Pager page={safePage} pages={pages} total={rows.length} onPage={setPage} />}>
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索供应商 / 品牌 / CNPJ / 联系人…" />
        <span className="text-[11px] font-bold text-[var(--muted)]">点击行打开供应商工作台：公司资料 · 商品 · 团队账号 · 月度对账单</span>
      </Toolbar>

      {/* ---- 供应商列表（首载显示骨架条） ---- */}
      {booting ? (
        <Skeleton rows={7} />
      ) : (
        <DataTable
          columns={columns}
          rows={pagedRows}
          rowKey={(row) => row.name}
          onRowClick={(row) => openDrawer(row.name)}
          minWidth={960}
          empty={suppliers.length === 0 ? "暂无供应商——商品建档时填写供应商名称即自动出现在这里。" : "没有匹配的供应商。"}
        />
      )}

      {/* ---- 供应商工作台抽屉 ---- */}
      <Drawer
        open={Boolean(drawerOrg)}
        onClose={() => setDrawerOrg("")}
        width={520}
        ariaLabel="供应商工作台"
        title={
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerDetail?.profile.companyName ?? drawerOrg}</div>
            <div className="truncate text-[11px] font-bold text-[var(--muted)]">{drawerOrg} · 待审调价 {priceChangePendingOf(drawerOrg)}</div>
          </div>
        }
      >
        {!drawerDetail ? (
          <div className="py-8 text-center text-sm font-bold text-[var(--muted)]">加载供应商资料…</div>
        ) : (
          <div className="space-y-5">
            {/* 公司资料（总部代管编辑） */}
            <section>
              <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">公司资料（总部代管，可直接编辑）</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PROFILE_FIELDS.map((field) => (
                  <label key={field.k} className={`text-[11px] font-black text-[var(--muted)] ${field.k === "address" || field.k === "about" ? "sm:col-span-2" : ""}`}>
                    {field.l}
                    <input value={draftValue(field.k)} onChange={(e) => setDraft((prev) => ({ ...prev, [field.k]: e.target.value }))} className={fieldCls} />
                    {field.k === "logoUrl" && <ImagePreview url={draftValue("logoUrl")} size={48} className="mt-2" alt="Logo 预览" />}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" disabled={saving || Object.keys(draft).length === 0} onClick={() => void saveProfile()} className="h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black text-[var(--accent-ink)] disabled:opacity-50">
                  {saving ? "保存中…" : "保存资料"}
                </button>
                {drawerDetail.profile.updatedAt && <span className="text-[11px] font-bold text-[var(--muted)]">上次更新 {drawerDetail.profile.updatedAt} · {drawerDetail.profile.updatedBy}</span>}
              </div>
            </section>

            {/* 商品小表 */}
            <section>
              <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">商品（{drawerProducts.length}）</div>
              <div className="overflow-x-auto rounded-[10px] border border-[var(--line)]">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[var(--surface-raised)] text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="px-3 py-2">商品</th><th className="px-2 py-2">状态</th><th className="px-2 py-2 text-right">供货价</th><th className="px-2 py-2 text-right">售价</th></tr></thead>
                  <tbody>
                    {drawerProducts.map((product) => (
                      <tr key={product.id} className="border-t border-[var(--line)] font-bold">
                        <td className="max-w-[160px] truncate px-3 py-2 font-black">{product.name}</td>
                        <td className="px-2 py-2">{statusBadge(product.status, productStatusLabel[product.status] ?? product.status)}</td>
                        <td className="px-2 py-2 text-right">{product.supplyPrice ? `R$ ${product.supplyPrice.toFixed(2)}` : "—"}</td>
                        <td className="px-2 py-2 text-right">{product.pointsPrice ? `${product.pointsPrice.toLocaleString()} 分` : "—"}{product.cashPriceBRL ? <span className="text-[11px] text-[var(--muted)]"> + R${product.cashPriceBRL.toFixed(2)}</span> : null}</td>
                      </tr>
                    ))}
                    {drawerProducts.length === 0 && <tr><td colSpan={4} className="py-5 text-center text-xs font-bold text-[var(--muted)]">该供应商暂无商品。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 团队账号 */}
            <section>
              <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">团队账号（{drawerDetail.team.length}）</div>
              <div className="space-y-1.5">
                {drawerDetail.team.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold">
                    <span className="font-black">{member.name}</span>
                    <span className="text-[var(--muted)]">{member.identifier}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      <StatusBadge tone="neutral" label={member.role} />
                      <StatusBadge tone={member.status === "active" ? "success" : "neutral"} label={member.status === "active" ? "启用" : "停用"} />
                    </span>
                  </div>
                ))}
                {drawerDetail.team.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无团队账号。</div>}
              </div>
            </section>

            {/* 月度对账单状态 */}
            <section>
              <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">月度对账单（近 {drawerStatements.length} 期）</div>
              <div className="space-y-1.5">
                {drawerStatements.map((statement) => (
                  <div key={statement.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold">
                    <span className="font-black">{statement.month}</span>
                    <span className="text-[var(--muted)]">{statement.lines.length} 笔</span>
                    <span className="ml-auto inline-flex items-center gap-2">
                      <b>R$ {statement.total.toFixed(2)}</b>
                      {statusBadge(statement.status, (statementStatusLabel as Record<string, string>)[statement.status] ?? extraStatementLabel[statement.status] ?? statement.status)}
                    </span>
                  </div>
                ))}
                {drawerStatements.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无对账单——在「资金 · 补货与对账」按月生成。</div>}
              </div>
            </section>

            {/* 危险区：删除供应商（服务端守卫：在售商品 / 未付对账单时 409 拒绝） */}
            <SectionCard title={<span className="text-[var(--danger)]">危险区</span>} className="border-[var(--danger)]/40">
              <p className="mb-3 text-[11px] font-bold leading-5 text-[var(--muted)]">
                删除将移除公司资料与待定价商品，并停用其全部门户登录账号。仍有<b>在售商品</b>或<b>未付对账单</b>（非草稿且未付款）时服务端会拒绝删除。
              </p>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteSupplier()}
                className="h-9 rounded-[8px] border border-[var(--danger)]/40 px-3.5 text-xs font-bold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-50"
              >
                {deleting ? "删除中…" : "删除供应商"}
              </button>
            </SectionCard>
          </div>
        )}
      </Drawer>
    </div>
  );
}
