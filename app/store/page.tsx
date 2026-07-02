"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Clock, Copy, Gift, LogIn, MapPin, Package, Search, Sparkles, Star, Wallet, X } from "lucide-react";
import type { MarketplaceOrder, MarketplaceProduct } from "../lib/points";
import type { CashTopUp, MallBanner, MallCategory, MallCoupon } from "../lib/mall-ops";

/**
 * PontoMall public storefront (mall.meponto.com) — responsive PC + mobile.
 * Anyone can browse; redeeming requires a rider session (cookie shared on
 * .meponto.com). Hybrid products collect a PIX cash difference that the
 * rider settles by transfer + receipt reference.
 */

type LedgerRow = {
  id: string;
  type: string;
  points: number;
  status: string;
  sourceType: string;
  reasonCode: string;
  note: string;
  createdAt: string;
  balanceAfter: number;
};

type Me = {
  accountType?: "rider" | "partner";
  riderId: string;
  partnerId?: string;
  name: string;
  station?: string;
  balance: number;
  tierLabel?: string;
  redeemDiscount?: number;
  cashBalance?: number;
  topUps?: CashTopUp[];
  coupons?: MallCoupon[];
  ledger?: LedgerRow[];
};

/** Points that increase the balance vs. those that decrease it (mirrors the server). */
const POSITIVE_LEDGER = new Set(["earn", "refund", "release", "adjust"]);
const ledgerTypeLabel: Record<string, string> = {
  earn: "Ganho",
  spend: "Resgate",
  refund: "Estorno",
  expire: "Expirado",
  reverse: "Revertido",
  adjust: "Ajuste",
  // "hold"/"release" back the high-value redemption freeze; the pt labels
  // below are auto-translated by I18nRuntime (zh 冻结/解冻 · en Hold/Release).
  release: "Liberação",
  hold: "Bloqueio",
};
const ledgerSourceLabel: Record<string, string> = {
  delivery: "Entregas",
  mission: "Missão",
  partner_service: "Serviço a entregador",
  marketplace_order: "Resgate na loja",
  admin_adjustment: "Ajuste manual",
  expiry: "Expiração",
};
const ledgerStatusLabel: Record<string, string> = {
  approved: "Confirmado",
  pending: "Pendente",
  rejected: "Recusado",
  reversed: "Revertido",
};

