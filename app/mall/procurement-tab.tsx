"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCcw } from "lucide-react";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import type { FranchisePurchaseOrder, ProcurementDiscrepancy, ProcurementMarginEntry, StationStockBucket } from "../lib/procurement";
import { DataTable, Drawer, SectionCard, StatusBadge, type DataColumn } from "./kit";
import { statusBadge } from "./tabs/context";

/** PontoMall back office — 加盟商直采 tab (the ONLY write surface for
 *  procurement office actions, per plan §2). Kit-based workbench layout. */

type ProductRow = {
  id: string; name: string; status: string; supplierName: string; supplyPrice: number;
  procurementMode: "off" | "consignment" | "buyout" | "both";
  franchiseBuyoutPrice: number; minOrderQty: number; maxOrderQty: number;
  procurementConsent: "none" | "pending" | "approved"; suggestedBuyoutPrice: number;
};
type TopUpRow = { id: string; franchise: string; amountBRL: number; pixRef: string; status: string; createdAt: string };
type OfficeSnapshot = {
  config: { procurementEnabled: boolean; procurementFrozen: boolean; procurementAutoApproveBRL: number; procurementMaxOrderBRL: number; procurementShipTimeoutDays: number; stationStockEnforcement: boolean };
  products: ProductRow[];
  marginEntries: ProcurementMarginEntry[];
  fpos: FranchisePurchaseOrder[];
  stock: StationStockBucket[];
  topUps: TopUpRow[];
  discrepancies: ProcurementDiscrepancy[];
  franchises: Array<{ name: string; depositBalance: number }>;
};

const FPO_STATUS_LABEL: Record<string, string> = {
  submitted: "待审批", approved: "已批准", confirmed: "供应商已确认", shipped: "已发货",
  arrived: "已到站", received: "已入库", rejected: "已驳回", cancelled: "已取消",
};
const FPO_MODE_LABEL: Record<string, string> = { consignment: "代销", buyout: "买断" };
const RESOLUTION_LABEL: Record<string, string> = { reship: "补发", writeoff: "核销", closed: "关闭", refunded: "已退款", pending: "待处理" };
const DISCREPANCY_KIND_LABEL: Record<string, string> = { short: "短缺", damage: "破损", excess: "多收", writeoff: "核销" };

const inputCls = "rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";
const btnPrimary = "h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)]";
const btnOutline = "h-7 rounded-[8px] border border-[var(--accent)]/60 px-2.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10";
const btnGhost = "h-7 rounded-[8px] border border-[var(--line)] px-2.5 text-[11px] font-bold text-[var(--muted)] hover:border-[var(--accent)]";
const btnDanger = "h-7 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-[11px] font-bold text-[var(--danger)]";

