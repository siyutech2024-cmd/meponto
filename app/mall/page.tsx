"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CircleDollarSign, Package, RefreshCcw, Settings2, Truck } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import type { MarketplaceOrder, MarketplaceProduct } from "../lib/points";
import type { MallConfig, TierDefinition } from "../lib/mall";

type Payload = {
  config: MallConfig;
  tiers: TierDefinition[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
};

const orderStatusLabel: Record<string, string> = { created: "在途", arrived: "已到站", fulfilled: "已取货", cancelled: "已取消" };
const productStatusLabel: Record<string, string> = { active: "已上架", paused: "已下架", pending_pricing: "待定价" };

export default function MallAdminPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { points: string; margin: string }>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/mall", { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setData(payload.data);
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `请求失败 (${response.status})` });
      return null;
    }
    void load();
    return payload.data;
  }

  const input = "h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";
  const config = data?.config;

  return (
    <AppShell>
      <PageTitle
        title="积分商城管理"
        eyebrow="PontoMall · 规则 · 定价 · 兑换订单"
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="panel space-y-3 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Settings2 size={14} /> 积分规则（可修改）</div>
            {config && (
              <>
                {([
                  ["perOrderPoints", "每完单积分"],
                  ["referralPoints", "邀请骑手注册奖励"],
                  ["partnerServicePoints", "Partner 服务奖励"],
                  ["partnerServiceCount", "Partner 服务次数门槛"],
                ] as const).map(([field, label]) => (
                  <label key={field} className="flex items-center justify-between gap-2 text-xs font-black text-[var(--muted-strong)]">
                    {label}
                    <input
                      inputMode="numeric"
                      className={`${input} w-24 text-center`}
                      value={configDraft[field] ?? String(config[field])}
                      onChange={(e) => setConfigDraft({ ...configDraft, [field]: e.target.value.replace(/\D/g, "") })}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    const result = await post({ action: "setConfig", ...Object.fromEntries(Object.entries(configDraft).map(([key, value]) => [key, Number(value)])) });
                    if (result) setMessage({ tone: "ok", text: "积分规则已更新。" });
                  }}
                  className="h-10 w-full rounded-[8px] bg-[var(--accent)] text-xs font-black uppercase text-[var(--accent-ink)]"
                >
                  保存规则
                </button>
              </>
            )}
          </div>

          <div className="panel space-y-2 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Award size={14} /> 会员等级权益</div>
            {data?.tiers.map((tier) => (
              <div key={tier.tier} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                <div className="flex items-center justify-between text-sm font-black">
                  {tier.label}
                  <span className="text-[10px] font-bold text-[var(--muted)]">
                    {tier.minOrders === null ? "注册即得" : `累计完单 ≥ ${tier.minOrders}（Eastwind 数据）`}
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                  积分 ×{tier.pointsMultiplier} ｜ 兑换 {tier.redeemDiscount < 1 ? `${Math.round(tier.redeemDiscount * 100)}折` : "原价"}
                  {tier.birthdayPoints > 0 && ` ｜ 生日 ${tier.birthdayPoints} 分`}
                </div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted-strong)]">{tier.perks.join("｜")}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Package size={14} /> 商品与定价（供应价 → 定积分价/分成）</div>
            {(data?.products ?? []).length === 0 ? (
              <div className="text-sm font-bold text-[var(--muted)]">还没有商品。供应商可在供应商后台上传。</div>
            ) : (
              <div className="space-y-2">
                {data?.products.map((product) => {
                  const draft = priceDrafts[product.id] ?? { points: String(product.pointsPrice || ""), margin: String(product.marginPct ?? "") };
                  return (
                    <div key={product.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-black">
                            {product.name}
                            <Badge value={productStatusLabel[product.status] ?? product.status} />
                          </div>
                          <div className="text-[11px] font-bold text-[var(--muted)]">
                            {product.supplierName ?? "平台自营"} ｜ 供应价 {product.supplyPrice ? `R$${product.supplyPrice}` : "-"} ｜ 周期 {product.deliveryCycleDays ?? 7} 天 ｜ 库存 {product.stock}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            inputMode="numeric"
                            placeholder="积分价"
                            className={`${input} w-24 text-center`}
                            value={draft.points}
                            onChange={(e) => setPriceDrafts({ ...priceDrafts, [product.id]: { ...draft, points: e.target.value.replace(/\D/g, "") } })}
                          />
                          <input
                            inputMode="numeric"
                            placeholder="分成%"
                            className={`${input} w-20 text-center`}
                            value={draft.margin}
                            onChange={(e) => setPriceDrafts({ ...priceDrafts, [product.id]: { ...draft, margin: e.target.value.replace(/[^\d.]/g, "") } })}
                          />
                          <button
                            type="button"
                            className="tag"
                            onClick={async () => {
                              const result = await post({ action: "priceProduct", productId: product.id, pointsPrice: Number(draft.points), marginPct: Number(draft.margin), status: "active" });
                              if (result) setMessage({ tone: "ok", text: `${product.name} 已定价并上架。` });
                            }}
                          >
                            定价上架
                          </button>
                          {product.status === "active" && (
                            <button type="button" className="tag" onClick={async () => { const r = await post({ action: "priceProduct", productId: product.id, pointsPrice: product.pointsPrice, status: "paused" }); if (r) setMessage({ tone: "ok", text: "已下架。" }); }}>下架</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Truck size={14} /> 兑换订单（全网）</div>
            {(data?.orders ?? []).length === 0 ? (
              <div className="text-sm font-bold text-[var(--muted)]">暂无兑换订单。</div>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                {data?.orders.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-sm">
                    <div>
                      <span className="font-black">{order.productName ?? order.productId}</span>
                      <span className="ml-2 text-[11px] font-bold text-[var(--muted)]">
                        {order.riderName} ｜ {order.station}（{order.franchise}）｜ <CircleDollarSign size={11} className="inline" /> {order.pointsSpent} 分 ｜ 预计 {order.etaDate ?? "-"}
                      </span>
                    </div>
                    <Badge value={orderStatusLabel[order.status] ?? order.status} />
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
