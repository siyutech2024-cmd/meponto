"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock, Gift, LogIn, MapPin, Package, Search, Sparkles, Star, Wallet, X } from "lucide-react";
import type { MarketplaceOrder, MarketplaceProduct } from "../lib/points";
import type { MallBanner, MallCategory } from "../lib/mall-ops";

/**
 * PontoMall public storefront (mall.meponto.com) — responsive PC + mobile.
 * Anyone can browse; redeeming requires a rider session (cookie shared on
 * .meponto.com). Hybrid products collect a PIX cash difference that the
 * rider settles by transfer + receipt reference.
 */

type Me = {
  riderId: string;
  name: string;
  station: string;
  balance: number;
  tierLabel: string;
  redeemDiscount: number;
};

type Payload = {
  pixKey?: string;
  categories?: MallCategory[];
  banners?: MallBanner[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  me: Me | null;
};

const GOLD = "#f5b301";
const INK = "#19202c";
const statusLabel: Record<string, string> = { created: "Em trânsito", arrived: "Chegou · retire", fulfilled: "Retirado", cancelled: "Cancelado" };

const categoryEmoji: Record<string, string> = {
  Equipamento: "🛵", Equipamentos: "🛵", Voucher: "🎟️", Vouchers: "🎟️", Serviço: "🛠️", Servicos: "🛠️", Serviços: "🛠️", Outros: "🎁",
};

function ProductImage({ product, big = false }: { product: MarketplaceProduct; big?: boolean }) {
  if (product.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.imageUrl} alt={product.name} className={`h-full w-full object-cover ${big ? "" : "transition-transform duration-500 group-hover:scale-105"}`} />;
  }
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: "linear-gradient(135deg, #fff7df, #ffe9a8)" }}>
      <span className={big ? "text-7xl" : "text-5xl"}>{categoryEmoji[product.category || "Outros"] ?? "🎁"}</span>
    </div>
  );
}

