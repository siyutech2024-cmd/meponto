"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Award, Bell, CircleDollarSign, Gift, MapPin, QrCode } from "lucide-react";
import { readSession } from "../../lib/session";
import type { MarketplaceOrder, MarketplaceProduct } from "../../lib/points";
import type { MallConfig, TierDefinition } from "../../lib/mall";

type Me = {
  riderId: string;
  name: string;
  station: string;
  franchise: string;
  balance: number;
  lifetimeOrders: number | null;
  tier: string;
  tierLabel: string;
  redeemDiscount: number;
  perks: string[];
};

type Payload = { config: MallConfig; tiers: TierDefinition[]; products: MarketplaceProduct[]; orders: MarketplaceOrder[]; me: Me | null };

const orderStatusLabel: Record<string, string> = { created: "在途", arrived: "已到站 · 请取货", fulfilled: "已取货", cancelled: "已取消" };

export default function RiderMallPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyProduct, setBusyProduct] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (session?.name) params.set("riderName", session.name);
    const response = await fetch(`/api/mall?${params}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setData(payload.data);
  }, [headers, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const me = data?.me ?? null;
  const myOrders = (data?.orders ?? []).filter((order) => me && order.riderId === me.riderId);
  const arrivals = myOrders.filter((order) => order.status === "arrived");
  const activeProducts = (data?.products ?? []).filter((product) => product.status === "active");

  async function redeem(product: MarketplaceProduct) {
    if (!me) {
      setMessage({ tone: "err", text: "未找到你的骑手档案，请联系站长建档后再兑换。" });
      return;
    }
    const price = Math.ceil(product.pointsPrice * (me.redeemDiscount ?? 1));
    if (!window.confirm(`用 ${price} 分兑换「${product.name}」？\n领取站点：${me.station}（仅限所属站点领取）`)) return;
    setBusyProduct(product.id);
    const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action: "redeem", productId: product.id, riderId: me.riderId }) });
    const payload = await response.json().catch(() => ({}));
    setBusyProduct("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `兑换失败 (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: `兑换成功！请于预计 ${payload.data.order.etaDate} 后到 ${me.station} 领取（到货会提醒你）。余额 ${payload.data.balance} 分。` });
    void load();
  }

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> 返回</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><Gift size={18} className="text-[var(--accent)]" /> 积分商城</h1>
      </div>

      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {arrivals.length > 0 && (
        <div className="panel border-[var(--accent)] p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Bell size={14} /> 取货提醒</div>
          {arrivals.map((order) => (
            <div key={order.id} className="mt-2 text-sm font-black">
              「{order.productName}」已到 {order.station}，请尽快领取！
            </div>
          ))}
        </div>
      )}

      {me ? (
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-black"><Award size={15} className="text-[var(--accent)]" /> {me.tierLabel}</div>
              <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                {me.lifetimeOrders === null ? "完成 Eastwind 完单后升级为等级会员" : `累计完单 ${me.lifetimeOrders} 单`}
                ｜ 领取站点 {me.station}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">积分余额</div>
              <div className="text-2xl font-black text-[var(--accent)]">{me.balance}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] font-bold text-[var(--muted-strong)]">{me.perks.join("｜")}</div>
          <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[var(--muted)]">
            <QrCode size={12} /> 邀请码：{me.riderId}（邀请骑手注册成功 +{data?.config.referralPoints ?? 20} 分）
          </div>
        </div>
      ) : (
        <div className="panel p-4 text-sm font-bold text-[var(--muted)]">未找到骑手档案——注册即可成为会员并开始兑换。</div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-black uppercase text-[var(--muted)]">可兑换商品</div>
        {activeProducts.length === 0 && <div className="panel p-5 text-center text-sm font-bold text-[var(--muted)]">商品上架中，敬请期待。</div>}
        {activeProducts.map((product) => {
          const price = me ? Math.ceil(product.pointsPrice * (me.redeemDiscount ?? 1)) : product.pointsPrice;
          return (
            <div key={product.id} className="panel flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-black">{product.name}</div>
                <div className="text-[11px] font-bold text-[var(--muted)]">
                  {product.supplierName && `${product.supplierName} ｜ `}约 {product.deliveryCycleDays ?? 7} 天到站 ｜ 库存 {product.stock}
                </div>
                {product.description && <div className="mt-1 text-[11px] font-bold text-[var(--muted-strong)]">{product.description}</div>}
              </div>
              <button
                type="button"
                disabled={busyProduct === product.id || product.stock <= 0}
                onClick={() => void redeem(product)}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
              >
                <CircleDollarSign size={13} />
                {price !== product.pointsPrice ? (
                  <>
                    <s className="opacity-60">{product.pointsPrice}</s> {price} 分
                  </>
                ) : (
                  `${product.pointsPrice} 分`
                )}
              </button>
            </div>
          );
        })}
      </div>

      {myOrders.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">我的兑换</div>
          <div className="space-y-2">
            {myOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-2 text-sm font-bold">
                <div>
                  {order.productName}
                  <div className="text-[11px] text-[var(--muted)]">
                    <MapPin size={10} className="inline" /> {order.station} ｜ {order.pointsSpent} 分
                    {order.status === "created" && order.etaDate && ` ｜ 预计 ${order.etaDate}`}
                  </div>
                </div>
                <span className={`tag ${order.status === "arrived" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}>{orderStatusLabel[order.status] ?? order.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
