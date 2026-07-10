"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Inbox, PackageCheck, RefreshCcw, Truck, UserRound, Warehouse } from "lucide-react";
import { AppShell, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { MarketplaceOrder } from "../../lib/points";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";
import type { FranchisePurchaseOrder, StationStockBucket } from "../../lib/procurement";
import { DataTable, SearchInput, SectionCard, Stat, StatusBadge, Toolbar, type BadgeTone, type DataColumn } from "../kit";

/** Station fulfillment desk — rebuilt on the shared mall kit (Stat / DataTable /
 *  StatusBadge / Toolbar). Badge semantics: green = flowing, amber = waiting on
 *  a human at this desk, red = exception, gray = terminal. */

const statusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  created: { key: "msStCreated", tone: "success" },
  arrived: { key: "msStArrived", tone: "warn" },
  fulfilled: { key: "msStFulfilled", tone: "neutral" },
  cancelled: { key: "msStCancelled", tone: "neutral" },
};
const fpoStatusMeta: Record<string, { key: TranslationKey; tone: BadgeTone }> = {
  submitted: { key: "fpStSubmitted", tone: "warn" },
  approved: { key: "fpStApproved", tone: "warn" },
  confirmed: { key: "fpStConfirmed", tone: "success" },
  shipped: { key: "fpStShipped", tone: "success" },
  arrived: { key: "fpStArrived", tone: "warn" },
  received: { key: "fpStReceived", tone: "neutral" },
  rejected: { key: "fpStRejected", tone: "danger" },
  cancelled: { key: "fpStCancelled", tone: "neutral" },
};

