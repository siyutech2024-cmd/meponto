"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, RefreshCcw, Settings2, Warehouse, XCircle } from "lucide-react";
import { Badge } from "../components/ui";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import type { FranchisePurchaseOrder, ProcurementDiscrepancy, StationStockBucket } from "../lib/procurement";

/** PontoMall back office — 加盟商订货 tab (the ONLY write surface for
 *  procurement office actions, per plan §2). */

type ProductRow = {
  id: string; name: string; status: string; supplierName: string; supplyPrice: number;
  procurementMode: "off" | "consignment" | "buyout" | "both";
  franchiseBuyoutPrice: number; minOrderQty: number; maxOrderQty: number;
};
type OfficeSnapshot = {
  config: { procurementEnabled: boolean; procurementFrozen: boolean; procurementAutoApproveBRL: number; procurementMaxOrderBRL: number; procurementShipTimeoutDays: number; stationStockEnforcement: boolean };
  products: ProductRow[];
  fpos: FranchisePurchaseOrder[];
  stock: StationStockBucket[];
  topUps: Array<{ id: string; franchise: string; amountBRL: number; pixRef: string; status: string; createdAt: string }>;
  discrepancies: ProcurementDiscrepancy[];
  franchises: Array<{ name: string; depositBalance: number }>;
};

const fpoStatusKey: Record<string, TranslationKey> = {
  submitted: "fpStSubmitted", approved: "fpStApproved", confirmed: "fpStConfirmed", shipped: "fpStShipped",
  arrived: "fpStArrived", received: "fpStReceived", rejected: "fpStRejected", cancelled: "fpStCancelled",
};

const inputCls = "rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";

