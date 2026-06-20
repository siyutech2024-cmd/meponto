"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Check, Copy, Gift, Headphones, Home, MapPin, Package, Star, WalletCards, Zap } from "lucide-react";
import { readSession } from "../../lib/session";
import type { MarketplaceOrder, MarketplaceProduct } from "../../lib/points";
import type { MallConfig, TierDefinition } from "../../lib/mall";
import type { MallCoupon } from "../../lib/mall-ops";

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
  expiringPoints?: number;
  badges?: Array<{ at: number; icon: string; label: string; achieved: boolean }>;
  coupons?: MallCoupon[];
};

type Payload = { config: MallConfig; tiers: TierDefinition[]; products: MarketplaceProduct[]; orders: MarketplaceOrder[]; me: Me | null };

const orderStatusLabel: Record<string, string> = { created: "Em trânsito", arrived: "Chegou · retire", fulfilled: "Retirado", cancelled: "Cancelado" };

const tierStars: Record<string, number> = { member: 1, bronze: 2, prata: 3, ouro: 4, diamante: 5 };
const ptTierLabel: Record<string, string> = { member: "Membro", bronze: "Bronze", prata: "Prata", ouro: "Ouro", diamante: "Diamante" };

export default function RiderMallPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyProduct, setBusyProduct] = useState("");
  const [category, setCategory] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState("");

  const copyVoucher = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2500);
    } catch {
      setMessage({ tone: "err", text: "Não foi possível copiar — copie manualmente." });
    }
  }, []);

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
  const categories = useMemo(() => [...new Set(activeProducts.map((p) => p.category || "Outros"))].sort(), [activeProducts]);
  const shownProducts = category ? activeProducts.filter((p) => (p.category || "Outros") === category) : activeProducts;
  const stars = tierStars[me?.tier ?? "member"] ?? 1;

  // Best applicable coupon preview (server re-applies authoritatively at redeem).
  const bestCoupon = (product: MarketplaceProduct): { coupon: MallCoupon; discount: number } | null => {
    const price = Math.ceil(product.pointsPrice * (me?.redeemDiscount ?? 1));
    let best: { coupon: MallCoupon; discount: number } | null = null;
    for (const c of me?.coupons ?? []) {
      if (price < c.minPoints) continue;
      const discount = c.type === "percent_off" ? Math.floor((price * c.value) / 100) : Math.min(c.value, price);
      if (discount > 0 && (!best || discount > best.discount)) best = { coupon: c, discount };
    }
    return best;
  };

  async function cancelOrder(order: MarketplaceOrder) {
    if (!me) return;
    if (!window.confirm(`Cancelar 「${order.productName}」 e devolver ${order.pointsSpent} pts?`)) return;
    setCancelling(order.id);
    const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action: "cancelOrder", orderId: order.id, riderId: me.riderId }) });
    const payload = await response.json().catch(() => ({}));
    setCancelling("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `Falha ao cancelar (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: `Resgate cancelado — ${order.pointsSpent} pts devolvidos.` });
    void load();
  }

  async function redeem(product: MarketplaceProduct) {
    if (!me) {
      // Public storefront: browsing is open, redemption requires an account.
      if (window.confirm("Para resgatar é preciso entrar na sua conta MePonto. Ir para o login?")) {
        window.location.href = "/rider-login?returnTo=/mall";
      }
      return;
    }
    const price = Math.ceil(product.pointsPrice * (me.redeemDiscount ?? 1));
    const cpn = bestCoupon(product);
    const net = price - (cpn?.discount ?? 0);
    const where = product.isVirtual ? "Voucher digital instantâneo" : `Retirada na estação: ${me.station}`;
    const couponLine = cpn ? `\nCupom ${cpn.coupon.title}: −${cpn.discount} pts` : "";
    if (!window.confirm(`Resgatar por ${net} pts: 「${product.name}」?${couponLine}\n${where}`)) return;
    setBusyProduct(product.id);
    const pickupStoreId = (me as { pickupStores?: Array<{ id: string }> }).pickupStores?.[0]?.id;
    const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action: "redeem", productId: product.id, riderId: me.riderId, pickupStoreId }) });
    const payload = await response.json().catch(() => ({}));
    setBusyProduct("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `Falha no resgate (${response.status})` });
      return;
    }
    setMessage({
      tone: "ok",
      text: payload.data.order.voucherCode
        ? `Resgate confirmado! Voucher: ${payload.data.order.voucherCode} — saldo ${payload.data.balance} pts.`
        : `Resgate confirmado! Previsão ${payload.data.order.etaDate} — retire em ${me.station}. Saldo: ${payload.data.balance} pts.`,
    });
    void load();
  }

  return (
    <main className="min-h-screen bg-[#101010] text-[#050505]" style={{ fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f3f2ee] pb-24">
        <header className="flex items-center justify-between px-4 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="grid h-10 w-10 place-items-center rounded-[8px] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"><ArrowLeft size={18} /></Link>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff7a00]">PontoMall</div>
              <h1 className="text-lg font-black leading-5">Loja de Pontos</h1>
            </div>
          </div>
          {me && (
            <div className="rounded-[8px] bg-[#050505] px-3 py-2 text-right text-white">
              <div className="text-[9px] font-black uppercase text-white/50">Saldo</div>
              <div className="text-base font-black leading-5 text-[#ffb238]">{me.balance.toLocaleString("pt-BR")} pts</div>
            </div>
          )}
        </header>

        {message && (
          <div className={`mx-4 mb-2 rounded-[8px] px-3 py-2.5 text-sm font-black ${message.tone === "ok" ? "bg-[#e8f6ee] text-[#20a65a]" : "bg-[#ffe5e3] text-[#e53935]"}`}>
            {message.text}
          </div>
        )}

        {arrivals.length > 0 && (
          <section className="px-4 pb-2">
            <div className="rounded-[8px] bg-[#ff7a00] p-3 text-[#050505]">
              <div className="flex items-center gap-2 text-xs font-black uppercase"><Bell size={14} /> Retirada disponível</div>
              {arrivals.map((order) => (
                <div key={order.id} className="mt-1 text-sm font-black">「{order.productName}」chegou em {order.station}!</div>
              ))}
            </div>
          </section>
        )}

        {/* Personal membership card */}
        <section className="px-4">
          {me ? (
            <div className="relative overflow-hidden rounded-[8px] bg-[linear-gradient(135deg,#1d1202_0%,#9a5b08_58%,#ffb238_100%)] p-4 text-white shadow-[0_18px_42px_rgba(0,0,0,0.22)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-black">{me.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-white/70">
                    <MapPin size={11} /> {me.station} · {me.franchise}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-black" data-i18n-skip>
                    {ptTierLabel[me.tier] ?? me.tierLabel}
                    <span className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} size={10} fill={index < stars ? "currentColor" : "none"} className={index < stars ? "text-[#ffe2a3]" : "opacity-35"} />
                      ))}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-black uppercase text-white/55">Pontos</div>
                  <div className="text-3xl font-black text-[#ffe2a3]">{me.balance.toLocaleString("pt-BR")}</div>
                  <div className="text-[10px] font-bold text-white/55">{me.lifetimeOrders === null ? "Sem pedidos ainda" : `${me.lifetimeOrders} pedidos`}</div>
                </div>
              </div>
              {(me.expiringPoints ?? 0) > 0 && (
                <div className="mt-2 rounded-[8px] bg-black/30 px-2.5 py-1.5 text-[11px] font-black text-[#ffe2a3]">⏳ {me.expiringPoints} pontos expiram em até 30 dias — use antes!</div>
              )}
              {me.badges && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-i18n-skip>
                  {me.badges.map((badge) => (
                    <span key={badge.label} className={`rounded-full px-2 py-0.5 text-[10px] font-black ${badge.achieved ? "bg-white/90 text-[#1d1202]" : "bg-white/10 text-white/40"}`}>
                      {badge.icon} {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[8px] bg-white p-4 text-sm font-bold text-[#77746f] shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
              Bem-vindo ao PontoMall! Navegue à vontade —{" "}
              <Link href="/rider-login" style={{ color: "#ff7a00" }} className="font-black underline">entre ou crie sua conta</Link>{" "}
              quando quiser resgatar produtos com pontos.
            </div>
          )}
        </section>

        {/* Invite friends — prominent */}
        {me && (
          <section id="invite" className="px-4 pt-3">
            <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-[8px] bg-[#ff7a00] p-3 text-[#050505] shadow-[0_12px_26px_rgba(255,122,0,0.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=${encodeURIComponent(`https://app.meponto.com/scan?ref=${me.riderId}`)}`}
                alt="QR de convite"
                width={88}
                height={88}
                className="rounded-[8px] bg-white p-1"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-black"><Gift size={15} /> Convide amigos = +{data?.config.referralPoints ?? 20} pts</div>
                <p className="mt-1 text-[11px] font-bold leading-4 text-black/70">
                  Seu amigo escaneia este QR, cria a conta, e você ganha os pontos após o primeiro pedido dele. Código: {me.riderId}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Category filter + products */}
        <section className="px-4 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-black">Produtos</h2>
            <span className="text-xs font-black text-[#77746f]">{shownProducts.length} itens</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button type="button" onClick={() => setCategory("")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${!category ? "bg-[#050505] text-white" : "bg-white text-[#77746f]"}`}>Tudo</button>
            {categories.map((cat) => (
              <button key={cat} type="button" onClick={() => setCategory(cat === category ? "" : cat)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${category === cat ? "bg-[#050505] text-white" : "bg-white text-[#77746f]"}`}>{cat}</button>
            ))}
          </div>

          {shownProducts.length === 0 && <div className="rounded-[8px] bg-white p-6 text-center text-sm font-bold text-[#77746f]">Produtos em breve. Aguarde!</div>}

          <div className="grid grid-cols-2 gap-2.5">
            {shownProducts.map((product) => {
              const price = me ? Math.ceil(product.pointsPrice * (me.redeemDiscount ?? 1)) : product.pointsPrice;
              const cpn = me ? bestCoupon(product) : null;
              const netPrice = price - (cpn?.discount ?? 0);
              return (
                <div key={product.id} className="flex flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
                  <div className="relative h-28 w-full bg-[#f3f2ee]">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[#ff7a00]">{product.isVirtual ? <Zap size={32} /> : <Package size={32} />}</div>
                    )}
                    {product.isVirtual && <span className="absolute right-1.5 top-1.5 rounded-full bg-[#ff7a00] px-2 py-0.5 text-[9px] font-black uppercase text-[#050505]">Instantâneo</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <div className="text-[13px] font-black leading-4">{product.name}</div>
                    <div className="text-[10px] font-bold text-[#77746f]">
                      {product.isVirtual ? "Entrega imediata" : `≈ ${product.deliveryCycleDays ?? 7} dias`} · Estoque {product.stock}
                    </div>
                    {cpn && <span className="w-fit rounded-full bg-[#e8f6ee] px-2 py-0.5 text-[9px] font-black text-[#20a65a]">🎟️ {cpn.coupon.title} −{cpn.discount}</span>}
                    <button
                      type="button"
                      disabled={busyProduct === product.id || product.stock <= 0}
                      onClick={() => void redeem(product)}
                      className="mt-auto h-9 rounded-[8px] bg-[#050505] text-xs font-black text-white disabled:opacity-40"
                    >
                      {netPrice !== product.pointsPrice ? <><s className="opacity-55">{product.pointsPrice}</s> {netPrice} pts</> : `${product.pointsPrice} pts`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* My redemptions */}
        {myOrders.length > 0 && (
          <section className="px-4 pt-4">
            <h2 className="mb-2 text-lg font-black">Meus resgates</h2>
            <div className="grid gap-2">
              {myOrders.map((order) => (
                <div key={order.id} className="rounded-[8px] bg-white p-3 shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-black">{order.productName}</div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${order.reviewStatus === "pending" ? "bg-[#fff4cf] text-[#9a7400]" : order.status === "arrived" ? "bg-[#ff7a00] text-[#050505]" : order.status === "fulfilled" ? "bg-[#e8f6ee] text-[#20a65a]" : "bg-[#f3f2ee] text-[#77746f]"}`}>
                      {order.reviewStatus === "pending" ? "Em análise" : orderStatusLabel[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-[#77746f]">
                    {order.pointsSpent} pts{order.status === "created" && order.etaDate && ` · previsão ${order.etaDate}`}{!order.voucherCode && ` · ${order.station}`}
                  </div>
                  {order.voucherCode && (
                    <button
                      type="button"
                      onClick={() => void copyVoucher(order.voucherCode!)}
                      title="Toque para copiar"
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#fff1e0] px-3 py-1.5 font-mono text-sm font-black text-[#ff7a00]"
                      data-i18n-skip
                    >
                      {order.voucherCode}
                      {copiedCode === order.voucherCode ? <Check size={14} className="text-[#20a65a]" /> : <Copy size={14} className="opacity-50" />}
                    </button>
                  )}
                  {order.status === "created" && !order.voucherCode && (
                    <button
                      type="button"
                      disabled={cancelling === order.id}
                      onClick={() => void cancelOrder(order)}
                      className="mt-2 w-full rounded-[8px] border border-[#e9e7e1] px-3 py-1.5 text-xs font-black text-[#77746f] disabled:opacity-45"
                    >
                      {cancelling === order.id ? "Cancelando..." : "Cancelar e devolver pontos"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <nav className="fixed bottom-3 left-1/2 z-20 grid w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 grid-cols-4 rounded-[8px] bg-[#050505] p-1.5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
          <MallTab icon={<Home size={18} />} label="Inicio" href="/" />
          <MallTab icon={<WalletCards size={18} />} label="Carteira" href="/wallet" />
          <MallTab icon={<Gift size={18} />} label="Loja" href="/mall" active />
          <MallTab icon={<Headphones size={18} />} label="Ajuda" href="/support" />
        </nav>
      </div>
    </main>
  );
}

function MallTab({ icon, label, href, active = false }: { icon: React.ReactNode; label: string; href: string; active?: boolean }) {
  return (
    <a href={href} style={{ color: active ? "#050505" : "rgba(255,255,255,0.65)" }} className={`flex flex-col items-center gap-1 rounded-[8px] py-2 text-[10px] font-black ${active ? "bg-[#ff7a00]" : ""}`}>
      {icon}
      {label}
    </a>
  );
}
