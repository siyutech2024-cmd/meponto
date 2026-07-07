"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackagePlus, RefreshCcw, ShoppingCart, Wallet } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";
import type { FranchisePurchaseOrder, ProcurementDiscrepancy, StationStockBucket } from "../../lib/procurement";

/** Franchise procurement portal — 选货 → 订货 → 跟单 (docs/franchise-procurement-full-chain-plan.md). */

type CatalogRow = {
  id: string; name: string; category?: string; supplierName: string;
  procurementMode: "off" | "consignment" | "buyout" | "both";
  supplyPrice: number; franchiseBuyoutPrice: number; minOrderQty: number; maxOrderQty: number;
};
type Snapshot = {
  config: { procurementEnabled: boolean; procurementFrozen: boolean };
  catalog: CatalogRow[];
  stations: Array<{ id: string; name: string }>;
  fpos: FranchisePurchaseOrder[];
  stock: StationStockBucket[];
  depositBalance: number;
  topUps: Array<{ id: string; amountBRL: number; pixRef: string; status: string; createdAt: string }>;
  discrepancies: ProcurementDiscrepancy[];
};

const statusKey: Record<string, TranslationKey> = {
  submitted: "fpStSubmitted", approved: "fpStApproved", confirmed: "fpStConfirmed", shipped: "fpStShipped",
  arrived: "fpStArrived", received: "fpStReceived", rejected: "fpStRejected", cancelled: "fpStCancelled",
};

