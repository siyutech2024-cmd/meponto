"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RefreshCcw, Search, Truck, UserRound } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { MarketplaceOrder } from "../../lib/points";
import { useVentoStore } from "../../lib/store";
import { translate, type TranslationKey } from "../../lib/i18n";

const statusKey: Record<string, TranslationKey> = { created: "msStCreated", arrived: "msStArrived", fulfilled: "msStFulfilled", cancelled: "msStCancelled" };

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

  const load = useCallback(async () => {
    const response = await fetch(`/api/mall?station=${encodeURIComponent(station)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setOrders(payload.data.orders);
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

  const emptyLabel = (hadAny: boolean) => (q && hadAny ? t("msNoMatch") : t("msNoOrders"));

  const reviewBadge = (order: MarketplaceOrder) => (
    <Badge value={order.reviewStatus === "pending" ? t("dpPendingHq") : (statusKey[order.status] ? t(statusKey[order.status]) : order.status)} />
  );

  const actionButton = (order: MarketplaceOrder, action: "markArrived" | "markPickedUp", label: string, okText: string) =>
    order.reviewStatus === "pending" ? (
      <div className="mt-2 text-[11px] font-black text-[var(--warn)]">{t("msHighValue")}</div>
    ) : (
      <button
        type="button"
        onClick={() => void act(action, order.id, okText)}
        className="mt-2 inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]"
      >
        <CheckCircle2 size={13} /> {label}
      </button>
    );

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

      {/* Top stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {([
          [t("msStatArrivedToday"), statArrived],
          [t("msStatTransit"), statTransit],
          [t("msStatDoneToday"), statDoneToday],
        ] as const).map(([label, value]) => (
          <div key={label} className="panel p-4">
            <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
            <div className="mt-1 text-2xl font-black">{value}</div>
          </div>
        ))}
      </div>

      {/* Rider / order search */}
      <div className="panel mb-4 flex items-center gap-2 p-3">
        <Search size={14} className="shrink-0 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("msSearchPh")}
          className="h-9 w-full max-w-md rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's pickup queue, grouped by rider */}
        <div className="panel p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><PackageCheck size={14} /> {t("msSecPickup")}（{arrived.length}）</div>
          {arrived.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">{emptyLabel(statArrived > 0)}</div>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
              {pickupByRider.map(([rider, list]) => (
                <div key={rider} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <UserRound size={14} className="text-[var(--accent)]" />
                    <span className="text-sm font-black">{rider}</span>
                    <span className="tag">{t("msGroupOrders", { n: list.length })}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((order) => (
                      <div key={order.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <div className="flex items-center justify-between gap-2 text-sm font-black">
                          {order.productName ?? order.productId}
                          {reviewBadge(order)}
                        </div>
                        <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                          {order.id} ｜ {t("msOrderLine", { rider: order.riderName, points: order.pointsSpent, date: order.createdAt })}
                          {order.arrivedAt && t("msArrivedAt", { x: order.arrivedAt })}
                        </div>
                        {actionButton(order, "markPickedUp", t("msBtnPicked"), t("msOkPicked"))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* In transit (ETA) */}
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Truck size={14} /> {t("msColTransit")}（{inTransit.length}）</div>
            {inTransit.length === 0 ? (
              <div className="text-sm font-bold text-[var(--muted)]">{emptyLabel(statTransit > 0)}</div>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                {inTransit.map((order) => (
                  <div key={order.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between gap-2 text-sm font-black">
                      {order.productName ?? order.productId}
                      {reviewBadge(order)}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                      {order.id} ｜ {t("msOrderLine", { rider: order.riderName, points: order.pointsSpent, date: order.createdAt })}
                      {order.etaDate && t("msEta", { x: order.etaDate })}
                    </div>
                    {actionButton(order, "markArrived", t("msBtnArrived"), t("msOkArrived"))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivered today (read-only) */}
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><CheckCircle2 size={14} /> {t("msStatDoneToday")}（{doneToday.length}）</div>
            {doneToday.length === 0 ? (
              <div className="text-sm font-bold text-[var(--muted)]">{emptyLabel(statDoneToday > 0)}</div>
            ) : (
              <div className="max-h-[280px] space-y-2 overflow-auto pr-1">
                {doneToday.map((order) => (
                  <div key={order.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between gap-2 text-sm font-black">
                      {order.productName ?? order.productId}
                      {reviewBadge(order)}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                      {order.id} ｜ {t("msOrderLine", { rider: order.riderName, points: order.pointsSpent, date: order.createdAt })}
                      {order.pickedUpAt && t("msPickedAt", { x: order.pickedUpAt })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