export default function ProcurementTab() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [data, setData] = useState<OfficeSnapshot | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [cfgDraft, setCfgDraft] = useState<Record<string, string | boolean>>({});
  const [productDrafts, setProductDrafts] = useState<Record<string, { mode: string; price: string; minQ: string; maxQ: string }>>({});

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
      setMessage({ tone: "err", text: key ? t(key) : payload.error ?? t("fpActFail", { status: response.status }) });
      return false;
    }
    setMessage({ tone: "ok", text: okText });
    void load();
    return true;
  }

  if (!data) return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">…</div>;

  const config = data.config;
  const queue = data.fpos.filter((fpo) => fpo.status === "submitted");
  const inFlight = data.fpos.filter((fpo) => ["approved", "confirmed", "shipped", "arrived"].includes(fpo.status));
  const timeoutMs = (config.procurementShipTimeoutDays || 7) * 86_400_000;
  const isStalled = (fpo: FranchisePurchaseOrder) => fpo.status === "shipped" && fpo.shippedAt !== undefined && Date.now() - new Date(fpo.shippedAt.replace(" ", "T")).getTime() > timeoutMs;
  const pendingTopUps = data.topUps.filter((topUp) => topUp.status === "submitted");
  const pendingDiscrepancies = data.discrepancies.filter((d) => d.resolution === "pending");

  const cfgValue = (key: keyof OfficeSnapshot["config"]) => (cfgDraft[key] !== undefined ? cfgDraft[key] : config[key]);

  function fpoActions(fpo: FranchisePurchaseOrder) {
    const buttons: Array<{ label: string; onClick: () => void; danger?: boolean }> = [];
    if (fpo.status === "submitted") {
      buttons.push({ label: t("fpoApprove"), onClick: () => void post({ action: "approveFPO", fpoId: fpo.id }, t("fpoDecideOk")) });
      buttons.push({ label: t("fpoReject"), danger: true, onClick: () => void post({ action: "rejectFPO", fpoId: fpo.id }, t("fpoDecideOk")) });
    }
    if (fpo.status === "approved" && fpo.source === "hq") buttons.push({ label: t("fpoConfirmBtn"), onClick: () => void post({ action: "confirmFPO", fpoId: fpo.id }, t("fpoDecideOk")) });
    if (fpo.status === "confirmed" && fpo.source === "hq") buttons.push({ label: t("fpoShipBtn"), onClick: () => void post({ action: "shipFPO", fpoId: fpo.id }, t("fpoDecideOk")) });
    if (fpo.status === "shipped") {
      buttons.push({ label: t("fpoArriveBtn"), onClick: () => void post({ action: "arriveFPO", fpoId: fpo.id }, t("fpoDecideOk")) });
      buttons.push({
        label: t("fpoException"), danger: true,
        onClick: () => {
          const reason = window.prompt(t("fpReason"));
          if (reason) void post({ action: "closeExceptionFPO", fpoId: fpo.id, reason }, t("fpoDecideOk"));
        },
      });
    }
    if (fpo.status === "approved" || fpo.status === "confirmed") {
      buttons.push({
        label: t("fpoCancelBtn"), danger: true,
        onClick: () => {
          const reason = window.prompt(t("fpReason"));
          if (reason) void post({ action: "cancelFPO", fpoId: fpo.id, reason }, t("fpoDecideOk"));
        },
      });
    }
    return buttons;
  }

  const renderFpo = (fpo: FranchisePurchaseOrder) => (
    <div key={fpo.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black">
        <span>{fpo.id} · {fpo.franchise} → {fpo.stationName} · {fpo.supplierName}</span>
        <span className="flex items-center gap-2">
          {isStalled(fpo) && <Badge value={t("fpoStalled")} />}
          <Badge value={t(fpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} />
          <Badge value={fpoStatusKey[fpo.status] ? t(fpoStatusKey[fpo.status]) : fpo.status} />
        </span>
      </div>
      <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
        {fpo.items.map((item) => `${item.name} ×${item.qty}`).join("、")} ｜ {t("fpTotal")} R$ {fpo.totalBRL.toFixed(2)} ｜ {fpo.createdAt}
        {fpo.autoApproved ? " ｜ auto" : ""}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {fpoActions(fpo).map((btn) => (
          <button key={btn.label} type="button" onClick={btn.onClick} className={`h-8 rounded-[8px] px-3 text-[11px] font-black uppercase ${btn.danger ? "border border-[var(--danger)] text-[var(--danger-ink)]" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* 采购配置 */}
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-black uppercase text-[var(--accent)]"><Settings2 size={14} className="mr-1 inline" />{t("fpoConfig")}</div>
          <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /></button>
        </div>
        <div className="grid gap-3 text-xs font-bold md:grid-cols-3">
          {([["procurementEnabled", "fpoEnabled"], ["procurementFrozen", "fpoFrozen"], ["stationStockEnforcement", "fpoEnforce"]] as const).map(([key, labelKey]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={cfgValue(key) === true} onChange={(e) => setCfgDraft((prev) => ({ ...prev, [key]: e.target.checked }))} />
              {t(labelKey)}
            </label>
          ))}
          {([["procurementAutoApproveBRL", "fpoAutoApprove"], ["procurementMaxOrderBRL", "fpoMaxOrder"], ["procurementShipTimeoutDays", "fpoTimeout"]] as const).map(([key, labelKey]) => (
            <label key={key} className="flex items-center gap-2">
              {t(labelKey)}
              <input value={String(cfgValue(key))} onChange={(e) => setCfgDraft((prev) => ({ ...prev, [key]: e.target.value }))} className={`h-8 w-24 ${inputCls}`} />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const body: Record<string, unknown> = { action: "setProcurementConfig" };
            for (const [key, value] of Object.entries(cfgDraft)) body[key] = typeof value === "boolean" ? value : Number(value);
            void post(body, t("fpoCfgOk")).then((ok) => { if (ok) setCfgDraft({}); });
          }}
          className="mt-3 h-9 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]"
        >
          {t("fpoSaveCfg")}
        </button>
      </div>

      {/* 审批队列 + 在途单据 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]"><ClipboardList size={14} className="mr-1 inline" />{t("fpoQueue")}（{queue.length}）</div>
          {queue.length === 0 ? <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div> : <div className="max-h-[400px] space-y-2 overflow-auto pr-1">{queue.map(renderFpo)}</div>}
        </div>
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpoAll")}（{data.fpos.length}）</div>
          <div className="max-h-[400px] space-y-2 overflow-auto pr-1">
            {inFlight.map(renderFpo)}
            {data.fpos.filter((fpo) => !["submitted", "approved", "confirmed", "shipped", "arrived"].includes(fpo.status)).slice(0, 20).map(renderFpo)}
          </div>
        </div>
      </div>

      {/* 充值核销 + 差异处理 + 预存 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpoTopUps")}（{pendingTopUps.length}）</div>
          {pendingTopUps.length === 0 ? <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">{t("fpNoData")}</div> : pendingTopUps.map((topUp) => (
            <div key={topUp.id} className="mb-2 rounded-[8px] border border-[var(--line)] p-2 text-xs font-bold">
              <div>{topUp.franchise} · R$ {topUp.amountBRL.toFixed(2)} · PIX {topUp.pixRef}</div>
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => void post({ action: "confirmDepositTopUp", topUpId: topUp.id }, t("fpoDecideOk"))} className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2 text-[11px] font-black uppercase text-[var(--accent-ink)]"><CheckCircle2 size={11} /> {t("fpoTopUpConfirm")}</button>
                <button type="button" onClick={() => void post({ action: "rejectDepositTopUp", topUpId: topUp.id }, t("fpoDecideOk"))} className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[var(--danger)] px-2 text-[11px] font-black uppercase text-[var(--danger-ink)]"><XCircle size={11} /> {t("fpoTopUpReject")}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpDiscrepancies")}（{pendingDiscrepancies.length}）</div>
          {pendingDiscrepancies.length === 0 ? <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">{t("fpNoData")}</div> : pendingDiscrepancies.map((d) => (
            <div key={d.id} className="mb-2 rounded-[8px] border border-[var(--line)] p-2 text-xs font-bold">
              <div>{d.fpoId} · {d.productName} {d.receivedQty}/{d.orderedQty} · {d.kind}</div>
              <div className="mt-1 flex gap-2">
                {(["reship", "writeoff", "closed"] as const).map((resolution) => (
                  <button key={resolution} type="button" onClick={() => void post({ action: "resolveDiscrepancy", discrepancyId: d.id, resolution }, t("fpoDecideOk"))} className="h-7 rounded-[6px] border border-[var(--line)] px-2 text-[11px] font-black uppercase">
                    {resolution}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpoDeposits")}</div>
          <div className="max-h-[240px] space-y-1 overflow-auto pr-1 text-xs font-bold">
            {data.franchises.map((franchise) => (
              <div key={franchise.name} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                <span>{franchise.name}</span>
                <span className={franchise.depositBalance < 0 ? "text-[var(--danger-ink)]" : ""}>R$ {franchise.depositBalance.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 商品采购设置 */}
      <div className="panel p-4">
        <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpoProductCfg")}</div>
        <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
          {data.products.map((product) => {
            const draft = productDrafts[product.id] ?? { mode: product.procurementMode, price: String(product.franchiseBuyoutPrice || ""), minQ: String(product.minOrderQty), maxQ: String(product.maxOrderQty) };
            return (
              <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-xs font-bold">
                <span className="min-w-40 font-black">{product.name}<span className="ml-1 text-[var(--muted)]">({product.supplierName || "HQ"})</span></span>
                <span className="flex flex-wrap items-center gap-2">
                  {t("fpoModeCol")}
                  <select value={draft.mode} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, mode: e.target.value } }))} className={`h-8 ${inputCls}`}>
                    <option value="off">off</option>
                    <option value="consignment">{t("fpModeConsignment")}</option>
                    <option value="buyout">{t("fpModeBuyout")}</option>
                    <option value="both">{t("fpModeConsignment")}+{t("fpModeBuyout")}</option>
                  </select>
                  {t("fpoBuyoutPrice")}
                  <input value={draft.price} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, price: e.target.value } }))} className={`h-8 w-20 ${inputCls}`} />
                  {t("fpoMinQ")}
                  <input value={draft.minQ} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, minQ: e.target.value } }))} className={`h-8 w-14 ${inputCls}`} />
                  {t("fpoMaxQ")}
                  <input value={draft.maxQ} onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.id]: { ...draft, maxQ: e.target.value } }))} className={`h-8 w-14 ${inputCls}`} />
                  <button
                    type="button"
                    onClick={() => void post({ action: "setProductProcurement", productId: product.id, procurementMode: draft.mode, franchiseBuyoutPrice: Number(draft.price) || 0, minOrderQty: Number(draft.minQ) || 1, maxOrderQty: Number(draft.maxQ) || 0 }, t("fpoDecideOk"))}
                    className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-[11px] font-black uppercase text-[var(--accent-ink)]"
                  >
                    {t("fpoSaveProduct")}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 站点库存总览 */}
      <div className="panel p-4">
        <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]"><Warehouse size={14} className="mr-1 inline" />{t("fpoStockAll")}</div>
        {data.stock.length === 0 ? (
          <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
        ) : (
          <div className="max-h-[320px] space-y-1 overflow-auto pr-1 text-xs font-bold">
            {data.stock.map((bucket) => (
              <div key={`${bucket.stationId}-${bucket.productId}-${bucket.mode}`} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                <span>{bucket.stationName} · {bucket.productName}</span>
                <span>{t(bucket.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} ｜ {t("fpOnHand")} {bucket.qty}{bucket.reserved > 0 ? ` ｜ ${t("fpReserved")} ${bucket.reserved}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
