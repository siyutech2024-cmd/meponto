"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Inbox, PackageCheck, RefreshCcw, Warehouse } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { MarketplaceOrder } from "../../lib/points";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";
import type { FranchisePurchaseOrder, StationStockBucket } from "../../lib/procurement";

const statusKey: Record<string, TranslationKey> = { created: "msStCreated", arrived: "msStArrived", fulfilled: "msStFulfilled", cancelled: "msStCancelled" };
const fpoStatusKey: Record<string, TranslationKey> = {
  submitted: "fpStSubmitted", approved: "fpStApproved", confirmed: "fpStConfirmed", shipped: "fpStShipped",
  arrived: "fpStArrived", received: "fpStReceived", rejected: "fpStRejected", cancelled: "fpStCancelled",
};

const inputCls = "rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";

export default function MallStationPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const station = session?.station || session?.organization || "Santo Amaro";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Ponto Manager" }), [session]);

  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [tab, setTab] = useState<"redemption" | "receiving" | "stock">("redemption");
  const [fpos, setFpos] = useState<FranchisePurchaseOrder[]>([]);
  const [stock, setStock] = useState<StationStockBucket[]>([]);
  const [receivedDraft, setReceivedDraft] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(async () => {
    const response = await fetch(`/api/mall?station=${encodeURIComponent(station)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setOrders(payload.data.orders);
    // Procurement receiving desk (FPOs to this station + station stock pools).
    const procurement = await fetch("/api/mall/procurement", { headers, cache: "no-store" });
    const procurementPayload = await procurement.json().catch(() => ({}));
    if (procurement.ok) {
      setFpos((procurementPayload.data?.fpos ?? []) as FranchisePurchaseOrder[]);
      setStock((procurementPayload.data?.stock ?? []) as StationStockBucket[]);
    }
  }, [headers, station]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "markArrived" | "markPickedUp", orderId: string, text: string) {
    const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action, orderId }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("msActFail", { status: response.status }) });
      return;
    }
    setMessage({ tone: "ok", text });
    void load();
  }

  async function receiveFpo(fpo: FranchisePurchaseOrder) {
    const draft = receivedDraft[fpo.id] ?? {};
    const received = fpo.items.map((item) => ({
      productId: item.productId,
      receivedQty: draft[item.productId] === undefined || draft[item.productId] === "" ? item.qty : Math.max(0, Math.trunc(Number(draft[item.productId]) || 0)),
    }));
    const response = await fetch("/api/mall/procurement", { method: "POST", headers, body: JSON.stringify({ action: "receiveFPO", fpoId: fpo.id, received }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const key = payload.errorKey as TranslationKey | undefined;
      setMessage({ tone: "err", text: key ? t(key) : payload.error ?? t("fpActFail", { status: response.status }) });
      return;
    }
    setMessage({ tone: "ok", text: t("ssReceiveOk") });
    void load();
  }

  const inTransit = orders.filter((order) => order.status === "created");
  const arrived = orders.filter((order) => order.status === "arrived");
  const done = orders.filter((order) => order.status === "fulfilled");
  const incoming = fpos.filter((fpo) => fpo.status === "shipped" || fpo.status === "arrived");
  const fpoHistory = fpos.filter((fpo) => fpo.status === "received").slice(0, 20);

  return (
    <AppShell>
      <PageTitle
        title={t("msTitle")}
        eyebrow={t("msEyebrow", { x: station })}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pfRefresh")}</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {([
          ["redemption", t("ssTabRedemption"), <PackageCheck key="i" size={13} />],
          ["receiving", `${t("ssTabReceiving")}（${incoming.length}）`, <Inbox key="i" size={13} />],
          ["stock", t("ssTabStock"), <Warehouse key="i" size={13} />],
        ] as const).map(([key, label, icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex h-9 items-center gap-1 rounded-[8px] px-4 text-xs font-black uppercase ${tab === key ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line)] text-[var(--muted)]"}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "redemption" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {([
            [t("msColTransit"), inTransit, "markArrived", t("msBtnArrived"), t("msOkArrived")],
            [t("msColArrived"), arrived, "markPickedUp", t("msBtnPicked"), t("msOkPicked")],
            [t("msColDone"), done, null, "", ""],
          ] as const).map(([title, list, action, buttonLabel, okText]) => (
            <div key={title} className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><PackageCheck size={14} /> {title}（{list.length}）</div>
              {list.length === 0 ? (
                <div className="text-sm font-bold text-[var(--muted)]">{t("msNoOrders")}</div>
              ) : (
                <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                  {list.map((order) => (
                    <div key={order.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                      <div className="flex items-center justify-between gap-2 text-sm font-black">
                        {order.productName ?? order.productId}
                        <Badge value={order.reviewStatus === "pending" ? t("dpPendingHq") : (statusKey[order.status] ? t(statusKey[order.status]) : order.status)} />
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                        {t("msOrderLine", { rider: order.riderName, points: order.pointsSpent, date: order.createdAt })}
                        {order.etaDate && t("msEta", { x: order.etaDate })}
                        {order.arrivedAt && t("msArrivedAt", { x: order.arrivedAt })}
                        {order.pickedUpAt && t("msPickedAt", { x: order.pickedUpAt })}
                      </div>
                      {action && order.reviewStatus === "pending" ? (
                        <div className="mt-2 text-[11px] font-black text-[#9a7400]">{t("msHighValue")}</div>
                      ) : action ? (
                        <button
                          type="button"
                          onClick={() => void act(action, order.id, okText)}
                          className="mt-2 inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]"
                        >
                          <CheckCircle2 size={13} /> {buttonLabel}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "receiving" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]"><Inbox size={14} className="mr-1 inline" />{t("ssIncoming")}（{incoming.length}）</div>
            {incoming.length === 0 ? (
              <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("ssNoIncoming")}</div>
            ) : (
              <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
                {incoming.map((fpo) => (
                  <div key={fpo.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between gap-2 text-sm font-black">
                      <span>{fpo.id} · {fpo.supplierName}</span>
                      <span className="flex gap-2">
                        <Badge value={t(fpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} />
                        <Badge value={fpoStatusKey[fpo.status] ? t(fpoStatusKey[fpo.status]) : fpo.status} />
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {fpo.items.map((item) => (
                        <div key={item.productId} className="flex items-center justify-between gap-2 text-[11px] font-bold">
                          <span>{item.name} ｜ {t("fpQty")} {item.qty}</span>
                          <label className="flex items-center gap-1">
                            {t("ssReceivedQty")}
                            <input
                              type="number" min={0}
                              placeholder={String(item.qty)}
                              value={receivedDraft[fpo.id]?.[item.productId] ?? ""}
                              onChange={(e) => setReceivedDraft((prev) => ({ ...prev, [fpo.id]: { ...(prev[fpo.id] ?? {}), [item.productId]: e.target.value } }))}
                              className={`h-8 w-16 text-center ${inputCls}`}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => void receiveFpo(fpo)} className="mt-2 inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]">
                      <CheckCircle2 size={13} /> {t("ssReceive")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel p-4">
            <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("fpMyOrders")}</div>
            {fpoHistory.length === 0 ? (
              <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
            ) : (
              <div className="max-h-[460px] space-y-1 overflow-auto pr-1 text-xs font-bold">
                {fpoHistory.map((fpo) => (
                  <div key={fpo.id} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                    <span>{fpo.id} · {fpo.items.map((item) => `${item.name} ×${Math.min(item.qty, item.receivedQty ?? item.qty)}`).join("、")}</span>
                    <span>{fpo.receivedAt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]"><Warehouse size={14} className="mr-1 inline" />{t("ssTabStock")}</div>
          {stock.length === 0 ? (
            <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{t("fpNoData")}</div>
          ) : (
            <div className="max-h-[480px] space-y-1 overflow-auto pr-1 text-xs font-bold">
              {stock.map((bucket) => (
                <div key={`${bucket.productId}-${bucket.mode}`} className="flex justify-between rounded-[6px] border border-[var(--line)] px-2 py-1">
                  <span>{bucket.productName}</span>
                  <span>{t(bucket.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} ｜ {t("fpOnHand")} {bucket.qty}{bucket.reserved > 0 ? ` ｜ ${t("fpReserved")} ${bucket.reserved}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
