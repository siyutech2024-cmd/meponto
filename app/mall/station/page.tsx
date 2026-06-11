"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RefreshCcw } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { MarketplaceOrder } from "../../lib/points";

const statusLabel: Record<string, string> = { created: "在途", arrived: "已到站待取", fulfilled: "已取货", cancelled: "已取消" };

export default function MallStationPage() {
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
      setMessage({ tone: "err", text: payload.error ?? `操作失败 (${response.status})` });
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
        title="商城到货管理"
        eyebrow={`站点工作台 · ${station}`}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {([
          ["在途（确认到货）", inTransit, "markArrived", "确认到货", "已确认到货，骑手将收到取货提醒。"],
          ["待取货（确认领取）", arrived, "markPickedUp", "确认已领取", "已确认骑手领取。"],
          ["已完成", done, null, "", ""],
        ] as const).map(([title, list, action, buttonLabel, okText]) => (
          <div key={title} className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><PackageCheck size={14} /> {title}（{list.length}）</div>
            {list.length === 0 ? (
              <div className="text-sm font-bold text-[var(--muted)]">暂无订单。</div>
            ) : (
              <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                {list.map((order) => (
                  <div key={order.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between gap-2 text-sm font-black">
                      {order.productName ?? order.productId}
                      <Badge value={statusLabel[order.status] ?? order.status} />
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                      {order.riderName} ｜ {order.pointsSpent} 分 ｜ 兑换 {order.createdAt}
                      {order.etaDate && ` ｜ 预计 ${order.etaDate}`}
                      {order.arrivedAt && ` ｜ 到站 ${order.arrivedAt}`}
                      {order.pickedUpAt && ` ｜ 领取 ${order.pickedUpAt}`}
                    </div>
                    {action && (
                      <button
                        type="button"
                        onClick={() => void act(action, order.id, okText)}
                        className="mt-2 inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]"
                      >
                        <CheckCircle2 size={13} /> {buttonLabel}
                      </button>
                    )}
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