export default function StorefrontPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [riderName, setRiderName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<MarketplaceProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<MarketplaceOrder | null>(null);
  const [payRef, setPayRef] = useState("");
  const [bannerIndex, setBannerIndex] = useState(0);

  const load = useCallback(async (name: string | null) => {
    const params = new URLSearchParams();
    if (name) params.set("riderName", name);
    const response = await fetch(`/api/mall?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setData(payload.data as Payload);
  }, []);

  useEffect(() => {
    void (async () => {
      let name: string | null = null;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (payload?.user?.portal === "rider" && payload.user.name) name = payload.user.name as string;
      } catch {
        /* browsing anonymously is fine */
      }
      setRiderName(name);
      await load(name);
    })();
  }, [load]);

  const banners = (data?.banners ?? []).filter((banner) => banner.active);
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => setBannerIndex((index) => (index + 1) % banners.length), 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const me = data?.me ?? null;
  const products = useMemo(() => {
    const active = (data?.products ?? []).filter((product) => product.status === "active");
    const term = query.trim().toLowerCase();
    return active
      .filter((product) => !category || (product.category || "Outros") === category)
      .filter((product) => !term || product.name.toLowerCase().includes(term) || (product.description ?? "").toLowerCase().includes(term));
  }, [data, query, category]);

  const categories = useMemo(() => {
    const fromConfig = (data?.categories ?? []).map((item) => item.name);
    const fromProducts = [...new Set((data?.products ?? []).filter((p) => p.status === "active").map((product) => product.category || "Outros"))];
    return [...new Set([...fromConfig, ...fromProducts])];
  }, [data]);

  const myOrders = useMemo(() => (me ? (data?.orders ?? []).filter((order) => order.riderId === me.riderId) : []), [data, me]);
  const actionNeeded = myOrders.filter((order) => order.status === "arrived" || (order.paymentStatus && order.paymentStatus !== "paid")).length;

  const priceFor = (product: MarketplaceProduct) => Math.ceil(product.pointsPrice * (me?.redeemDiscount ?? 1));

  async function redeem(product: MarketplaceProduct) {
    if (!me) {
      window.location.href = "https://app.meponto.com/rider-login";
      return;
    }
    setBusy(true);
    const response = await fetch("/api/mall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", productId: product.id, riderId: me.riderId }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setDetail(null);
    await load(riderName);
    const order = payload.data?.order as MarketplaceOrder | undefined;
    if (order?.cashDue) {
      setPayOrder(order);
      setPayRef("");
    } else if (order?.voucherCode) {
      setToast({ tone: "ok", text: `Resgatado! Seu código: ${order.voucherCode}` });
    } else {
      setToast({ tone: "ok", text: `Resgatado! Retire em ${order?.station ?? "seu ponto"} a partir de ${order?.etaDate ?? "breve"}.` });
    }
  }

  async function submitPaymentRef() {
    if (!payOrder || !payRef.trim()) return;
    setBusy(true);
    const response = await fetch("/api/mall/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPaymentRef", orderId: payOrder.id, reference: payRef.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setPayOrder(null);
    setToast({ tone: "ok", text: "Comprovante enviado! Vamos confirmar o pagamento em breve." });
    await load(riderName);
  }

  const pixKey = data?.pixKey || "";

  return (
    <main data-i18n-skip className="min-h-screen" style={{ background: "#f6f7f9", color: INK, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ---- Header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:gap-6 md:px-8">
          <a href="/" className="flex shrink-0 items-baseline gap-0.5 text-xl font-black tracking-tight">
            <span>Ponto</span>
            <span className="rounded-md px-1.5 py-0.5" style={{ background: GOLD }}>Mall</span>
          </a>
          <div className="relative hidden flex-1 md:block">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar produtos, vouchers, serviços..."
              className="h-11 w-full rounded-full border border-black/10 bg-[#f2f3f5] pl-10 pr-4 text-sm font-medium outline-none transition-colors focus:border-[#f5b301] focus:bg-white"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {me ? (
              <>
                <button
                  type="button"
                  onClick={() => setOrdersOpen(true)}
                  className="relative inline-flex h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-bold transition-colors hover:border-[#f5b301]"
                >
                  <Package size={15} />
                  <span className="hidden sm:inline">Meus resgates</span>
                  {actionNeeded > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: "#e2554d" }}>
                      {actionNeeded}
                    </span>
                  )}
                </button>
                <div className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-black" style={{ background: "#fff4cf" }}>
                  <Wallet size={15} style={{ color: "#9a7400" }} />
                  {me.balance.toLocaleString("pt-BR")} pts
                </div>
              </>
            ) : (
              <a
                href="https://app.meponto.com/rider-login"
                className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-black transition-transform hover:scale-105"
                style={{ background: INK, color: "#fff" }}
              >
                <LogIn size={15} /> Entrar
              </a>
            )}
          </div>
        </div>
        {/* mobile search */}
        <div className="px-4 pb-3 md:hidden">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar produtos..."
              className="h-10 w-full rounded-full border border-black/10 bg-[#f2f3f5] pl-10 pr-4 text-sm font-medium outline-none focus:border-[#f5b301] focus:bg-white"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
        {/* ---- Hero banner ---------------------------------------------------- */}
        <section className="relative mt-4 overflow-hidden rounded-3xl md:mt-6" style={{ background: `linear-gradient(115deg, ${INK} 38%, #2c3648 75%, #3b475e)` }}>
          {banners.length > 0 ? (
            <a href={banners[bannerIndex]?.href || "#"} className="block">
              {banners[bannerIndex]?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={banners[bannerIndex].imageUrl} alt={banners[bannerIndex].title} className="h-44 w-full object-cover md:h-72" />
              ) : (
                <div className="flex h-44 items-center px-8 md:h-72 md:px-14">
                  <h2 className="max-w-xl text-2xl font-black text-white md:text-4xl">{banners[bannerIndex]?.title}</h2>
                </div>
              )}
            </a>
          ) : (
            <div className="relative flex h-48 items-center px-7 md:h-72 md:px-14">
              <div className="relative z-10 max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]" style={{ background: GOLD, color: INK }}>
                  <Sparkles size={12} /> Programa de benefícios MePonto
                </div>
                <h1 className="text-2xl font-black leading-tight text-white md:text-5xl">
                  Cada entrega <span style={{ color: GOLD }}>vira benefício</span>
                </h1>
                <p className="mt-2 hidden max-w-lg text-sm font-medium text-white/65 md:block md:text-base">
                  Troque pontos por equipamentos, vouchers e serviços — e retire no seu ponto de apoio.
                </p>
              </div>
              <Gift className="absolute -right-6 bottom-0 hidden h-44 w-44 text-white/10 md:block" />
            </div>
          )}
          {banners.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {banners.map((banner, index) => (
                <button key={banner.id} type="button" onClick={() => setBannerIndex(index)} className="h-1.5 rounded-full transition-all" style={{ width: index === bannerIndex ? 22 : 8, background: index === bannerIndex ? GOLD : "rgba(255,255,255,.4)" }} />
              ))}
            </div>
          )}
        </section>

        {/* ---- Member strip ---------------------------------------------------- */}
        {me && (
          <section className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-black/5 bg-white px-5 py-3 text-sm font-bold">
            <span className="inline-flex items-center gap-1.5"><Star size={14} style={{ color: GOLD }} /> {me.name} · {me.tierLabel}</span>
            <span className="inline-flex items-center gap-1.5 text-black/55"><MapPin size={14} /> Retirada: {me.station}</span>
            {me.redeemDiscount < 1 && <span className="rounded-full px-2.5 py-0.5 text-xs font-black" style={{ background: "#e8f6ec", color: "#1d7a3e" }}>Desconto de membro: {Math.round((1 - me.redeemDiscount) * 100)}%</span>}
          </section>
        )}

        {/* ---- Categories ------------------------------------------------------ */}
        <nav className="scrollbar-none mt-5 flex gap-2 overflow-x-auto pb-1">
          {["", ...categories].map((name) => (
            <button
              key={name || "all"}
              type="button"
              onClick={() => setCategory(name)}
              className="shrink-0 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors"
              style={category === name ? { background: INK, color: "#fff", borderColor: INK } : { background: "#fff", borderColor: "rgba(0,0,0,.1)", color: "rgba(0,0,0,.65)" }}
            >
              {name === "" ? "Tudo" : `${categoryEmoji[name] ?? "🎁"} ${name}`}
            </button>
          ))}
        </nav>

        {/* ---- Product grid ----------------------------------------------------- */}
        {products.length === 0 ? (
          <div className="mt-16 text-center text-sm font-bold text-black/40">Nenhum produto encontrado.</div>
        ) : (
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => {
              const price = priceFor(product);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setDetail(product)}
                  className="group overflow-hidden rounded-2xl border border-black/5 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <ProductImage product={product} />
                    {product.isVirtual && <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black/60">Voucher digital</span>}
                    {product.stock <= 3 && product.stock > 0 && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: "#e2554d" }}>Últimas {product.stock}</span>}
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="line-clamp-2 min-h-10 text-[13px] font-bold leading-5 md:text-sm">{product.name}</div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-lg font-black md:text-xl" style={{ color: "#9a7400" }}>{price.toLocaleString("pt-BR")}</span>
                      <span className="text-[11px] font-black uppercase text-black/40">pts</span>
                      {(product.cashPriceBRL ?? 0) > 0 && <span className="text-[11px] font-black text-black/55">+ R$ {product.cashPriceBRL?.toFixed(2)}</span>}
                    </div>
                    {me && product.pointsPrice !== price && <div className="text-[10px] font-bold text-black/35 line-through">{product.pointsPrice.toLocaleString("pt-BR")} pts</div>}
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {/* ---- Footer ----------------------------------------------------------- */}
        <footer className="mt-16 border-t border-black/10 pt-6 text-center text-xs font-bold text-black/40">
          PontoMall · MePonto — Conectar · Apoiar · Entregar ·{" "}
          <a href="https://www.meponto.com" className="underline hover:text-black/70">meponto.com</a>
        </footer>
      </div>

      {/* ---- Product detail modal ------------------------------------------------ */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={() => setDetail(null)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="grid md:grid-cols-2">
              <div className="relative aspect-square md:aspect-auto md:min-h-[380px]">
                <ProductImage product={detail} big />
                <button type="button" onClick={() => setDetail(null)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow md:hidden"><X size={16} /></button>
              </div>
              <div className="flex flex-col p-5 md:p-7">
                <div className="hidden justify-end md:flex">
                  <button type="button" onClick={() => setDetail(null)} className="grid h-9 w-9 place-items-center rounded-full bg-black/5 transition-colors hover:bg-black/10"><X size={16} /></button>
                </div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-black/40">{detail.category || "Outros"}</div>
                <h2 className="mt-1 text-xl font-black leading-snug md:text-2xl">{detail.name}</h2>
                {detail.description && <p className="mt-3 text-sm font-medium leading-6 text-black/60">{detail.description}</p>}
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-black/55">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1"><Package size={12} /> Estoque: {detail.stock}</span>
                  {!detail.isVirtual && <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1"><Clock size={12} /> Chega em ~{detail.deliveryCycleDays ?? 7} dias</span>}
                  {!detail.isVirtual && <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1"><MapPin size={12} /> Retirada no seu ponto</span>}
                  {detail.isVirtual && <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1"><Sparkles size={12} /> Código instantâneo</span>}
                </div>
                <div className="mt-auto pt-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black" style={{ color: "#9a7400" }}>{priceFor(detail).toLocaleString("pt-BR")}</span>
                    <span className="text-xs font-black uppercase text-black/40">pts</span>
                    {(detail.cashPriceBRL ?? 0) > 0 && <span className="text-sm font-black text-black/65">+ R$ {detail.cashPriceBRL?.toFixed(2)} via PIX</span>}
                  </div>
                  {me && <div className="mt-1 text-xs font-bold text-black/45">Seu saldo: {me.balance.toLocaleString("pt-BR")} pts</div>}
                  <button
                    type="button"
                    disabled={busy || detail.stock <= 0 || (!!me && me.balance < priceFor(detail))}
                    onClick={() => void redeem(detail)}
                    className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black uppercase tracking-wide transition-transform hover:scale-[1.02] disabled:opacity-45"
                    style={{ background: GOLD, color: INK }}
                  >
                    {detail.stock <= 0 ? "Esgotado" : me ? (me.balance < priceFor(detail) ? "Pontos insuficientes" : "Resgatar agora") : "Entrar para resgatar"}
                    {detail.stock > 0 && (!me || me.balance >= priceFor(detail)) && <ArrowRight size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- PIX payment modal ---------------------------------------------------- */}
      {payOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm md:items-center md:p-6">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 md:rounded-3xl">
            <div className="text-lg font-black">Pagamento PIX</div>
            <p className="mt-1 text-sm font-medium text-black/60">
              「{payOrder.productName}」tem uma parte em dinheiro. Transfira <b>R$ {payOrder.cashDue?.toFixed(2)}</b> para a chave PIX abaixo e informe o código/ID do comprovante.
            </p>
            <div className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-center" style={{ borderColor: GOLD, background: "#fffaf0" }}>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Chave PIX MePonto</div>
              <div className="mt-1 break-all font-mono text-sm font-bold">{pixKey || "(chave PIX será informada pelo suporte)"}</div>
              <div className="mt-1 text-xs font-bold text-black/50">Pedido {payOrder.id}</div>
            </div>
            <input
              value={payRef}
              onChange={(event) => setPayRef(event.target.value)}
              placeholder="ID / código do comprovante da transferência"
              className="mt-4 h-12 w-full rounded-xl border border-black/15 px-4 text-sm font-bold outline-none focus:border-[#f5b301]"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setPayOrder(null)} className="h-11 flex-1 rounded-full border border-black/15 text-sm font-black text-black/60">Depois</button>
              <button type="button" disabled={busy || !payRef.trim()} onClick={() => void submitPaymentRef()} className="h-11 flex-1 rounded-full text-sm font-black disabled:opacity-45" style={{ background: INK, color: "#fff" }}>
                Enviar comprovante
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] font-bold text-black/40">Você também pode enviar depois em “Meus resgates”.</p>
          </div>
        </div>
      )}

      {/* ---- My orders drawer ------------------------------------------------------ */}
      {ordersOpen && me && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" onClick={() => setOrdersOpen(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <div className="text-base font-black">Meus resgates</div>
              <button type="button" onClick={() => setOrdersOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X size={16} /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {myOrders.length === 0 && <div className="pt-10 text-center text-sm font-bold text-black/40">Nenhum resgate ainda — escolha um benefício! 🎁</div>}
              {myOrders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-black/8 p-4" style={{ borderColor: order.status === "arrived" ? GOLD : "rgba(0,0,0,.08)", background: order.status === "arrived" ? "#fffaf0" : "#fff" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-black">{order.productName}</div>
                    <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black" style={order.status === "arrived" ? { background: GOLD, color: INK } : { background: "rgba(0,0,0,.06)", color: "rgba(0,0,0,.6)" }}>
                      {statusLabel[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-bold text-black/50">
                    {order.pointsSpent.toLocaleString("pt-BR")} pts{order.cashDue ? ` + R$ ${order.cashDue.toFixed(2)}` : ""} · {order.createdAt.slice(0, 10)}
                    {!order.voucherCode && ` · ${order.station}`}
                  </div>
                  {order.voucherCode && <div className="mt-2 rounded-lg bg-black/5 px-3 py-1.5 text-center font-mono text-sm font-black">{order.voucherCode}</div>}
                  {order.paymentStatus === "pending" && (
                    <button type="button" onClick={() => { setOrdersOpen(false); setPayOrder(order); setPayRef(""); }} className="mt-2 h-9 w-full rounded-full text-xs font-black" style={{ background: INK, color: "#fff" }}>
                      Pagar parte em dinheiro (R$ {order.cashDue?.toFixed(2)})
                    </button>
                  )}
                  {order.paymentStatus === "submitted" && <div className="mt-2 text-center text-[11px] font-black" style={{ color: "#9a7400" }}>Comprovante em análise…</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Toast ------------------------------------------------------------------- */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-sm font-black text-white shadow-xl" style={{ background: toast.tone === "ok" ? "#1d7a3e" : "#c4423b" }}>
          {toast.text}
        </div>
      )}
    </main>
  );
}