function Timeline({ steps }: { steps: Array<{ label: string; at?: string; note?: string }> }) {
  const visible = steps.filter((step) => step.at);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {visible.map((step) => (
        <div key={`${step.label}-${step.at}`} className="flex items-baseline gap-2 text-xs font-bold">
          <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-[var(--accent)]" />
          <span>{step.label}</span>
          <span className="ml-auto text-[11px] text-[var(--muted)]">{step.at}</span>
          {step.note && <span className="text-[11px] text-[var(--muted)]">{step.note}</span>}
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-sm font-bold last:border-b-0">
      <span className="text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default function ProcurementTab() {
  const language = useVentoStore((s) => s.language);
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [data, setData] = useState<OfficeSnapshot | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [cfgDraft, setCfgDraft] = useState<Record<string, string | boolean>>({});
  const [productDrafts, setProductDrafts] = useState<Record<string, { mode: string; price: string; minQ: string; maxQ: string }>>({});
  const [fpoDrawerId, setFpoDrawerId] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/mall/procurement", { headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setData(payload.data as OfficeSnapshot);
  }, [headers]);

  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, okText: string) {
    const response = await fetch("/api/mall/procurement", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const key = payload.errorKey as TranslationKey | undefined;
      setMessage({ tone: "err", text: key ? translate(language, key) : payload.error ?? `操作失败（${response.status}）` });
      return false;
    }
    setMessage({ tone: "ok", text: okText });
    void load();
    return true;
  }

  if (!data) return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">加载中…</div>;

  const config = data.config;
  const frozen = cfgDraft.procurementFrozen !== undefined ? cfgDraft.procurementFrozen === true : config.procurementFrozen;
  const queue = data.fpos.filter((fpo) => fpo.status === "submitted");
  const inFlight = data.fpos.filter((fpo) => ["approved", "confirmed", "shipped", "arrived"].includes(fpo.status));
  const done = data.fpos.filter((fpo) => !["submitted", "approved", "confirmed", "shipped", "arrived"].includes(fpo.status)).slice(0, 20);
  const orderedFpos = [...queue, ...inFlight, ...done];
  const timeoutMs = (config.procurementShipTimeoutDays || 7) * 86_400_000;
  const isStalled = (fpo: FranchisePurchaseOrder) => fpo.status === "shipped" && fpo.shippedAt !== undefined && Date.now() - new Date(fpo.shippedAt.replace(" ", "T")).getTime() > timeoutMs;
  const pendingTopUps = data.topUps.filter((topUp) => topUp.status === "submitted");
  const pendingDiscrepancies = data.discrepancies.filter((d) => d.resolution === "pending");
  const pendingConsents = data.products.filter((product) => product.procurementConsent === "pending");
  const marginEntries = data.marginEntries ?? [];
  const marginMonths = [...new Set(marginEntries.map((entry) => entry.month))].sort().reverse();
  const consentLabel = (consent: ProductRow["procurementConsent"]) => (consent === "approved" ? "已同意开放" : consent === "pending" ? "待供应商审批" : "未开放");

  const cfgValue = (key: keyof OfficeSnapshot["config"]) => (cfgDraft[key] !== undefined ? cfgDraft[key] : config[key]);

  const drawerFpo = fpoDrawerId ? data.fpos.find((fpo) => fpo.id === fpoDrawerId) : undefined;
  const drawerDiscrepancies = drawerFpo ? data.discrepancies.filter((d) => d.fpoId === drawerFpo.id) : [];

  function fpoActions(fpo: FranchisePurchaseOrder) {
    const buttons: Array<{ label: string; onClick: () => void; danger?: boolean }> = [];
    if (fpo.status === "submitted") {
      buttons.push({ label: "批准", onClick: () => void post({ action: "approveFPO", fpoId: fpo.id }, "已处理") });
      buttons.push({ label: "驳回", danger: true, onClick: () => void post({ action: "rejectFPO", fpoId: fpo.id }, "已处理") });
    }
    if (fpo.status === "approved" && fpo.source === "hq") buttons.push({ label: "确认备货", onClick: () => void post({ action: "confirmFPO", fpoId: fpo.id }, "已处理") });
    if (fpo.status === "confirmed" && fpo.source === "hq") buttons.push({ label: "发货", onClick: () => void post({ action: "shipFPO", fpoId: fpo.id }, "已处理") });
    if (fpo.status === "shipped") {
      buttons.push({ label: "标记到站", onClick: () => void post({ action: "arriveFPO", fpoId: fpo.id }, "已处理") });
      buttons.push({
        label: "异常关闭", danger: true,
        onClick: () => {
          const reason = window.prompt("请输入原因");
          if (reason) void post({ action: "closeExceptionFPO", fpoId: fpo.id, reason }, "已处理");
        },
      });
    }
    if (fpo.status === "approved" || fpo.status === "confirmed") {
      buttons.push({
        label: "取消", danger: true,
        onClick: () => {
          const reason = window.prompt("请输入原因");
          if (reason) void post({ action: "cancelFPO", fpoId: fpo.id, reason }, "已处理");
        },
      });
    }
    return buttons;
  }

  const consentColumns: Array<DataColumn<ProductRow>> = [
    { key: "product", label: "商品", render: (product) => <span className="font-black">{product.name}</span> },
    { key: "supplier", label: "供应商", render: (product) => product.supplierName || "HQ" },
    { key: "suggested", label: "建议买断价", align: "right", render: (product) => (product.suggestedBuyoutPrice > 0 ? `R$ ${product.suggestedBuyoutPrice.toFixed(2)}` : "—") },
    { key: "supply", label: "当前供货价", align: "right", render: (product) => `R$ ${product.supplyPrice.toFixed(2)}` },
    {
      key: "ops", label: "操作", align: "right", render: (product) => (
        <span className="inline-flex gap-1.5">
          <button type="button" onClick={() => void post({ action: "reviewProcurementConsent", productId: product.id, approve: true }, "已处理")} className={btnOutline}>批准开放</button>
          <button type="button" onClick={() => void post({ action: "reviewProcurementConsent", productId: product.id, approve: false }, "已处理")} className={btnDanger}>驳回</button>
        </span>
      ),
    },
  ];

  const fpoColumns: Array<DataColumn<FranchisePurchaseOrder>> = [
    { key: "id", label: "单号", render: (fpo) => <span className="text-xs text-[var(--muted)]">{fpo.id}</span> },
    { key: "franchise", label: "加盟商 → 站点", render: (fpo) => <span className="font-black">{fpo.franchise} <span className="font-bold text-[var(--muted)]">→ {fpo.stationName}</span></span> },
    { key: "supplier", label: "供应商", render: (fpo) => fpo.supplierName },
    { key: "mode", label: "模式", render: (fpo) => <StatusBadge tone="neutral" label={FPO_MODE_LABEL[fpo.mode] ?? fpo.mode} /> },
    { key: "total", label: "货款", align: "right", render: (fpo) => <span>R$ {fpo.totalBRL.toFixed(2)}{fpo.mode === "consignment" ? <span className="ml-1 text-[11px] text-[var(--muted)]">参考</span> : ""}</span> },
    {
      key: "status", label: "状态", render: (fpo) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {statusBadge(fpo.status, FPO_STATUS_LABEL[fpo.status] ?? fpo.status)}
          {isStalled(fpo) && <StatusBadge tone="danger" label="发货滞留" />}
          {fpo.autoApproved && <StatusBadge tone="info" label="自动审批" />}
        </span>
      ),
    },
    { key: "time", label: "时间", render: (fpo) => <span className="text-xs text-[var(--muted)]">{fpo.createdAt}</span> },
    {
      key: "ops", label: "操作", align: "right", render: (fpo) => (
        <span className="inline-flex gap-1.5">
          {fpoActions(fpo).map((btn) => (
            <button key={btn.label} type="button" onClick={(e) => { e.stopPropagation(); btn.onClick(); }} className={btn.danger ? btnDanger : btnOutline}>{btn.label}</button>
          ))}
        </span>
      ),
    },
  ];

  const topUpColumns: Array<DataColumn<TopUpRow>> = [
    { key: "franchise", label: "加盟商", render: (topUp) => <span className="font-black">{topUp.franchise}</span> },
    { key: "amount", label: "金额", align: "right", render: (topUp) => <b>R$ {topUp.amountBRL.toFixed(2)}</b> },
    { key: "pix", label: "PIX 凭证", render: (topUp) => <span className="text-xs text-[var(--muted)]">{topUp.pixRef}</span> },
    { key: "time", label: "时间", render: (topUp) => <span className="text-xs text-[var(--muted)]">{topUp.createdAt}</span> },
    {
      key: "ops", label: "操作", align: "right", render: (topUp) => (
        <span className="inline-flex gap-1.5">
          <button type="button" onClick={() => void post({ action: "confirmDepositTopUp", topUpId: topUp.id }, "已确认收款，预存已入账")} className={btnOutline}>确认已收款</button>
          <button type="button" onClick={() => void post({ action: "rejectDepositTopUp", topUpId: topUp.id }, "已驳回")} className={btnDanger}>驳回</button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* 运行状态 */}
      <SectionCard
        title="运行状态 · 直采配置"
        desc="直采总开关、风控参数;冻结为紧急刹车,开启后加盟商下单与审批流转全部暂停。"
        className={frozen ? "border-[var(--danger)]" : ""}
        right={<button type="button" onClick={() => void load()} aria-label="刷新" className="grid h-9 w-9 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]"><RefreshCcw size={14} /></button>}
      >
        {frozen && (
          <div className="mb-3 rounded-[8px] border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-xs font-bold text-[var(--danger)]">
            直采已冻结：加盟商下单与全部审批流转已暂停,仅保留查询。
          </div>
        )}
        <div className="grid gap-3 text-xs font-bold md:grid-cols-3">
          {([["procurementEnabled", "开启直采"], ["procurementFrozen", "冻结直采（紧急刹车）"], ["stationStockEnforcement", "站点库存硬校验"]] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={cfgValue(key) === true} onChange={(e) => setCfgDraft((prev) => ({ ...prev, [key]: e.target.checked }))} />
              <span className={key === "procurementFrozen" && cfgValue(key) === true ? "text-[var(--danger)]" : ""}>{label}</span>
            </label>
          ))}
          {([["procurementAutoApproveBRL", "自动审批上限 R$"], ["procurementMaxOrderBRL", "单笔金额上限 R$"], ["procurementShipTimeoutDays", "发货超时（天）"]] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              {label}
              <input value={String(cfgValue(key))} onChange={(e) => setCfgDraft((prev) => ({ ...prev, [key]: e.target.value }))} className={`h-8 w-24 ${inputCls}`} />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const body: Record<string, unknown> = { action: "setProcurementConfig" };
            for (const [key, value] of Object.entries(cfgDraft)) body[key] = typeof value === "boolean" ? value : Number(value);
            void post(body, "配置已保存").then((ok) => { if (ok) setCfgDraft({}); });
          }}
          className={`mt-4 ${btnPrimary}`}
        >
          保存配置
        </button>
      </SectionCard>

      {/* 供应商同意审批 */}
      <SectionCard title={`供应商同意审批（${pendingConsents.length}）`} desc="供应商申请把商品开放给加盟商直采;批准后商品才可配置直采模式。">
        <DataTable columns={consentColumns} rows={pendingConsents} rowKey={(product) => product.id} minWidth={720} empty="暂无待审批的开放申请。" />
      </SectionCard>

      {/* 直采订单 */}
      <SectionCard title={`直采订单（待审批 ${queue.length} · 在途 ${inFlight.length}）`} desc="代销单货款为备货参考成本(不产生应付);买断单货款已从加盟商预存扣减。点击行查看明细、时间线与差异单。">
        <DataTable columns={fpoColumns} rows={orderedFpos} rowKey={(fpo) => fpo.id} onRowClick={(fpo) => setFpoDrawerId(fpo.id)} minWidth={980} empty="暂无直采订单。" />
      </SectionCard>

      {/* 入金核销 + 差异 + 预存余额 */}
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={`入金核销 · 待收款（${pendingTopUps.length}）`} desc="加盟商预存充值凭证,确认收到 PIX 转账后入账。">
          <DataTable columns={topUpColumns} rows={pendingTopUps} rowKey={(topUp) => topUp.id} minWidth={560} empty="暂无待核销的充值。" />
        </SectionCard>
        <SectionCard title="加盟商预存余额" desc="买断货款从预存实时扣减;负数需催充。">
          <div className="max-h-[240px] space-y-1 overflow-auto pr-1 text-xs font-bold">
            {data.franchises.map((franchise) => (
              <div key={franchise.name} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2.5 py-1.5">
                <span>{franchise.name}</span>
                <span style={franchise.depositBalance < 0 ? { color: "var(--danger)" } : undefined}>R$ {franchise.depositBalance.toFixed(2)}</span>
              </div>
            ))}
            {data.franchises.length === 0 && <div className="py-4 text-center text-[var(--muted)]">暂无加盟商。</div>}
          </div>
        </SectionCard>
      </div>

      {/* 差异处理 */}
      <SectionCard title={`收货差异处理（${pendingDiscrepancies.length}）`} desc="入库数量与下单不一致时生成差异单;买断短缺已自动退款,此处决定后续处置。">
        {pendingDiscrepancies.length === 0 ? (
          <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无待处理差异。</div>
        ) : (
          <div className="space-y-2">
            {pendingDiscrepancies.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold">
                <span className="text-[var(--muted)]">{d.fpoId}</span>
                <span className="font-black">{d.productName}</span>
                <span>收 {d.receivedQty} / 订 {d.orderedQty}</span>
                <StatusBadge tone="warn" label={DISCREPANCY_KIND_LABEL[d.kind] ?? d.kind} />
                {typeof d.refundBRL === "number" && d.refundBRL > 0 && <span className="text-[var(--muted)]">已退 R$ {d.refundBRL.toFixed(2)}</span>}
                <span className="ml-auto inline-flex gap-1.5">
                  {(["reship", "writeoff", "closed"] as const).map((resolution) => (
                    <button key={resolution} type="button" onClick={() => void post({ action: "resolveDiscrepancy", discrepancyId: d.id, resolution }, "已处理")} className={btnGhost}>
                      {RESOLUTION_LABEL[resolution]}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 商品直采设置 */}
      <SectionCard title="商品直采设置" desc="逐品配置直采模式、买断价与起订/限购数量;供应商商品需先获得开放同意。">
        <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
          {data.products.map((product) => {
            const draft = productDrafts[product.id] ?? { mode: product.procurementMode, price: String(product.franchiseBuyoutPrice || ""), minQ: String(product.minOrderQty), maxQ: String(product.maxOrderQty) };
            return (
              <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold">
                <span className="min-w-40 font-black">
                  {product.name}<span className="ml-1 text-[var(--muted)]">({product.supplierName || "HQ"})</span>
                  {product.supplierName ? (
                    <span className="ml-2 inline-block">
                      <StatusBadge tone={product.procurementConsent === "approved" ? "success" : product.procurementConsent === "pending" ? "warn" : "neutral"} label={consentLabel(product.procurementConsent)} />
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  模式
                  <select value={draft.mode} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, mode: e.target.value } }))} className={`h-8 ${inputCls}`}>
                    <option value="off">不开放</option>
                    <option value="consignment">代销</option>
                    <option value="buyout">买断</option>
                    <option value="both">代销+买断</option>
                  </select>
                  买断价
                  <input value={draft.price} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, price: e.target.value } }))} className={`h-8 w-20 ${inputCls}`} />
                  起订
                  <input value={draft.minQ} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, minQ: e.target.value } }))} className={`h-8 w-14 ${inputCls}`} />
                  限购
                  <input value={draft.maxQ} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, maxQ: e.target.value } }))} className={`h-8 w-14 ${inputCls}`} />
                  <button
                    type="button"
                    onClick={() => void post({ action: "setProductProcurement", productId: product.id, procurementMode: draft.mode, franchiseBuyoutPrice: Number(draft.price) || 0, minOrderQty: Number(draft.minQ) || 1, maxOrderQty: Number(draft.maxQ) || 0 }, "已处理")}
                    className={btnOutline}
                  >
                    保存
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* 直采毛利账本（append-only;负行为补偿冲销） */}
      <SectionCard title={`直采毛利账本（${marginEntries.length}）`} desc="按月小计;条目应计入账,月度供应商对账单付款后转为已结算。负数行为补偿冲销。">
        {marginEntries.length === 0 ? (
          <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">暂无毛利记录。</div>
        ) : (
          <div className="max-h-[380px] overflow-auto rounded-[8px] border border-[var(--line)]">
            <table className="w-full text-xs" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-[var(--surface-raised)] text-left text-[11px] font-bold uppercase text-[var(--muted)]">
                  <th className="px-3 py-2">月份</th>
                  <th className="px-2 py-2">加盟商</th>
                  <th className="px-2 py-2">供应商</th>
                  <th className="px-2 py-2">类型</th>
                  <th className="px-2 py-2 text-right">货款成本</th>
                  <th className="px-2 py-2 text-right">实收</th>
                  <th className="px-2 py-2 text-right">毛利</th>
                  <th className="px-2 py-2">状态</th>
                </tr>
              </thead>
              <tbody>
                {marginMonths.map((month) => {
                  const rows = marginEntries.filter((entry) => entry.month === month);
                  const sum = (pick: (entry: ProcurementMarginEntry) => number) =>
                    Math.round(rows.reduce((acc, entry) => acc + pick(entry), 0) * 100) / 100;
                  return [
                    ...rows.map((entry) => (
                      <tr key={entry.id} className="border-t border-[var(--line)] font-bold">
                        <td className="px-3 py-2 text-[var(--muted)]">{entry.month}</td>
                        <td className="px-2 py-2">{entry.franchise}</td>
                        <td className="px-2 py-2">{entry.supplierName}</td>
                        <td className="px-2 py-2">{entry.kind === "buyout_spread" ? "买断价差" : "代销价差"}</td>
                        <td className="px-2 py-2 text-right">R$ {entry.goodsCostTotal.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">R$ {entry.chargedTotal.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right" style={entry.marginTotal < 0 ? { color: "var(--danger)" } : undefined}>R$ {entry.marginTotal.toFixed(2)}</td>
                        <td className="px-2 py-2"><StatusBadge tone={entry.status === "settled" ? "success" : "warn"} label={entry.status === "settled" ? "已结算" : "应计"} /></td>
                      </tr>
                    )),
                    <tr key={`${month}-total`} className="border-t border-[var(--line)] bg-[var(--surface-raised)] font-black">
                      <td className="px-3 py-2" colSpan={4}>{month} · 月小计</td>
                      <td className="px-2 py-2 text-right">R$ {sum((e) => e.goodsCostTotal).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">R$ {sum((e) => e.chargedTotal).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">R$ {sum((e) => e.marginTotal).toFixed(2)}</td>
                      <td className="px-2 py-2" />
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* 站点库存总览 */}
      <SectionCard title="站点库存总览" desc="按站点 × 商品 × 归属池(代销/买断)投影的账本余额。">
        {data.stock.length === 0 ? (
          <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">暂无站点库存。</div>
        ) : (
          <div className="max-h-[320px] space-y-1 overflow-auto pr-1 text-xs font-bold">
            {data.stock.map((bucket) => (
              <div key={`${bucket.stationId}-${bucket.productId}-${bucket.mode}`} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2.5 py-1.5">
                <span>{bucket.stationName} · {bucket.productName}</span>
                <span>{FPO_MODE_LABEL[bucket.mode] ?? bucket.mode} ｜ 在库 {bucket.qty}{bucket.reserved > 0 ? ` ｜ 预留 ${bucket.reserved}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 直采订单明细抽屉 */}
      <Drawer
        open={Boolean(drawerFpo)}
        onClose={() => setFpoDrawerId("")}
        width={480}
        ariaLabel="直采订单明细"
        title={drawerFpo ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerFpo.franchise} → {drawerFpo.stationName}</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">{drawerFpo.id} · {drawerFpo.supplierName}</div>
          </div>
        ) : null}
      >
        {drawerFpo && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(drawerFpo.status, FPO_STATUS_LABEL[drawerFpo.status] ?? drawerFpo.status)}
              <StatusBadge tone="neutral" label={FPO_MODE_LABEL[drawerFpo.mode] ?? drawerFpo.mode} />
              {isStalled(drawerFpo) && <StatusBadge tone="danger" label="发货滞留" />}
              {drawerFpo.autoApproved && <StatusBadge tone="info" label="自动审批" />}
            </div>
            <div className="rounded-[10px] border border-[var(--line)] px-3">
              <DetailRow label="来源" value={drawerFpo.source === "hq" ? "HQ 中央仓" : "供应商直发"} />
              <DetailRow label={drawerFpo.mode === "buyout" ? "货款（预存扣减）" : "货款（备货参考）"} value={<b>R$ {drawerFpo.totalBRL.toFixed(2)}</b>} />
              {drawerFpo.note && <DetailRow label="备注" value={<span className="text-xs">{drawerFpo.note}</span>} />}
              {drawerFpo.shipNote && <DetailRow label="物流备注" value={<span className="text-xs">{drawerFpo.shipNote}</span>} />}
              {drawerFpo.cancelReason && <DetailRow label="取消原因" value={<span className="text-xs" style={{ color: "var(--danger)" }}>{drawerFpo.cancelReason}</span>} />}
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-black uppercase text-[var(--muted)]">商品明细</div>
              <div className="rounded-[10px] border border-[var(--line)]">
                {drawerFpo.items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold last:border-b-0">
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-[var(--muted)]">R$ {item.unitPrice.toFixed(2)}</span>
                    <span className="w-12 text-right font-black">×{item.qty}</span>
                    {typeof item.receivedQty === "number" && <span className="text-xs text-[var(--muted)]">实收 {item.receivedQty}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-black uppercase text-[var(--muted)]">时间线</div>
              <Timeline steps={[
                { label: "提交", at: drawerFpo.createdAt, note: drawerFpo.createdBy },
                { label: drawerFpo.autoApproved ? "自动批准" : "批准", at: drawerFpo.approvedAt, note: drawerFpo.approvedBy },
                { label: "驳回", at: drawerFpo.rejectedAt },
                { label: "确认备货", at: drawerFpo.confirmedAt },
                { label: "发货", at: drawerFpo.shippedAt },
                { label: "到站", at: drawerFpo.arrivedAt },
                { label: "入库", at: drawerFpo.receivedAt, note: drawerFpo.receivedBy },
                { label: "取消", at: drawerFpo.cancelledAt },
              ]} />
            </div>
            {drawerDiscrepancies.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-black uppercase text-[var(--muted)]">差异单（{drawerDiscrepancies.length}）</div>
                <div className="space-y-2">
                  {drawerDiscrepancies.map((d) => (
                    <div key={d.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black">{d.productName}</span>
                        <span>收 {d.receivedQty} / 订 {d.orderedQty}</span>
                        {d.resolution === "pending"
                          ? <StatusBadge tone="warn" label="待处理" />
                          : <StatusBadge tone="neutral" label={RESOLUTION_LABEL[d.resolution] ?? d.resolution} />}
                        {typeof d.refundBRL === "number" && d.refundBRL > 0 && <span className="text-[var(--muted)]">已退 R$ {d.refundBRL.toFixed(2)}</span>}
                      </div>
                      {d.resolution === "pending" && (
                        <div className="mt-1.5 flex gap-1.5">
                          {(["reship", "writeoff", "closed"] as const).map((resolution) => (
                            <button key={resolution} type="button" onClick={() => void post({ action: "resolveDiscrepancy", discrepancyId: d.id, resolution }, "已处理")} className={btnGhost}>
                              {RESOLUTION_LABEL[resolution]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {fpoActions(drawerFpo).length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                {fpoActions(drawerFpo).map((btn) => (
                  <button key={btn.label} type="button" onClick={btn.onClick} className={btn.danger ? btnDanger : btnOutline}>{btn.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
