"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Award, Bell, CircleDollarSign, Gift, MapPin, Package, QrCode, Zap } from "lucide-react";
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

const orderStatusLabel: Record<string, string> = { created: "Em trânsito", arrived: "Chegou · retire", fulfilled: "Retirado", cancelled: "Cancelado" };

export default function RiderMallPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyProduct, setBusyProduct] = useState("");
  const [category, setCategory] = useState("");

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

  async function redeem(product: MarketplaceProduct) {
    if (!me) {
      setMessage({ tone: "err", text: "Cadastro não encontrado — fale com o gestor da estação." });
      return;
    }
    const price = Math.ceil(product.pointsPrice * (me.redeemDiscount ?? 1));
    const where = product.isVirtual ? "Voucher digital instantâneo" : `Retirada na estação: ${me.station} (apenas na sua estação)`;
    if (!window.confirm(`Resgatar por ${price} pts: 「${product.name}」?\n${where}`)) return;
    setBusyProduct(product.id);
    const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action: "redeem", productId: product.id, riderId: me.riderId }) });
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
    <div className="mx-auto min-h-screen max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
        <h1 className="flex items-center gap-2 text-lg font-black md:text-2xl"><Gift size={20} className="text-[var(--accent)]" /> Loja de Pontos</h1>
      </div>

      {message && (
        <div className={`rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {arrivals.length > 0 && (
        <div className="panel border-[var(--accent)] p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Bell size={14} /> Aviso de retirada</div>
          {arrivals.map((order) => (
            <div key={order.id} className="mt-2 text-sm font-black">
              「{order.productName}」chegou em {order.station} — retire o quanto antes!
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {me ? (
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-black"><Award size={15} className="text-[var(--accent)]" /> {me.tierLabel}</div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                  {me.lifetimeOrders === null ? "Complete pedidos (Eastwind) para subir de nível" : `Pedidos acumulados: ${me.lifetimeOrders}`}
                  ｜ Retirada: {me.station}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">Saldo de pontos</div>
                <div className="text-3xl font-black text-[var(--accent)]">{me.balance}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] font-bold text-[var(--muted-strong)]">{me.perks.join("｜")}</div>
          </div>
        ) : (
          <div className="panel p-4 text-sm font-bold text-[var(--muted)]">Cadastro não encontrado — registre-se para virar membro e resgatar.</div>
        )}

        {me && (
          <div className="panel flex items-center gap-3 p-4">
            {/* QR points to the public invite link; reward released after invitee's first completed order. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(`https://app.meponto.com/scan?ref=${me.riderId}`)}`}
              alt="QR de convite"
              width={96}
              height={96}
              className="rounded bg-white p-1"
            />
            <div className="text-[11px] font-bold text-[var(--muted)]">
              <div className="flex items-center gap-1 text-[var(--text)]"><QrCode size={12} /> Convide com este QR</div>
              Código: {me.riderId}
              <div className="mt-1">+{data?.config.referralPoints ?? 20} pts quando o convidado concluir o primeiro pedido.</div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-black uppercase text-[var(--muted)]">Produtos disponíveis</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCategory("")} className={`tag ${!category ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}>Tudo</button>
            {categories.map((cat) => (
              <button key={cat} type="button" onClick={() => setCategory(cat === category ? "" : cat)} className={`tag ${category === cat ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}>{cat}</button>
            ))}
          </div>
        </div>

        {shownProducts.length === 0 && <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">Produtos em breve. Aguarde!</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shownProducts.map((product) => {
            const price = me ? Math.ceil(product.pointsPrice * (me.redeemDiscount ?? 1)) : product.pointsPrice;
            return (
              <div key={product.id} className="panel flex flex-col overflow-hidden p-0">
                <div className="relative h-36 w-full bg-gradient-to-br from-[var(--accent-glow)] to-[var(--surface-raised)]">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[var(--accent)]">
                      {product.isVirtual ? <Zap size={40} /> : <Package size={40} />}
                    </div>
                  )}
                  {product.category && <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[10px] font-black uppercase text-white">{product.category}</span>}
                  {product.isVirtual && <span className="absolute right-2 top-2 rounded bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--accent-ink)]">Instantâneo</span>}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="text-sm font-black leading-5">{product.name}</div>
                  {product.description && <p className="text-[11px] font-bold leading-4 text-[var(--muted-strong)]">{product.description}</p>}
                  <div className="text-[11px] font-bold text-[var(--muted)]">
                    {product.supplierName && `${product.supplierName} ｜ `}
                    {product.isVirtual ? "Entrega imediata" : `≈ ${product.deliveryCycleDays ?? 7} dias até a estação`} ｜ Estoque {product.stock}
                  </div>
                  <button
                    type="button"
                    disabled={busyProduct === product.id || product.stock <= 0}
                    onClick={() => void redeem(product)}
                    className="mt-auto inline-flex h-10 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
                  >
                    <CircleDollarSign size={13} />
                    {price !== product.pointsPrice ? (
                      <>
                        <s className="opacity-60">{product.pointsPrice}</s> {price} pts
                      </>
                    ) : (
                      `${product.pointsPrice} pts`
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {myOrders.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">Meus resgates</div>
          <div className="grid gap-2 md:grid-cols-2">
            {myOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm font-bold">
                <div>
                  {order.productName}
                  <div className="text-[11px] text-[var(--muted)]">
                    <MapPin size={10} className="inline" /> {order.station} ｜ {order.pointsSpent} pts
                    {order.status === "created" && order.etaDate && ` ｜ Previsão ${order.etaDate}`}
                  </div>
                  {order.voucherCode && (
                    <div className="mt-1 rounded bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-black text-[var(--accent)]">
                      Voucher: {order.voucherCode}
                    </div>
                  )}
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