const inputCls = "rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";
/** Row-level desk action — outlined accent (at most one solid yellow primary per view). */
const btnAction = "inline-flex items-center gap-1 rounded-[8px] border border-[var(--accent)]/50 text-xs font-black text-[var(--accent)] hover:bg-[var(--accent)]/10";

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
  const [query, setQuery] = useState("");
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

  const today = new Date().toISOString().slice(0, 10);
  const q = query.trim().toLowerCase();
  const matches = (order: MarketplaceOrder) => !q || (order.riderName ?? "").toLowerCase().includes(q) || order.id.toLowerCase().includes(q);

  // Top stats (unfiltered) — today's pickups pending, in transit, delivered today.
  const statArrived = orders.filter((order) => order.status === "arrived").length;
  const statTransit = orders.filter((order) => order.status === "created").length;
  const statDoneToday = orders.filter((order) => order.status === "fulfilled" && (order.pickedUpAt ?? "").startsWith(today)).length;

  const inTransit = orders.filter((order) => order.status === "created" && matches(order));
  const arrived = orders.filter((order) => order.status === "arrived" && matches(order));
  const doneToday = orders.filter((order) => order.status === "fulfilled" && (order.pickedUpAt ?? "").startsWith(today) && matches(order));

  // Pickup queue grouped by rider so the desk hands one bag per person.
  const pickupGroups = new Map<string, MarketplaceOrder[]>();
  for (const order of arrived) {
    const key = order.riderName || "—";
    const list = pickupGroups.get(key) ?? [];
    list.push(order);
    pickupGroups.set(key, list);
  }
  const pickupByRider = [...pickupGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const incoming = fpos.filter((fpo) => fpo.status === "shipped" || fpo.status === "arrived");
  const fpoHistory = fpos.filter((fpo) => fpo.status === "received").slice(0, 20);

  const emptyLabel = (hadAny: boolean) => (q && hadAny ? t("msNoMatch") : t("msNoOrders"));

  const reviewBadge = (order: MarketplaceOrder) =>
    order.reviewStatus === "pending"
      ? <StatusBadge tone="warn" label={t("dpPendingHq")} />
      : statusMeta[order.status]
        ? <StatusBadge tone={statusMeta[order.status].tone} label={t(statusMeta[order.status].key)} />
        : <StatusBadge tone="neutral" label={order.status} />;

  const actionButton = (order: MarketplaceOrder, action: "markArrived" | "markPickedUp", label: string, okText: string) =>
    order.reviewStatus === "pending" ? (
      <span className="text-[11px] font-black text-[var(--warn)]">{t("msHighValue")}</span>
    ) : (
      <button type="button" onClick={() => void act(action, order.id, okText)} className={`h-8 px-3 ${btnAction}`}>
        <CheckCircle2 size={13} /> {label}
      </button>
    );

  // ---- DataTable columns ---------------------------------------------------

  const transitCols: Array<DataColumn<MarketplaceOrder>> = [
    { key: "product", label: t("mkColProduct"), render: (order) => <span className="font-black">{order.productName ?? order.productId}</span> },
    { key: "id", label: t("mkColOrder"), render: (order) => <span className="font-mono text-xs text-[var(--muted)]">{order.id}</span> },
    { key: "rider", label: t("mkColRider"), render: (order) => order.riderName },
    { key: "points", label: t("mkColPoints"), align: "right", render: (order) => order.pointsSpent },
    { key: "eta", label: t("mkColEta"), render: (order) => <span className="text-[var(--muted)]">{order.etaDate ?? "—"}</span> },
    { key: "status", label: t("mkColStatus"), render: (order) => reviewBadge(order) },
    { key: "actions", label: t("mkColActions"), align: "right", render: (order) => actionButton(order, "markArrived", t("msBtnArrived"), t("msOkArrived")) },
  ];

  const doneCols: Array<DataColumn<MarketplaceOrder>> = [
    { key: "product", label: t("mkColProduct"), render: (order) => <span className="font-black">{order.productName ?? order.productId}</span> },
    { key: "id", label: t("mkColOrder"), render: (order) => <span className="font-mono text-xs text-[var(--muted)]">{order.id}</span> },
    { key: "rider", label: t("mkColRider"), render: (order) => order.riderName },
    { key: "points", label: t("mkColPoints"), align: "right", render: (order) => order.pointsSpent },
    { key: "picked", label: t("mkColPickedAt"), render: (order) => <span className="text-[var(--muted)]">{order.pickedUpAt ?? "—"}</span> },
    { key: "status", label: t("mkColStatus"), render: (order) => reviewBadge(order) },
  ];

  const historyCols: Array<DataColumn<FranchisePurchaseOrder>> = [
    { key: "id", label: t("mkColOrder"), render: (fpo) => <span className="font-mono text-xs">{fpo.id}</span> },
    { key: "items", label: t("mkColItems"), className: "max-w-[340px]", render: (fpo) => <span className="block truncate text-xs">{fpo.items.map((item) => `${item.name} ×${Math.min(item.qty, item.receivedQty ?? item.qty)}`).join("、")}</span> },
    { key: "supplier", label: t("fpSupplier"), render: (fpo) => <span className="text-[var(--muted)]">{fpo.supplierName}</span> },
    { key: "received", label: t("mkColReceivedAt"), render: (fpo) => <span className="text-[var(--muted)]">{fpo.receivedAt ?? "—"}</span> },
  ];

  const stockCols: Array<DataColumn<StationStockBucket>> = [
    { key: "product", label: t("mkColProduct"), render: (bucket) => <span className="font-black">{bucket.productName}</span> },
    { key: "mode", label: t("fpoModeCol"), render: (bucket) => <StatusBadge tone={bucket.mode === "buyout" ? "info" : "neutral"} label={t(bucket.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} /> },
    { key: "qty", label: t("fpOnHand"), align: "right", render: (bucket) => bucket.qty },
    { key: "reserved", label: t("fpReserved"), align: "right", render: (bucket) => (bucket.reserved > 0 ? bucket.reserved : <span className="text-[var(--muted)]">—</span>) },
  ];

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
        <div className="space-y-4">
          {/* Top stats */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("msStatArrivedToday")} value={String(statArrived)} />
            <Stat label={t("msStatTransit")} value={String(statTransit)} />
            <Stat label={t("msStatDoneToday")} value={String(statDoneToday)} />
          </div>

          {/* Rider / order search */}
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder={t("msSearchPh")} className="w-full max-w-md" />
          </Toolbar>

          {/* Today's pickup queue — grouped by rider (kept as card groups for desk clarity) */}
          <SectionCard title={<span className="inline-flex items-center gap-2 text-[var(--accent)]"><PackageCheck size={14} /> {t("msSecPickup")}（{arrived.length}）</span>}>
            {arrived.length === 0 ? (
              <div className="py-4 text-center text-sm font-bold text-[var(--muted)]">{emptyLabel(statArrived > 0)}</div>
            ) : (
              <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
                {pickupByRider.map(([rider, list]) => (
                  <div key={rider} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <UserRound size={14} className="text-[var(--accent)]" />
                      <span className="text-sm font-black">{rider}</span>
                      <span className="tag">{t("msGroupOrders", { n: list.length })}</span>
                    </div>
                    <div className="space-y-1.5">
                      {list.map((order) => (
                        <div key={order.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-black">{order.productName ?? order.productId}</span>
                          <span className="font-mono text-[11px] font-bold text-[var(--muted)]">{order.id}</span>
                          <span className="text-[11px] font-bold text-[var(--muted)]">{order.pointsSpent} {t("dynPts")}</span>
                          {reviewBadge(order)}
                          {actionButton(order, "markPickedUp", t("msBtnPicked"), t("msOkPicked"))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* In transit (confirm arrival) */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><Truck size={14} /> {t("msColTransit")}（{inTransit.length}）</div>
            <DataTable columns={transitCols} rows={inTransit} rowKey={(order) => order.id} minWidth={780} empty={emptyLabel(statTransit > 0)} />
          </div>

          {/* Delivered today (read-only) */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><CheckCircle2 size={14} /> {t("msStatDoneToday")}（{doneToday.length}）</div>
            <DataTable columns={doneCols} rows={doneToday} rowKey={(order) => order.id} minWidth={780} empty={emptyLabel(statDoneToday > 0)} />
          </div>
        </div>
      )}

      {tab === "receiving" && (
        <div className="space-y-4">
          {/* Incoming FPOs — roomy counting form (one card per order) */}
          {incoming.length === 0 ? (
            <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">{t("ssNoIncoming")}</div>
          ) : (
            incoming.map((fpo) => (
              <SectionCard
                key={fpo.id}
                title={<span className="inline-flex items-center gap-2"><Inbox size={14} /> {fpo.id} · {fpo.supplierName}</span>}
                desc={t("ssCountHint")}
                right={
                  <>
                    <StatusBadge tone="info" label={t(fpo.mode === "buyout" ? "fpModeBuyout" : "fpModeConsignment")} />
                    {fpoStatusMeta[fpo.status]
                      ? <StatusBadge tone={fpoStatusMeta[fpo.status].tone} label={t(fpoStatusMeta[fpo.status].key)} />
                      : <StatusBadge tone="neutral" label={fpo.status} />}
                  </>
                }
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {fpo.items.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black">{item.name}</div>
                        <div className="text-[11px] font-bold text-[var(--muted)]">{t("fpQty")} {item.qty}</div>
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-[11px] font-black text-[var(--muted)]">
                        {t("ssReceivedQty")}
                        <input
                          type="number" min={0}
                          placeholder={String(item.qty)}
                          value={receivedDraft[fpo.id]?.[item.productId] ?? ""}
                          onChange={(e) => setReceivedDraft((prev) => ({ ...prev, [fpo.id]: { ...(prev[fpo.id] ?? {}), [item.productId]: e.target.value } }))}
                          className={`h-10 w-24 text-center ${inputCls}`}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => void receiveFpo(fpo)} className={`mt-4 h-10 px-4 uppercase ${btnAction}`}>
                  <CheckCircle2 size={13} /> {t("ssReceive")}
                </button>
              </SectionCard>
            ))
          )}

          {/* Receiving history */}
          <div>
            <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">{t("ssHistory")}</div>
            <DataTable columns={historyCols} rows={fpoHistory} rowKey={(fpo) => fpo.id} minWidth={640} empty={t("fpNoData")} />
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]"><Warehouse size={14} /> {t("ssTabStock")}</div>
          <DataTable columns={stockCols} rows={stock} rowKey={(bucket) => `${bucket.productId}-${bucket.mode}`} minWidth={560} empty={t("fpNoData")} />
        </div>
      )}
    </AppShell>
  );
}