export default function MallFranchisePage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const franchise = session?.franchise || session?.organization || "";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Franchise Admin" }), [session]);

  const [data, setData] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [stationId, setStationId] = useState("");
  const [mode, setMode] = useState<"consignment" | "buyout">("consignment");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpRef, setTopUpRef] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/mall/procurement", { headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setData(payload.data as Snapshot);
      if (!stationId && payload.data?.stations?.length) setStationId(payload.data.stations[0].id);
    }
  }, [headers, stationId]);

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

  const catalog = (data?.catalog ?? []).filter((row) => row.procurementMode === "both" || row.procurementMode === mode);
  const cartLines = catalog.filter((row) => (cart[row.id] ?? 0) > 0);
  const cartTotal = cartLines.reduce((sum, row) => sum + (cart[row.id] ?? 0) * (mode === "buyout" ? row.franchiseBuyoutPrice : row.supplyPrice), 0);

  async function submitOrder() {
    const ok = await post({
      action: "createFPO",
      stationId,
      mode,
      items: cartLines.map((row) => ({ productId: row.id, qty: cart[row.id] })),
    }, t("fpSubmitOk"));
    if (ok) setCart({});
  }

  if (data && data.config.procurementEnabled !== true) {
    return (
      <AppShell>
        <PageTitle title={t("fpTitle")} eyebrow={t("fpEyebrow", { x: franchise })} />
        <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("fpFlagOff")}</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle
        title={t("fpTitle")}
        eyebrow={t("fpEyebrow", { x: franchise })}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pfRefresh")}</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 选货目录 + 购物车 */}
        <div className="panel p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-black uppercase text-[var(--accent)]"><ShoppingCart size={14} className="mr-1 inline" />{t("fpCatalog")}</div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <label>{t("fpModePick")}</label>
              <select value={mode} onChange={(e) => { setMode(e.target.value === "buyout" ? "buyout" : "consignment"); setCart({}); }} className="h-8 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                <option value="consignment">{t("fpModeConsignment")}</option>
                <option value="buyout">{t("fpModeBuyout")}</option>
              </select>
              <label>{t("fpStationPick")}</label>
              <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="h-8 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
                {(data?.stations ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {catalog.length === 0 ? (
            <div className="py-6 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {catalog.map((row) => {
                const price = mode === "buyout" ? row.franchiseBuyoutPrice : row.supplyPrice;
                return (
                  <div key={row.id} className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div>
                      <div className="text-sm font-black">{row.name}</div>
                      <div className="text-[11px] font-bold text-[var(--muted)]">
                        {t("fpSupplier")}: {row.supplierName || "HQ"} ｜ {t("fpUnitPrice")} {price.toFixed(2)} ｜ {t("fpMinQty", { n: row.minOrderQty })}{row.maxOrderQty > 0 ? ` / ≤${row.maxOrderQty}` : ""}
                      </div>
                    </div>
                    <input
                      type="number" min={0} max={row.maxOrderQty > 0 ? row.maxOrderQty : undefined}
                      value={cart[row.id] ?? 0}
                      onChange={(e) => setCart((prev) => ({ ...prev, [row.id]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
                      className="h-9 w-20 text-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]"
                      aria-label={`${row.name} ${t("fpQty")}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 text-sm font-black">
            <span>{t("fpCart")}: {t("fpItems", { n: cartLines.length })} ｜ {t("fpTotal")} R$ {cartTotal.toFixed(2)}</span>
            <button
              type="button"
              disabled={cartLines.length === 0 || !stationId}
              onClick={() => void submitOrder()}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-40"
            >
              <PackagePlus size={13} /> {t("fpSubmit")}
            </button>
          </div>
        </div>

        {/* 预存余额 + 充值 */}
        <div className="panel p-4">
          <div className="mb-2 text-xs font-black uppercase text-[var(--accent)]"><Wallet size={14} className="mr-1 inline" />{t("fpDeposit")}</div>
          <div className="mb-3 text-2xl font-black">R$ {(data?.depositBalance ?? 0).toFixed(2)}</div>
          <div className="space-y-2 text-xs font-bold">
            <input value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder={t("fpTopUpAmount")} className="h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            <input value={topUpRef} onChange={(e) => setTopUpRef(e.target.value)} placeholder={t("fpTopUpRef")} className="h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            <button
              type="button"
              onClick={() => void post({ action: "requestDepositTopUp", amountBRL: Number(topUpAmount), pixRef: topUpRef }, t("fpTopUpOk")).then((ok) => { if (ok) { setTopUpAmount(""); setTopUpRef(""); } })}
              className="h-9 w-full rounded-[8px] bg-[var(--accent)] text-xs font-black uppercase text-[var(--accent-ink)]"
            >
              {t("fpTopUpSend")}
            </button>
            {(data?.topUps ?? []).slice(0, 5).map((topUp) => (
              <div key={topUp.id} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                <span>R$ {topUp.amountBRL.toFixed(2)} · {topUp.pixRef}</span><Badge value={topUp.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 我的订货单 */}
      <div className="panel mt-4 p-4">
        <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpMyOrders")}（{(data?.fpos ?? []).length}）</div>
        {(data?.fpos ?? []).length === 0 ? (
          <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
        ) : (
          <div className="max-h-[380px] space-y-2 overflow-auto pr-1">
            {(data?.fpos ?? []).map((fpo) => (
              <div key={fpo.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black">
                  <span>{fpo.id} · {fpo.stationName} · {fpo.supplierName}</span>
                  <span className="flex items-center gap-2">
                    <Badge value={t(fpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} />
                    <Badge value={statusKey[fpo.status] ? t(statusKey[fpo.status]) : fpo.status} />
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                  {fpo.items.map((item) => `${item.name} ×${item.qty}${item.receivedQty !== undefined && item.receivedQty !== item.qty ? ` (${t("ssReceivedQty")} ${item.receivedQty})` : ""}`).join("、")}
                  ｜ {t("fpTotal")} R$ {fpo.totalBRL.toFixed(2)} ｜ {fpo.createdAt}
                </div>
                {fpo.status === "submitted" && (
                  <button type="button" onClick={() => void post({ action: "cancelFPO", fpoId: fpo.id }, t("fpCancelOk"))} className="mt-2 h-8 rounded-[8px] border border-[var(--danger)] px-3 text-[11px] font-black uppercase text-[var(--danger-ink)]">
                    {t("fpCancelOrder")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 站点库存 + 差异 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpStock")}</div>
          {(data?.stock ?? []).length === 0 ? (
            <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
          ) : (
            <div className="max-h-[280px] space-y-1 overflow-auto pr-1 text-xs font-bold">
              {(data?.stock ?? []).map((bucket) => (
                <div key={`${bucket.stationId}-${bucket.productId}-${bucket.mode}`} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                  <span>{bucket.stationName} · {bucket.productName}</span>
                  <span>{t(bucket.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} ｜ {t("fpOnHand")} {bucket.qty}{bucket.reserved > 0 ? ` ｜ ${t("fpReserved")} ${bucket.reserved}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpDiscrepancies")}</div>
          {(data?.discrepancies ?? []).length === 0 ? (
            <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
          ) : (
            <div className="max-h-[280px] space-y-1 overflow-auto pr-1 text-xs font-bold">
              {(data?.discrepancies ?? []).map((d) => (
                <div key={d.id} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                  <span>{d.fpoId} · {d.productName} {d.receivedQty}/{d.orderedQty}</span>
                  <span>{d.kind} → {d.resolution}{d.refundBRL ? ` (R$ ${d.refundBRL.toFixed(2)})` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
