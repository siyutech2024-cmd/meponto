"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RefreshCcw } from "lucide-react";
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

  const inTransit = orders.filter((order) => order.status === "created");
  const arrived = orders.filter((order) => order.status === "arrived");
  const done = orders.filter((order) => order.status === "fulfilled");

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
    </AppShell>
  );
}