type Payload = {
  pixKey?: string;
  config?: { referralPoints?: number };
  categories?: MallCategory[];
  banners?: MallBanner[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  me: Me | null;
};

const GOLD = "#f5b301";
const INK = "#19202c";
const statusLabel: Record<string, string> = { created: "Em trânsito", arrived: "Chegou · retire", fulfilled: "Retirado", cancelled: "Cancelado" };
// Partners receive shipments at their own shop (no station pickup).
const partnerStatusLabel: Record<string, string> = { created: "A caminho da loja", arrived: "Chegou na loja", fulfilled: "Recebido", cancelled: "Cancelado" };

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

/** Rider login on app.meponto.com, returning to the current mall page after. */
function loginUrlWithReturn() {
  const back = typeof window !== "undefined" ? window.location.href : "https://mall.meponto.com/";
  return `https://app.meponto.com/register?returnTo=${encodeURIComponent(back)}`;
}

export default function StorefrontPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [riderName, setRiderName] = useState<string | null>(null);
  // Logged-in identity from the session cookie — present even for a Google
  // *guest* (verified:false) who has no member record yet (`me` stays null).
  const [account, setAccount] = useState<{ name: string; email: string; verified: boolean } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<MarketplaceProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [activeTopUp, setActiveTopUp] = useState<CashTopUp | null>(null);
  const [topUpRef, setTopUpRef] = useState("");
  const [bannerIndex, setBannerIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [pickupStoreId, setPickupStoreId] = useState("");

  const copyVoucher = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setToast({ tone: "ok", text: "Código copiado!" });
      setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2500);
    } catch {
      setToast({ tone: "err", text: "Não foi possível copiar — copie manualmente." });
    }
  }, []);

  const load = useCallback(async (name: string | null) => {
    const params = new URLSearchParams();
    if (name) params.set("riderName", name);
    const response = await fetch(`/api/mall?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setData(payload.data as Payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      let name: string | null = null;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          user?: { portal?: string; name?: string; email?: string; verified?: boolean };
        };
        if (payload?.user?.portal === "rider" && payload.user.name) {
          name = payload.user.name;
          setAccount({ name: payload.user.name, email: payload.user.email ?? "", verified: payload.user.verified !== false });
        }
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

  // Esc closes the topmost open overlay (a11y).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detail) setDetail(null);
      else if (topUpOpen) { setTopUpOpen(false); setActiveTopUp(null); }
      else if (extratoOpen) setExtratoOpen(false);
      else if (ordersOpen) setOrdersOpen(false);
      else if (accountOpen) setAccountOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, topUpOpen, ordersOpen, extratoOpen, accountOpen]);

  const me = data?.me ?? null;
  const products = useMemo(() => {
    const acct = data?.me?.accountType === "partner" ? "partner" : "rider";
    const active = (data?.products ?? []).filter((product) => product.status === "active");
    const term = query.trim().toLowerCase();
    return active
      .filter((product) => product.audience === "both" || product.audience === acct)
      .filter((product) => !category || (product.category || "Outros") === category)
      .filter((product) => !term || product.name.toLowerCase().includes(term) || (product.description ?? "").toLowerCase().includes(term));
  }, [data, query, category]);

  const categories = useMemo(() => {
    const fromConfig = (data?.categories ?? []).map((item) => item.name);
    const fromProducts = [...new Set((data?.products ?? []).filter((p) => p.status === "active").map((product) => product.category || "Outros"))];
    return [...new Set([...fromConfig, ...fromProducts])];
  }, [data]);

  const myOrders = useMemo(() => {
    if (!me) return [];
    const all = data?.orders ?? [];
    // Partner orders are already scoped server-side; rider orders are filtered by id.
    return me.accountType === "partner" ? all : all.filter((order) => order.riderId === me.riderId);
  }, [data, me]);
  const pendingTopUps = (me?.topUps ?? []).filter((topUp) => topUp.status === "pending");
  const actionNeeded = myOrders.filter((order) => order.status === "arrived").length + pendingTopUps.length;

  const priceFor = (product: MarketplaceProduct) => Math.ceil(product.pointsPrice * (me?.redeemDiscount ?? 1));

  // Best storefront coupon applicable to a product (mirrors the server logic
  // for a live preview; the server re-applies authoritatively at redeem).
  const bestCoupon = (product: MarketplaceProduct): { coupon: MallCoupon; discount: number } | null => {
    const price = priceFor(product);
    let best: { coupon: MallCoupon; discount: number } | null = null;
    for (const c of me?.coupons ?? []) {
      if (price < c.minPoints) continue;
      const discount = c.type === "percent_off" ? Math.floor((price * c.value) / 100) : Math.min(c.value, price);
      if (discount > 0 && (!best || discount > best.discount)) best = { coupon: c, discount };
    }
    return best;
  };

  async function redeem(product: MarketplaceProduct) {
    if (!me) {
      // Not a full member yet (guest or anonymous) → activate/verify first.
      window.location.href = `/register?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "https://mall.meponto.com/")}`;
      return;
    }
    setBusy(true);
    const response = await fetch("/api/mall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        (() => {
          const stores = (me as { pickupStores?: Array<{ id: string }> }).pickupStores ?? [];
          const pickupStoreId2 = pickupStoreId || stores[0]?.id;
          return me.accountType === "partner"
            ? { action: "redeem", productId: product.id, accountType: "partner", pickupStoreId: pickupStoreId2 }
            : { action: "redeem", productId: product.id, riderId: me.riderId, pickupStoreId: pickupStoreId2 };
        })(),
      ),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      if (payload.needTopUp) {
        setDetail(null);
        setTopUpAmount(String(Math.max(1, Math.ceil((payload.cashDue ?? 0) - (payload.cashAvailable ?? 0)))));
        setActiveTopUp(null);
        setTopUpOpen(true);
        setToast({ tone: "err", text: payload.error ?? "Saldo insuficiente — recarregue via PIX." });
        return;
      }
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setDetail(null);
    await load(riderName);
    const order = payload.data?.order as MarketplaceOrder | undefined;
    if (payload.data?.held) {
      setToast({ tone: "ok", text: "Resgate de alto valor enviado para análise. Avisaremos assim que for aprovado." });
    } else if (order?.voucherCode) {
      setToast({ tone: "ok", text: `Resgatado! Seu código: ${order.voucherCode}` });
    } else if (me?.accountType === "partner") {
      setToast({ tone: "ok", text: `Pedido confirmado! Entrega na sua loja até ${order?.etaDate ?? "breve"}.` });
    } else {
      setToast({ tone: "ok", text: `Resgatado! Retire em ${order?.station ?? "seu ponto"} a partir de ${order?.etaDate ?? "breve"}.` });
    }
  }

  async function cancelOrder(order: MarketplaceOrder) {
    if (!me) return;
    setBusy(true);
    const response = await fetch("/api/mall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancelOrder", orderId: order.id, riderId: me.riderId }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setToast({ tone: "ok", text: `Resgate cancelado — ${order.pointsSpent.toLocaleString("pt-BR")} pts devolvidos.` });
    await load(riderName);
  }

  async function confirmReceipt(order: MarketplaceOrder) {
    if (!me) return;
    setBusy(true);
    const response = await fetch("/api/mall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmReceipt", orderId: order.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setToast({ tone: "ok", text: "Recebimento confirmado! 🎉" });
    await load(riderName);
  }

  async function requestTopUp() {
    if (!me) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount < 1) return;
    setBusy(true);
    const response = await fetch("/api/mall/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "requestTopUp", riderId: me.riderId, amountBRL: amount }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setActiveTopUp(payload.data as CashTopUp);
    setTopUpRef("");
  }

  async function submitTopUpRef(topUp: CashTopUp) {
    if (!topUpRef.trim()) return;
    setBusy(true);
    const response = await fetch("/api/mall/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitTopUpRef", topUpId: topUp.id, reference: topUpRef.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setToast({ tone: "err", text: payload.error ?? `Erro (${response.status})` });
      return;
    }
    setTopUpOpen(false);
    setActiveTopUp(null);
    setToast({ tone: "ok", text: "Comprovante enviado! O saldo entra após a confirmação do escritório." });
    await load(riderName);
  }

  const pixKey = data?.pixKey || "";

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.reload();
  }
  // Activate / verify: the unified login+register page collects phone → OTP →
  // CPF, which links this Google guest to a rider record (or creates a member).
  const activateUrl = `/register?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "https://mall.meponto.com/")}`;
  // Logged in (member OR guest) — drives the header + account panel.
  const loggedIn = !!me || !!account;
  // A true guest = signed in with Google but not yet phone+CPF verified. NOT the
  // same as "account set but `me` still loading" — checking `!me` there caused a
  // verified member to flash "Visitante" while /api/mall loaded (cold start).
  const isGuest = !!account && account.verified === false;

  return (
    <main data-i18n-skip className="min-h-screen" style={{ background: "#f6f7f9", color: INK, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ---- Header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:gap-6 md:px-8">
          <a href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-logo-icon.png" alt="MePonto" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-xl font-black tracking-tight" style={{ letterSpacing: "-0.02em" }}>
              <span style={{ color: INK }}>Ponto</span><span style={{ color: "#cf9700" }}>Mall</span>
            </span>
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
                <button
                  type="button"
                  onClick={() => setExtratoOpen(true)}
                  title="Ver extrato de pontos"
                  className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-black transition-transform hover:scale-105"
                  style={{ background: "#fff4cf" }}
                >
                  <Wallet size={15} style={{ color: "#9a7400" }} />
                  {me.balance.toLocaleString("pt-BR")} pts
                </button>
                {me.accountType !== "partner" && (
                  <button
                    type="button"
                    onClick={() => { setTopUpOpen(true); setActiveTopUp(null); setTopUpAmount(""); }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-black transition-colors hover:border-[#f5b301]"
                    style={{ background: "#eef6f0", borderColor: "transparent", color: "#1d7a3e" }}
                    title="Saldo em dinheiro — recarregar via PIX"
                  >
                    R$ {(me.cashBalance ?? 0).toFixed(2)} <span className="text-base leading-none">+</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAccountOpen(true)}
                  title="Minha conta"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white transition-transform hover:scale-105"
                  style={{ background: INK }}
                >
                  {(me.name[0] || "?").toUpperCase()}
                </button>
              </>
            ) : account ? (
              // Logged-in Google guest (no member record yet) — show their account.
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-black/10 bg-white pl-1.5 pr-3 text-sm font-black transition-colors hover:border-[#f5b301]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-black text-white" style={{ background: INK }}>{(account.name[0] || "?").toUpperCase()}</span>
                <span className="hidden max-w-[110px] truncate sm:inline">{account.name.split(" ")[0]}</span>
                {isGuest ? <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "#fff4cf", color: "#9a7400" }}>Visitante</span> : null}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <a href="/register" className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-black transition-transform hover:scale-105" style={{ borderColor: "rgba(0,0,0,.15)", color: INK }}>
                  Criar conta
                </a>
                <a
                  href="https://app.meponto.com/register"
                  onClick={(event) => { event.preventDefault(); window.location.href = loginUrlWithReturn(); }}
                  className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-black transition-transform hover:scale-105"
                  style={{ background: INK, color: "#fff" }}
                >
                  <LogIn size={15} /> Entrar
                </a>
              </div>
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
        {(() => {
          const msgs = ((me as { messages?: Array<{ id: string; title: string; body: string; readAt?: string }> } | null)?.messages) ?? [];
          const unread = msgs.filter((m) => !m.readAt);
          if (unread.length === 0) return null;
          return (
            <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wide" style={{ color: "#9a7400" }}>📬 Mensagens ({unread.length})</span>
                <button type="button" onClick={async () => { if (!me) return; await fetch("/api/mall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markMessagesRead", riderId: me.riderId }) }); await load(riderName); }} className="text-[11px] font-black text-black/45">Marcar lidas</button>
              </div>
              {unread.slice(0, 3).map((m) => (
                <div key={m.id} className="mt-1">
                  <div className="text-sm font-black">{m.title}</div>
                  <div className="text-xs font-bold text-black/55">{m.body}</div>
                </div>
              ))}
            </div>
          );
        })()}
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
        {me && me.accountType === "partner" ? (
          <section className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-black/5 bg-white px-5 py-3 text-sm font-bold">
            <span className="inline-flex items-center gap-1.5"><Star size={14} style={{ color: GOLD }} /> {me.name}</span>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-black" style={{ background: "#eef2ff", color: "#3b4a9a" }}>Parceiro</span>
            <span className="text-black/55">Resgate vouchers e produtos com seus pontos — entrega na sua loja.</span>
          </section>
        ) : me ? (
          <section className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-black/5 bg-white px-5 py-3 text-sm font-bold">
            <span className="inline-flex items-center gap-1.5"><Star size={14} style={{ color: GOLD }} /> {me.name} · {me.tierLabel}</span>
            <span className="inline-flex items-center gap-1.5 text-black/55"><MapPin size={14} /> Retirada: {me.station}</span>
            {(me.redeemDiscount ?? 1) < 1 && <span className="rounded-full px-2.5 py-0.5 text-xs font-black" style={{ background: "#e8f6ec", color: "#1d7a3e" }}>Desconto de membro: {Math.round((1 - (me.redeemDiscount ?? 1)) * 100)}%</span>}
          </section>
        ) : null}

        {/* ---- Invite friends (riders only) ------------------------------------ */}
        {me && me.accountType !== "partner" && (
          <section id="invite" className="mt-4 flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 scroll-mt-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(`https://app.meponto.com/scan?ref=${me.riderId}`)}`}
              alt="QR de convite"
              width={96}
              height={96}
              className="h-24 w-24 shrink-0 rounded-xl border border-black/10 p-1"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-black"><Gift size={15} style={{ color: GOLD }} /> Convide amigos{data?.config?.referralPoints ? ` = +${data.config.referralPoints} pts` : ""}</div>
              <p className="mt-1 text-xs font-bold leading-5 text-black/55">Seu amigo escaneia o QR, cria a conta e você ganha os pontos após o primeiro pedido dele.</p>
              <div className="mt-1.5 inline-flex items-center rounded-lg bg-black/5 px-2.5 py-1 text-xs font-black">Código: {me.riderId}</div>
            </div>
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
        {loading ? (
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true" aria-label="Carregando produtos">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
                <div className="aspect-square animate-pulse bg-black/[0.06]" />
                <div className="space-y-2 p-3 md:p-4">
                  <div className="h-3.5 w-4/5 animate-pulse rounded bg-black/[0.06]" />
                  <div className="h-3.5 w-1/2 animate-pulse rounded bg-black/[0.06]" />
                  <div className="h-5 w-2/5 animate-pulse rounded bg-black/[0.08]" />
                </div>
              </div>
            ))}
          </section>
        ) : products.length === 0 ? (
          <div className="mt-16 text-center text-sm font-bold text-black/40">
            {query || category ? "Nenhum produto encontrado para esta busca." : "Nenhum produto disponível no momento. Volte em breve! 🎁"}
          </div>
        ) : (
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => {
              const price = priceFor(product);
              const cpn = bestCoupon(product);
              const finalPrice = price - (cpn?.discount ?? 0);
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
                    {cpn && <span className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow" style={{ background: "#1d7a3e" }}>🎟️ −{cpn.discount.toLocaleString("pt-BR")}</span>}
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="line-clamp-2 min-h-10 text-[13px] font-bold leading-5 md:text-sm">{product.name}</div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-lg font-black md:text-xl" style={{ color: "#9a7400" }}>{finalPrice.toLocaleString("pt-BR")}</span>
                      <span className="text-[11px] font-black uppercase text-black/40">pts</span>
                      {(product.cashPriceBRL ?? 0) > 0 && <span className="text-[11px] font-black text-black/55">+ R$ {product.cashPriceBRL?.toFixed(2)}</span>}
                    </div>
                    {me && finalPrice < product.pointsPrice && <div className="text-[10px] font-bold text-black/35 line-through">{product.pointsPrice.toLocaleString("pt-BR")} pts</div>}
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
          <div role="dialog" aria-modal="true" aria-label={detail.name} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
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
                {!detail.isVirtual && (() => {
                  const stores = ((me as { pickupStores?: Array<{ id: string; name: string; bairro?: string }> } | null)?.pickupStores) ?? [];
                  if (stores.length === 0) return null;
                  return (
                    <div className="mt-4">
                      <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-black/45">Retirar no Ponto</div>
                      {stores.length === 1 ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-black/5 px-3 py-2 text-sm font-bold"><MapPin size={14} /> {stores[0].name}{stores[0].bairro ? ` · ${stores[0].bairro}` : ""}</div>
                      ) : (
                        <select value={pickupStoreId || stores[0]?.id} onChange={(e) => setPickupStoreId(e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-bold">
                          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.bairro ? ` · ${s.bairro}` : ""}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })()}
                <div className="mt-auto pt-6">
                  {(() => {
                    const cpn = bestCoupon(detail);
                    const final = priceFor(detail) - (cpn?.discount ?? 0);
                    return (
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-3xl font-black" style={{ color: "#9a7400" }}>{final.toLocaleString("pt-BR")}</span>
                        <span className="text-xs font-black uppercase text-black/40">pts</span>
                        {cpn && <span className="text-sm font-bold text-black/35 line-through">{priceFor(detail).toLocaleString("pt-BR")}</span>}
                        {cpn && <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: "#e8f6ec", color: "#1d7a3e" }}>🎟️ {cpn.coupon.title} −{cpn.discount.toLocaleString("pt-BR")}</span>}
                        {(detail.cashPriceBRL ?? 0) > 0 && <span className="text-sm font-black text-black/65">+ R$ {detail.cashPriceBRL?.toFixed(2)} do saldo</span>}
                      </div>
                    );
                  })()}
                  {me && (
                    <div className="mt-1 text-xs font-bold text-black/45">
                      Seu saldo: {me.balance.toLocaleString("pt-BR")} pts
                      {(detail.cashPriceBRL ?? 0) > 0 && <> · R$ {(me.cashBalance ?? 0).toFixed(2)} em dinheiro {(me.cashBalance ?? 0) < (detail.cashPriceBRL ?? 0) && <span style={{ color: "#c4423b" }}>(insuficiente)</span>}</>}
                    </div>
                  )}
                  {me && (detail.cashPriceBRL ?? 0) > 0 && (me.cashBalance ?? 0) < (detail.cashPriceBRL ?? 0) ? (
                    <button
                      type="button"
                      onClick={() => { setDetail(null); setTopUpOpen(true); setActiveTopUp(null); setTopUpAmount(String(Math.max(1, Math.ceil((detail.cashPriceBRL ?? 0) - (me.cashBalance ?? 0))))); }}
                      className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black uppercase tracking-wide transition-transform hover:scale-[1.02]"
                      style={{ background: INK, color: "#fff" }}
                    >
                      Recarregar saldo via PIX <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || detail.stock <= 0 || (!!me && me.balance < priceFor(detail) - (bestCoupon(detail)?.discount ?? 0))}
                      onClick={() => void redeem(detail)}
                      className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black uppercase tracking-wide transition-transform hover:scale-[1.02] disabled:opacity-45"
                      style={{ background: GOLD, color: INK }}
                    >
                      {detail.stock <= 0 ? "Esgotado" : me ? (me.balance < priceFor(detail) - (bestCoupon(detail)?.discount ?? 0) ? "Pontos insuficientes" : "Resgatar agora") : "Entrar para resgatar"}
                      {detail.stock > 0 && (!me || me.balance >= priceFor(detail) - (bestCoupon(detail)?.discount ?? 0)) && <ArrowRight size={16} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- PIX top-up modal ------------------------------------------------------ */}
      {topUpOpen && me && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm md:items-center md:p-6">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 md:rounded-3xl">
            <div className="flex items-center justify-between">
              <div className="text-lg font-black">Recarregar saldo</div>
              <button type="button" onClick={() => { setTopUpOpen(false); setActiveTopUp(null); }} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X size={16} /></button>
            </div>
            <div className="mt-1 text-sm font-bold text-black/50">Saldo atual: R$ {(me.cashBalance ?? 0).toFixed(2)}</div>

            {!activeTopUp ? (
              <>
                <div className="mt-4 flex gap-2">
                  {[10, 20, 50, 100].map((value) => (
                    <button key={value} type="button" onClick={() => setTopUpAmount(String(value))} className="h-10 flex-1 rounded-xl border text-sm font-black transition-colors" style={topUpAmount === String(value) ? { borderColor: GOLD, background: "#fff4cf" } : { borderColor: "rgba(0,0,0,.12)" }}>
                      R$ {value}
                    </button>
                  ))}
                </div>
                <input
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
                  placeholder="Outro valor (R$)"
                  inputMode="decimal"
                  className="mt-3 h-12 w-full rounded-xl border border-black/15 px-4 text-sm font-bold outline-none focus:border-[#f5b301]"
                />
                <button type="button" disabled={busy || !(Number(topUpAmount) >= 1)} onClick={() => void requestTopUp()} className="mt-4 h-12 w-full rounded-full text-sm font-black uppercase tracking-wide disabled:opacity-45" style={{ background: GOLD, color: INK }}>
                  Gerar recarga
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-medium text-black/60">
                  Transfira <b>R$ {activeTopUp.amountBRL.toFixed(2)}</b> para a chave PIX abaixo e informe o código/ID do comprovante. O saldo entra após a confirmação do escritório.
                </p>
                <div className="mt-3 rounded-2xl border border-dashed px-4 py-3 text-center" style={{ borderColor: GOLD, background: "#fffaf0" }}>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Chave PIX MePonto</div>
                  <div className="mt-1 break-all font-mono text-sm font-bold">{activeTopUp.pixKey || data?.pixKey || "(chave PIX será informada pelo suporte)"}</div>
                  <div className="mt-1 text-xs font-bold text-black/50">Recarga {activeTopUp.id}</div>
                </div>
                <input
                  value={topUpRef}
                  onChange={(event) => setTopUpRef(event.target.value)}
                  placeholder="ID / código do comprovante da transferência"
                  className="mt-4 h-12 w-full rounded-xl border border-black/15 px-4 text-sm font-bold outline-none focus:border-[#f5b301]"
                />
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => { setTopUpOpen(false); setActiveTopUp(null); }} className="h-11 flex-1 rounded-full border border-black/15 text-sm font-black text-black/60">Enviar depois</button>
                  <button type="button" disabled={busy || !topUpRef.trim()} onClick={() => void submitTopUpRef(activeTopUp)} className="h-11 flex-1 rounded-full text-sm font-black disabled:opacity-45" style={{ background: INK, color: "#fff" }}>
                    Enviar comprovante
                  </button>
                </div>
              </>
            )}
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
              {(me.topUps ?? []).length > 0 && (
                <div className="rounded-2xl border border-black/8 bg-[#f8f9fb] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-black uppercase tracking-wider text-black/45">Recargas (PIX)</div>
                    <div className="text-xs font-black" style={{ color: "#1d7a3e" }}>Saldo: R$ {(me.cashBalance ?? 0).toFixed(2)}</div>
                  </div>
                  <div className="space-y-1.5">
                    {(me.topUps ?? []).map((topUp) => (
                      <div key={topUp.id} className="flex items-center justify-between gap-2 text-xs font-bold">
                        <span>R$ {topUp.amountBRL.toFixed(2)} · {topUp.createdAt.slice(0, 10)}</span>
                        {topUp.status === "pending" ? (
                          <button type="button" onClick={() => { setOrdersOpen(false); setTopUpOpen(true); setActiveTopUp(topUp); setTopUpRef(""); }} className="rounded-full px-2.5 py-1 font-black text-white" style={{ background: INK }}>Enviar comprovante</button>
                        ) : (
                          <span className="rounded-full px-2.5 py-1" style={topUp.status === "confirmed" ? { background: "#e8f6ec", color: "#1d7a3e" } : topUp.status === "submitted" ? { background: "#fff4cf", color: "#9a7400" } : { background: "#fdeceb", color: "#c4423b" }}>
                            {topUp.status === "confirmed" ? "Confirmada" : topUp.status === "submitted" ? "Em análise" : "Rejeitada"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {myOrders.length === 0 && <div className="pt-10 text-center text-sm font-bold text-black/40">Nenhum resgate ainda — escolha um benefício! 🎁</div>}
              {myOrders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-black/8 p-4" style={{ borderColor: order.reviewStatus === "pending" ? "#9a7400" : order.status === "arrived" ? GOLD : "rgba(0,0,0,.08)", background: order.status === "arrived" ? "#fffaf0" : "#fff" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-black">{order.productName}</div>
                    <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black" style={order.reviewStatus === "pending" ? { background: "#fff4cf", color: "#9a7400" } : order.status === "arrived" ? { background: GOLD, color: INK } : { background: "rgba(0,0,0,.06)", color: "rgba(0,0,0,.6)" }}>
                      {order.reviewStatus === "pending" ? "Em análise" : (me.accountType === "partner" ? partnerStatusLabel : statusLabel)[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-bold text-black/50">
                    {order.pointsSpent.toLocaleString("pt-BR")} pts{order.cashDue ? ` + R$ ${order.cashDue.toFixed(2)}` : ""} · {order.createdAt.slice(0, 10)}
                    {!order.voucherCode && ` · ${order.station}`}
                  </div>
                  {order.voucherCode && (
                    <button
                      type="button"
                      onClick={() => void copyVoucher(order.voucherCode!)}
                      title="Toque para copiar o código"
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-black/5 px-3 py-1.5 font-mono text-sm font-black transition-colors hover:bg-black/10"
                    >
                      {order.voucherCode}
                      {copiedCode === order.voucherCode ? <Check size={14} className="text-[#1d7a3e]" /> : <Copy size={14} className="text-black/40" />}
                    </button>
                  )}
                  {me.accountType === "partner" && (order.status === "created" || order.status === "arrived") && !order.voucherCode && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void confirmReceipt(order)}
                      className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-black text-white transition-transform hover:scale-[1.01] disabled:opacity-45"
                      style={{ background: "#1d7a3e" }}
                    >
                      Confirmar recebimento
                    </button>
                  )}
                  {me.accountType !== "partner" && order.status === "created" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void cancelOrder(order)}
                      className="mt-2 w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs font-black text-black/55 transition-colors hover:border-[#c4423b] hover:text-[#c4423b] disabled:opacity-45"
                    >
                      Cancelar e devolver pontos
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Points extract drawer (rider & partner share this) -------------------- */}
      {extratoOpen && me && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" onClick={() => setExtratoOpen(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <div>
                <div className="text-base font-black">Extrato de pontos</div>
                <div className="text-xs font-bold text-black/45">Saldo atual: {me.balance.toLocaleString("pt-BR")} pts</div>
              </div>
              <button type="button" onClick={() => setExtratoOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X size={16} /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-5">
              {(me.ledger ?? []).length === 0 && (
                <div className="pt-10 text-center text-sm font-bold text-black/40">Nenhum movimento de pontos ainda. 🪙</div>
              )}
              {(me.ledger ?? []).map((row) => {
                const positive = POSITIVE_LEDGER.has(row.type);
                const sign = positive ? "+" : "−";
                const color = row.status !== "approved" ? "#9a7400" : positive ? "#1d7a3e" : "#c4423b";
                return (
                  <div key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border border-black/8 p-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-black">{ledgerTypeLabel[row.type] ?? row.type}</div>
                      <div className="truncate text-xs font-bold text-black/45">
                        {ledgerSourceLabel[row.sourceType] ?? row.sourceType} · {row.createdAt.slice(0, 10)}
                      </div>
                      {row.status !== "approved" && (
                        <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "#fff4cf", color: "#9a7400" }}>
                          {ledgerStatusLabel[row.status] ?? row.status}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black" style={{ color }}>{sign}{row.points.toLocaleString("pt-BR")}</div>
                      <div className="text-[11px] font-bold text-black/35">Saldo {row.balanceAfter.toLocaleString("pt-BR")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---- Account / profile drawer (member & guest) ------------------------------ */}
      {accountOpen && loggedIn && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" onClick={() => setAccountOpen(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <div className="text-base font-black">Minha conta</div>
              <button type="button" onClick={() => setAccountOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X size={16} /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-black text-white" style={{ background: INK }}>{((me?.name || account?.name || "?")[0] || "?").toUpperCase()}</span>
                <div className="min-w-0">
                  <div className="truncate text-lg font-black">{me?.name || account?.name}</div>
                  {account?.email ? <div className="truncate text-xs font-bold text-black/45">{account.email}</div> : null}
                </div>
              </div>

              {isGuest ? (
                <div className="rounded-2xl border p-4" style={{ borderColor: GOLD, background: "#fffaf0" }}>
                  <div className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-black" style={{ background: "#fff4cf", color: "#9a7400" }}>Conta de visitante</div>
                  <p className="mt-2 text-sm font-bold leading-6 text-black/60">Você entrou com o Google. Confirme seu telefone e CPF para acumular pontos, resgatar benefícios e ver sua carteira.</p>
                  <a href={activateUrl} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-black uppercase tracking-wide transition-transform hover:scale-[1.02]" style={{ background: GOLD, color: INK }}>
                    Ativar minha conta <ArrowRight size={16} />
                  </a>
                </div>
              ) : me ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#fff4cf] p-4">
                      <div className="text-[11px] font-black uppercase text-[#9a7400]">Pontos</div>
                      <div className="mt-1 text-2xl font-black" style={{ color: "#9a7400" }}>{me.balance.toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="rounded-2xl bg-[#eef6f0] p-4">
                      <div className="text-[11px] font-black uppercase" style={{ color: "#1d7a3e" }}>Saldo R$</div>
                      <div className="mt-1 text-2xl font-black" style={{ color: "#1d7a3e" }}>{(me.cashBalance ?? 0).toFixed(2)}</div>
                    </div>
                  </div>
                  {(me.tierLabel || me.station) && (
                    <div className="space-y-1.5 rounded-2xl border border-black/8 p-4 text-sm font-bold">
                      {me.tierLabel && <div className="flex items-center justify-between"><span className="text-black/45">Nível</span><span>{me.tierLabel}</span></div>}
                      {me.station && <div className="flex items-center justify-between"><span className="text-black/45">Retirada</span><span>{me.station}</span></div>}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setAccountOpen(false); setOrdersOpen(true); }} className="h-11 flex-1 rounded-full border border-black/10 text-sm font-black">Meus resgates</button>
                    <button type="button" onClick={() => { setAccountOpen(false); setExtratoOpen(true); }} className="h-11 flex-1 rounded-full border border-black/10 text-sm font-black">Extrato</button>
                  </div>
                </>
              ) : null}
            </div>
            <div className="border-t border-black/5 p-5">
              <button type="button" onClick={() => void logout()} className="h-11 w-full rounded-full border border-black/10 text-sm font-black text-black/60 transition-colors hover:border-[#c4423b] hover:text-[#c4423b]">Sair</button>
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
