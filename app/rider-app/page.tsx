"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Bike,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Gift,
  Headphones,
  Home,
  LifeBuoy,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Navigation,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Trophy,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readSession } from "../lib/session";
import { crmPartners } from "../lib/crm";
import { incidents, ledgerEntries, riders } from "../lib/data";
import { getPointsAccount, marketplaceProducts, partnerServiceBenefitRules, pointsLedgerEntries, type PartnerServiceCategory } from "../lib/points";
const wallet = {
  available: 438.7,
  pending: 164.2,
  weeklyGoal: 72,
};

const todayStats = [
  { label: "Ganhos hoje", value: "R$ 86,40", icon: CircleDollarSign, tone: "orange" },
  { label: "Pedidos", value: "18", icon: Bike, tone: "black" },
  { label: "Pontos hoje", value: "+240", icon: Trophy, tone: "green" },
];

const performanceToday = {
  orders: 18,
  tshHours: 7.4,
  ar: 96,
  caaOrders: 5,
};

const missions = [
  { title: "Completar 24 entregas", reward: "+320 pts", progress: 75 },
  { title: "Noite segura no Ponto", reward: "R$ 45", progress: 58 },
];

const inbox = [
  { title: "Saldo atualizado", detail: "R$ 120,00 liberados no seu extrato.", time: "Agora" },
  { title: "Oferta de combustivel", detail: "Beneficio ativo para membros MePonto.", time: "12 min" },
];

const cashLedger = [
  { title: "Repasse liberado", detail: "Corridas confirmadas no Ponto Liberdade Sul", value: "+R$ 120,00", status: "Disponivel" },
  { title: "Saque solicitado", detail: "PIX final 1842, previsao hoje 18:00", value: "-R$ 86,40", status: "Processando" },
  { title: "Bonus noturno", detail: "Missao de cobertura aprovada", value: "+R$ 45,00", status: "Pago" },
];

const partnerBenefits = [
  { partner: "Oficina Liberdade", service: "Manutencao", discount: "R$ 20", status: "Partner +100 pts" },
  { partner: "Posto Avenida", service: "Combustivel", discount: "R$ 5", status: "Em analise" },
];

const partnerMapCategories: Record<string, PartnerServiceCategory> = {
  "Repair Shop": "maintenance",
  "Partner Vehicle Shop": "vehicle_service",
  "Vehicle Partner": "vehicle_service",
};

const partnerMapPositions: Record<string, { x: number; y: number; distance: string }> = {
  "crm-001": { x: 43, y: 42, distance: "1.8 km" },
  "crm-002": { x: 54, y: 49, distance: "0.9 km" },
  "crm-004": { x: 78, y: 43, distance: "6.4 km" },
  "crm-005": { x: 18, y: 64, distance: "8.1 km" },
};

const riderPartnerMap = crmPartners
  .filter((partner) => partner.category !== "Supplier")
  .map((partner) => {
    const category = partnerMapCategories[partner.category] ?? "maintenance";
    const rule = partnerServiceBenefitRules[category];
    const position = partnerMapPositions[partner.id] ?? { x: 50, y: 50, distance: "Perto" };
    return {
      id: partner.id,
      name: partner.name,
      bairro: partner.bairro,
      category,
      services: partner.services.slice(0, 2).join(" / "),
      discount: `R$ ${rule.riderDiscountBrl}`,
      partnerPoints: rule.partnerPoints,
      status: partner.status,
      risk: partner.risk,
      lat: partner.lat,
      lng: partner.lng,
      x: position.x,
      y: position.y,
      distance: position.distance,
      navigationUrl: `https://www.google.com/maps/dir/?api=1&destination=${partner.lat},${partner.lng}`,
    };
  });

const helpActions = [
  { title: "Seguranca agora", detail: "Abrir chamado urgente no Ponto", icon: ShieldCheck },
  { title: "Falar com suporte", detail: "Atendimento pelo chat do app", icon: MessageCircle },
  { title: "Conta e acesso", detail: "PIN, aparelho e dados sensiveis", icon: LockKeyhole },
];

const tierPreviews = [
  { score: 64, metric: "Base", detail: "Primeiros ganhos", threshold: "0-71" },
  { score: 78, metric: "Consistente", detail: "Boa presenca", threshold: "72-85" },
  { score: 92, metric: "Forte", detail: "Alta performance", threshold: "86-99" },
  { score: 102, metric: "Elite", detail: "Prioridade local", threshold: "100-107" },
  { score: 112, metric: "Top", detail: "Brilho maximo", threshold: "108+" },
];

export default function RiderAppPage() {
  // Auth guard: the rider app requires a logged-in account (store requirement).
  useEffect(() => {
    const session = readSession();
    if (!session || (session.portal !== "rider" && session.role !== "Super Admin")) {
      window.location.replace("/rider-login");
    }
  }, []);

  // Greet the LOGGED-IN rider; seed profile only backs the demo KPI widgets.
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    setDisplayName(readSession()?.name ?? "");
  }, []);
  const member = riders[0];
  const openCase = incidents.find((incident) => incident.rider === member.name && incident.status !== "Closed");
  const benefit = ledgerEntries.find((entry) => entry.recipient === member.name);
  const pointsAccount = getPointsAccount(pointsLedgerEntries, member.id);
  const featuredProduct = marketplaceProducts[0];
  const riderLedger = pointsLedgerEntries.filter((entry) => entry.riderId === member.id);
  const riderProducts = marketplaceProducts.filter((product) => product.audience === "rider" || product.audience === "both").slice(0, 3);
  const tier = getRiderTier(member);
  const tierScore = getRiderTierScore(member);
  return (
    <main className="min-h-screen bg-[#101010] text-[#050505]" style={{ fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f3f2ee] pb-24">
        <header className="bg-[#f3f2ee] px-4 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/meponto-app-icon.png" alt="MePonto" className="h-10 w-10 rounded-[8px] shadow-[0_10px_18px_rgba(0,0,0,0.14)]" />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff7a00]">MePonto</div>
                <h1 className="truncate text-lg font-black leading-5" data-i18n-skip>Oi, {(displayName || member.name).split(" ")[0]}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href="/rider-app/scan" aria-label="Escanear QR" className="grid h-10 w-10 place-items-center rounded-[8px] bg-[#050505] text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
                <QrCode size={19} />
              </a>
              <button type="button" aria-label="Abrir avisos" className="relative grid h-10 w-10 place-items-center rounded-[8px] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
                <Bell size={19} />
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ff7a00] ring-2 ring-white" />
              </button>
            </div>
          </div>
        </header>

        <section className="px-4">
          <div className={`relative overflow-hidden rounded-[8px] text-white shadow-[0_18px_42px_rgba(0,0,0,0.22)] ${tier.cardClass}`}>
            <div className={`pointer-events-none absolute inset-0 ${tier.patternClass}`} />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/35" />
            <div className="pointer-events-none absolute -right-14 top-10 h-36 w-36 rotate-45 rounded-[8px] border border-white/12" />
            {tier.key === "diamond" ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.27)_19%,transparent_34%,transparent_100%)]" />
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/28" />
                <div className="pointer-events-none absolute right-6 top-6 h-2 w-2 rounded-full bg-white shadow-[0_0_18px_6px_rgba(255,255,255,0.75)]" />
                <div className="pointer-events-none absolute bottom-6 left-8 h-1.5 w-1.5 rounded-full bg-[#d7fbff] shadow-[0_0_14px_5px_rgba(215,251,255,0.7)]" />
              </>
            ) : null}
            <div className="relative z-10 flex items-start justify-between gap-3 p-4">
              <div>
                <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] ${tier.accentClass}`}>
                  <WalletCards size={15} />
                  Carteira
                </div>
                <div className="mt-3 text-[36px] font-black leading-none tracking-normal">R$ {wallet.available.toFixed(2).replace(".", ",")}</div>
                <div className="mt-2 text-sm font-bold text-white/62">Disponivel para saque</div>
              </div>
              <div className={`rounded-[8px] px-3 py-2 text-right ${tier.badgeClass}`}>
                <div className="text-[11px] font-black uppercase">Pontos</div>
                <div className="mt-1 flex justify-end gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} size={12} fill={index < tier.stars ? "currentColor" : "none"} className={index < tier.stars ? "" : "opacity-35"} />
                  ))}
                </div>
                <div className="mt-1 text-xl font-black">{pointsAccount.available.toLocaleString("pt-BR")}</div>
              </div>
            </div>

            <div className="relative z-10 mx-4 mb-3 grid grid-cols-[1fr_auto] items-end gap-3 rounded-[8px] bg-black/18 p-3 ring-1 ring-white/10">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Performance score</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black">{tierScore}</span>
                  <span className={`text-xs font-black ${tier.accentClass}`}>{tier.nextTarget}</span>
                </div>
              </div>
              <div className="rounded-[8px] bg-white/12 px-2.5 py-1.5 text-right">
                <div className="text-[10px] font-black uppercase text-white/48">Beneficio</div>
                <div className="text-xs font-black">{tier.benefit}</div>
              </div>
            </div>

            <div className="relative z-10 mx-4 mb-3 grid grid-cols-4 gap-1.5">
              <ScoreChip label="Orders" value={String(performanceToday.orders)} />
              <ScoreChip label="TSH" value={performanceToday.tshHours.toFixed(1)} />
              <ScoreChip label="AR" value={`${performanceToday.ar}%`} />
              <ScoreChip label="CAA" value={String(performanceToday.caaOrders)} />
            </div>

            <div className="relative z-10 grid grid-cols-[1fr_1fr] border-y border-white/10">
              <WalletCell label="A liberar" value={`R$ ${wallet.pending.toFixed(2).replace(".", ",")}`} />
              <WalletCell label="Pontos pendentes" value={pointsAccount.pending.toLocaleString("pt-BR")} />
            </div>

            <div className="relative z-10 grid grid-cols-[1fr_1fr] gap-2 p-3">
              <a href="/rider-app/wallet" className={`flex h-12 items-center justify-center gap-2 rounded-[8px] text-sm font-black ${tier.buttonClass}`}>
                Sacar
                <ChevronRight size={17} />
              </a>
              <a href="/rider-app/agenda" className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-white/10 text-sm font-black text-white">
                Agenda
                <CalendarDays size={17} />
              </a>
            </div>
          </div>
        </section>

        <div id="home" className="scroll-mt-4">
            {/* Invite friends — prominent referral hint */}
            <section className="px-4 pt-3">
              <a href="/rider-app/mall#invite" className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] bg-[#ff7a00] p-3 text-[#050505] shadow-[0_12px_26px_rgba(255,122,0,0.3)]">
                <div className="grid h-11 w-11 place-items-center rounded-[8px] bg-[#050505] text-white"><Gift size={20} /></div>
                <div className="min-w-0">
                  <div className="text-sm font-black">Convide amigos e ganhe pontos!</div>
                  <div className="truncate text-[11px] font-bold text-black/70">Mostre seu QR — pontos após o 1º pedido do amigo</div>
                </div>
                <ChevronRight size={20} />
              </a>
            </section>

            <section className="grid grid-cols-3 gap-2 px-4 pt-3">
              {todayStats.map((item) => (
                <MetricCard key={item.label} {...item} />
              ))}
            </section>

            <TierSection activeTierKey={tier.key} />

            <section className="px-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Agora</h2>
                <span className="rounded-full bg-[#20a65a] px-3 py-1 text-xs font-black text-white">Online</span>
              </div>
              <div className="mt-2 grid gap-2">
                <StatusRow icon={<MapPin size={20} />} title={member.ponto} detail={`Lider: ${member.leader}`} value={member.bairro} />
                <StatusRow icon={<ShieldCheck size={20} />} title="Seguranca" detail={openCase ? openCase.location : "Nenhum chamado aberto"} value={openCase ? openCase.severity : "OK"} danger={Boolean(openCase)} />
              </div>
            </section>

            <PartnerMapSection partners={riderPartnerMap} />

            <section className="px-4 pt-4">
              <div className="grid gap-3 rounded-[8px] bg-[#050505] p-4 text-white shadow-[0_12px_26px_rgba(0,0,0,0.16)]">
                <div className="flex items-center gap-2 text-sm font-black text-[#ffb238]">
                  <CalendarDays size={17} />
                  Turnos da semana
                </div>
                <p className="text-sm font-bold leading-5 text-white/62">Inscreva-se dia a dia e acompanhe a aprovação da estação.</p>
                <div className="grid grid-cols-2 gap-2">
                  <a href="/rider-app/shifts" className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-[#ff7a00] text-sm font-black text-[#050505]">
                    Inscrever-se
                    <ChevronRight size={18} />
                  </a>
                  <a href="/rider-app/agenda" className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-white/10 text-sm font-black text-white">
                    Minha agenda
                  </a>
                </div>
              </div>
            </section>

            <section className="px-4 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-black">PontoMall</h2>
                <a href="/rider-app/mall" className="text-sm font-black text-[#ff7a00]">Trocar</a>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] bg-white p-3 shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
                <div>
                  <div className="text-sm font-black">{featuredProduct.name}</div>
                  <div className="mt-1 text-xs font-bold text-[#77746f]">Disponivel no PontoMall</div>
                </div>
                <div className="rounded-[8px] bg-[#050505] px-3 py-2 text-sm font-black text-white">{featuredProduct.pointsPrice} pts</div>
              </div>
            </section>

            <section className="px-4 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-black">Missoes e premios</h2>
                <a href="/rider-app/mall" className="text-sm font-black text-[#ff7a00]">Ver tudo</a>
              </div>
              <div className="grid gap-2">
                {missions.map((mission) => (
                  <MissionCard key={mission.title} {...mission} />
                ))}
              </div>
            </section>

            <NotificationsSection />

            <section className="px-4 pt-4">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] bg-[#ff7a00] p-4 text-[#050505]">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black">
                    <Sparkles size={17} />
                    Beneficio MePonto
                  </div>
                  <p className="mt-1 text-sm font-bold leading-5 text-black/72">
                    {benefit ? `${benefit.notes}: R$ ${benefit.amount.toFixed(2).replace(".", ",")}` : "Combustivel, manutencao e suporte para membros."}
                  </p>
                </div>
                <ChevronRight size={22} />
              </div>
            </section>
        </div>

        <div id="wallet" className="scroll-mt-4">
          <WalletScreen wallet={wallet} cashLedger={cashLedger} />
        </div>
        <div id="points" className="scroll-mt-4">
          <PointsScreen pointsAccount={pointsAccount} ledger={riderLedger} products={riderProducts} activeTierKey={tier.key} />
        </div>
        <div id="help" className="scroll-mt-4">
          <HelpScreen openCase={openCase} memberPonto={member.ponto} />
        </div>

        <nav className="fixed bottom-3 left-1/2 z-20 grid w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 grid-cols-4 rounded-[8px] bg-[#050505] p-1.5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
          <Tab icon={<Home size={18} />} label="Inicio" href="/rider-app" active />
          <Tab icon={<WalletCards size={18} />} label="Carteira" href="/rider-app/wallet" />
          <Tab icon={<Gift size={18} />} label="Loja" href="/rider-app/mall" />
          <Tab icon={<Headphones size={18} />} label="Ajuda" href="/rider-app/support" />
        </nav>
      </div>
    </main>
  );
}

function getRiderTier(rider: { ar: number; nightShiftCount: number; incidentCount: number }) {
  return getRiderTierByScore(getRiderTierScore(rider));
}

function TierSection({ activeTierKey }: { activeTierKey: string }) {
  return (
    <section className="px-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-black">Nivel MePonto</h2>
        <button type="button" className="text-sm font-black text-[#ff7a00]">Ver regras</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tierPreviews.map((preview) => {
          const previewTier = getRiderTierByScore(preview.score);
          return <TierPreviewCard key={preview.score} tier={previewTier} metric={preview.metric} detail={preview.detail} threshold={preview.threshold} active={previewTier.key === activeTierKey} />;
        })}
      </div>
    </section>
  );
}

function WalletScreen({ wallet: walletData, cashLedger: ledger }: { wallet: typeof wallet; cashLedger: typeof cashLedger }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-2 px-4 pt-4">
        <QuickAction icon={<CircleDollarSign size={20} />} title="Solicitar saque" detail="PIX ou conta bancaria" strong />
        <QuickAction icon={<ReceiptText size={20} />} title="Extrato completo" detail="Dinheiro, bonus e ajustes" />
      </section>

      <section className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-2">
          <BalanceTile label="Disponivel" value={`R$ ${walletData.available.toFixed(2).replace(".", ",")}`} />
          <BalanceTile label="A liberar" value={`R$ ${walletData.pending.toFixed(2).replace(".", ",")}`} />
          <BalanceTile label="Meta semanal" value={`${walletData.weeklyGoal}%`} />
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black">Movimentos</h2>
          <span className="text-xs font-black text-[#77746f]">Hoje</span>
        </div>
        <div className="grid gap-2">
          {ledger.map((item) => (
            <LedgerRow key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="rounded-[8px] bg-[#050505] p-4 text-white">
          <div className="flex items-center gap-2 text-sm font-black">
            <CreditCard size={17} className="text-[#ff7a00]" />
            Conta de recebimento
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
            <div>
              <div className="text-sm font-black">PIX final 1842</div>
              <div className="mt-1 text-xs font-bold text-white/55">Validado para saques MePonto</div>
            </div>
            <BadgeCheck size={22} className="text-[#20a65a]" />
          </div>
        </div>
      </section>
    </>
  );
}

function PointsScreen({
  pointsAccount,
  ledger,
  products,
  activeTierKey,
}: {
  pointsAccount: ReturnType<typeof getPointsAccount>;
  ledger: typeof pointsLedgerEntries;
  products: typeof marketplaceProducts;
  activeTierKey: string;
}) {
  return (
    <>
      <section className="grid grid-cols-2 gap-2 px-4 pt-4">
        <QuickAction icon={<QrCode size={20} />} title="Meu QR MePonto" detail="Partner escaneia para liberar desconto" strong />
        <QuickAction icon={<Store size={20} />} title="Shopping" detail="Trocar pontos por produtos" />
      </section>

      <section className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-2">
          <BalanceTile label="Pontos livres" value={pointsAccount.available.toLocaleString("pt-BR")} />
          <BalanceTile label="Em analise" value={pointsAccount.pending.toLocaleString("pt-BR")} />
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#ff7a00]">Beneficio partner</div>
              <h2 className="mt-1 text-lg font-black">Partner escaneia seu QR</h2>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-[8px] bg-[#050505] text-white">
              <QrCode size={22} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <RulePill label="Elegivel" value="2 estrelas+" />
            <RulePill label="Servico" value="1/dia" />
            <RulePill label="Valor ref." value="R$1=10pts" />
          </div>
          <a href="/rider-app/mall#invite" className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#ff7a00] text-sm font-black text-[#050505]">
            Mostrar QR do membro
            <QrCode size={18} />
          </a>
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black">Descontos em partners</h2>
          <span className="text-xs font-black text-[#77746f]">Cash direto</span>
        </div>
        <div className="grid gap-2">
          {partnerBenefits.map((benefit) => (
            <LedgerRow key={`${benefit.partner}-${benefit.service}`} title={benefit.partner} detail={benefit.service} value={benefit.discount} status={benefit.status} />
          ))}
        </div>
      </section>

      <PartnerMapSection partners={riderPartnerMap} compact />

      <TierSection activeTierKey={activeTierKey} />

      <section className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black">Extrato de pontos</h2>
          <span className="text-xs font-black text-[#77746f]">Ledger</span>
        </div>
        <div className="grid gap-2">
          {ledger.map((entry) => (
            <LedgerRow key={entry.id} title={entry.note} detail={`${entry.sourceType} - ${entry.status}`} value={`${entry.type === "spend" ? "-" : "+"}${entry.points} pts`} status={entry.reasonCode} />
          ))}
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black">Shopping</h2>
          <span className="text-xs font-black text-[#ff7a00]">Rider</span>
        </div>
        <div className="grid gap-2">
          {products.map((product) => (
            <ProductRow key={product.id} name={product.name} detail={`${product.city} - estoque ${product.stock}`} price={`${product.pointsPrice} pts`} />
          ))}
        </div>
      </section>
    </>
  );
}

function sendSos() {
  const session = readSession();
  const fire = (coords?: { latitude: number; longitude: number }) => {
    void fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" },
      body: JSON.stringify({
        action: "create",
        channel: "rider",
        authorName: session?.name ?? "Entregador",
        contact: "",
        organization: session?.station ?? "",
        subject: "🆘 SOS — emergência",
        message: coords ? `SOS do entregador. Localização: https://maps.google.com/maps?q=${coords.latitude},${coords.longitude}` : "SOS do entregador (sem localização).",
      }),
    }).then(() => window.alert("SOS enviado! A central e a estação foram avisadas."));
  };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => fire(pos.coords), () => fire(), { timeout: 5000 });
  } else {
    fire();
  }
}

function HelpScreen({ openCase, memberPonto }: { openCase: (typeof incidents)[number] | undefined; memberPonto: string }) {
  return (
    <>
      <section className="px-4 pt-4">
        <div className="rounded-[8px] bg-[#050505] p-4 text-white">
          <div className="flex items-center gap-2 text-sm font-black text-[#ff7a00]">
            <LifeBuoy size={17} />
            Ajuda MePonto
          </div>
          <h2 className="mt-2 text-2xl font-black leading-7">Suporte rapido para o rider</h2>
          <p className="mt-2 text-sm font-bold leading-5 text-white/62">Chamados, seguranca, conta, comunicados e historico de atendimento em um unico lugar.</p>
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="grid gap-2">
          {helpActions.map((action) => (
            <HelpAction key={action.title} {...action} />
          ))}
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Status de seguranca</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${openCase ? "bg-[#ffe5e3] text-[#e53935]" : "bg-[#e8f6ee] text-[#20a65a]"}`}>{openCase ? "Atencao" : "OK"}</span>
          </div>
          <StatusRow icon={<AlertTriangle size={20} />} title={openCase ? openCase.location : memberPonto} detail={openCase ? openCase.description : "Nenhum chamado aberto"} value={openCase ? openCase.severity : "Seguro"} danger={Boolean(openCase)} />
        </div>
      </section>

      <NotificationsSection />
    </>
  );
}

const partnerCategoryLabels: Record<string, string> = {
  fuel: "Combustível",
  maintenance: "Manutenção",
  phone_data: "Celular",
  equipment: "Equipamento",
  vehicle_service: "Veículo",
};

function PartnerMapSection({ partners, compact = false }: { partners: typeof riderPartnerMap; compact?: boolean }) {
  // Detail-first UX: tapping a pin or row opens the partner card; Google Maps
  // is one explicit tap from there. Category chips keep long lists usable.
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const categories = [...new Set(partners.map((partner) => partner.category))];
  const filtered = filter === "all" ? partners : partners.filter((partner) => partner.category === filter);
  const visiblePartners = compact ? filtered.filter((partner) => partner.status === "Active").slice(0, 3) : filtered;

  return (
    <section className="px-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-black">Pontos de serviço</h2>
        <span className="text-xs font-black text-[#ff7a00]">{visiblePartners.length} locais</span>
      </div>

      {!compact && categories.length > 1 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setFilter("all")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${filter === "all" ? "bg-[#050505] text-white" : "bg-white text-[#77746f]"}`}>Todos</button>
          {categories.map((cat) => (
            <button key={cat} type="button" onClick={() => setFilter(cat === filter ? "all" : cat)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${filter === cat ? "bg-[#050505] text-white" : "bg-white text-[#77746f]"}`}>
              {partnerCategoryLabels[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-[8px] bg-white shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
        <div className="relative h-[180px] bg-[#101010]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:34px_34px]" />
          <div className="absolute left-[42%] top-0 h-full w-[18px] rotate-[18deg] bg-[#2f2f2a]" />
          <div className="absolute left-0 top-[48%] h-[16px] w-full -rotate-[8deg] bg-[#2f2f2a]" />
          <div className="absolute bottom-3 left-3 rounded-[8px] bg-white/92 px-3 py-2 text-xs font-black text-[#050505]">São Paulo</div>
          {visiblePartners.slice(0, 8).map((partner) => {
            const active = partner.status === "Active";
            const selected = partner.id === selectedId;
            return (
              <button
                key={partner.id}
                type="button"
                aria-label={`Ver detalhes de ${partner.name}`}
                onClick={() => setSelectedId(selected ? "" : partner.id)}
                className={`absolute grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-[0_10px_22px_rgba(0,0,0,0.25)] ring-4 ${selected ? "scale-110 ring-[#ff7a00]/70" : "ring-white/24"} ${active ? "bg-[#ff7a00] text-[#050505]" : "bg-white text-[#77746f]"}`}
                style={{ left: `${partner.x}%`, top: `${partner.y}%` }}
              >
                <MapPin size={20} fill="currentColor" />
              </button>
            );
          })}
        </div>
        <div className="grid max-h-[360px] gap-2 overflow-y-auto p-3">
          {visiblePartners.length === 0 && <div className="py-4 text-center text-sm font-bold text-[#77746f]">Nenhum ponto nesta categoria.</div>}
          {visiblePartners.map((partner) => (
            <PartnerMapRow key={partner.id} partner={partner} selected={partner.id === selectedId} onSelect={() => setSelectedId(partner.id === selectedId ? "" : partner.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerMapRow({ partner, selected, onSelect }: { partner: (typeof riderPartnerMap)[number]; selected: boolean; onSelect: () => void }) {
  const active = partner.status === "Active";

  return (
    <div className={`rounded-[8px] bg-[#f3f2ee] ${selected ? "ring-2 ring-[#ff7a00]" : ""}`}>
      {/* Tap 1: open details. Tap 2 (button below): open Google Maps. */}
      <button type="button" onClick={onSelect} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-black">{partner.name}</div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${active ? "bg-[#e8f6ee] text-[#20a65a]" : "bg-white text-[#77746f]"}`}>{active ? "Ativo" : "Em breve"}</span>
          </div>
          <div className="mt-0.5 truncate text-xs font-bold text-[#77746f]">
            {partnerCategoryLabels[partner.category] ?? partner.category} · {partner.bairro} · {partner.distance}
          </div>
        </div>
        <ChevronRight size={17} className={`text-[#77746f] transition-transform ${selected ? "rotate-90" : ""}`} />
      </button>

      {selected && (
        <div className="border-t border-white px-3 pb-3 pt-2.5">
          <div className="text-xs font-bold text-[#504e4a]">{partner.services}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#050505]">Seu desconto: {partner.discount}</span>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#77746f]">Partner +{partner.partnerPoints} pts</span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <a
              href={partner.navigationUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center justify-center gap-1.5 rounded-[8px] bg-[#050505] text-xs font-black text-white"
            >
              <Navigation size={14} /> Google Maps
            </a>
            <a href="/rider-app/scan" className="flex h-10 items-center justify-center gap-1.5 rounded-[8px] bg-[#ff7a00] text-xs font-black text-[#050505]">
              <QrCode size={14} /> Validar QR
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function getRiderTierScore(rider: { ar: number; nightShiftCount: number; incidentCount: number }) {
  const orderScore = Math.min(performanceToday.orders, 24) * 1.2;
  const tshScore = Math.min(performanceToday.tshHours, 10) * 2.2;
  const arScore = Math.max(0, performanceToday.ar - 70) * 1.4;
  const caaScore = Math.min(performanceToday.caaOrders, 8) * 3;
  const consistencyScore = Math.min(rider.nightShiftCount, 18) * 0.8;
  const incidentPenalty = rider.incidentCount * 8;
  return Math.round(orderScore + tshScore + arScore + caaScore + consistencyScore - incidentPenalty + 12);
}

function getRiderTierByScore(score: number) {
  if (score >= 108) {
    return {
      key: "diamond",
      label: "Diamond",
      stars: 5,
      cardClass: "bg-[linear-gradient(135deg,#07111f_0%,#123b53_38%,#d7fbff_100%)] shadow-[0_18px_46px_rgba(32,205,255,0.28)]",
      accentClass: "text-[#a8f3ff]",
      badgeClass: "bg-white/90 text-[#06131b] shadow-[0_0_26px_rgba(215,251,255,0.55)]",
      buttonClass: "bg-[#d7fbff] text-[#06131b]",
      patternClass: "bg-[radial-gradient(circle_at_78%_12%,rgba(255,255,255,0.58),transparent_22%),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:auto,28px_28px,28px_28px]",
      benefit: "Max perks",
      nextTarget: "Topo Diamond",
    };
  }
  if (score >= 100) {
    return {
      key: "gold",
      label: "Gold",
      stars: 4,
      cardClass: "bg-[linear-gradient(135deg,#1d1202_0%,#9a5b08_58%,#ffb238_100%)]",
      accentClass: "text-[#ffe2a3]",
      badgeClass: "bg-[#ffe2a3] text-[#1d1202]",
      buttonClass: "bg-[#ffb238] text-[#1d1202]",
      patternClass: "bg-[radial-gradient(circle_at_85%_20%,rgba(255,235,185,0.42),transparent_28%),repeating-linear-gradient(135deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_12px)]",
      benefit: "Fila premium",
      nextTarget: `${108 - score} pts para Diamond`,
    };
  }
  if (score >= 86) {
    return {
      key: "orange",
      label: "3 estrelas",
      stars: 3,
      cardClass: "bg-[linear-gradient(135deg,#120b05_0%,#783900_55%,#ff7a00_100%)]",
      accentClass: "text-[#ffb16a]",
      badgeClass: "bg-[#ff7a00] text-[#050505]",
      buttonClass: "bg-[#ff7a00] text-[#050505]",
      patternClass: "bg-[radial-gradient(circle_at_85%_16%,rgba(255,183,90,0.32),transparent_25%),repeating-linear-gradient(45deg,rgba(255,255,255,0.1)_0_1px,transparent_1px_14px)]",
      benefit: "Bonus pontos",
      nextTarget: `${100 - score} pts para Gold`,
    };
  }
  if (score >= 72) {
    return {
      key: "green",
      label: "2 estrelas",
      stars: 2,
      cardClass: "bg-[linear-gradient(135deg,#06150e_0%,#0f5130_64%,#20a65a_100%)]",
      accentClass: "text-[#91e8b4]",
      badgeClass: "bg-[#91e8b4] text-[#06150e]",
      buttonClass: "bg-[#20a65a] text-white",
      patternClass: "bg-[radial-gradient(circle_at_85%_18%,rgba(145,232,180,0.34),transparent_25%),repeating-linear-gradient(90deg,rgba(255,255,255,0.09)_0_1px,transparent_1px_16px)]",
      benefit: "Mais missoes",
      nextTarget: `${86 - score} pts para 3 estrelas`,
    };
  }
  return {
    key: "base",
    label: "1 estrela",
    stars: 1,
    cardClass: "bg-[#050505]",
    accentClass: "text-[#ff7a00]",
    badgeClass: "bg-[#ff7a00] text-[#050505]",
    buttonClass: "bg-[#ff7a00] text-[#050505]",
    patternClass: "bg-[radial-gradient(circle_at_85%_20%,rgba(255,122,0,0.28),transparent_28%),repeating-linear-gradient(135deg,rgba(255,122,0,0.18)_0_1px,transparent_1px_14px)]",
    benefit: "Base ativa",
    nextTarget: `${72 - score} pts para 2 estrelas`,
  };
}

function TierPreviewCard({ tier, metric, detail, threshold, active }: { tier: ReturnType<typeof getRiderTierByScore>; metric: string; detail: string; threshold: string; active?: boolean }) {
  return (
    <div className={`relative h-[138px] min-w-[148px] overflow-hidden rounded-[8px] p-3 text-white ${tier.cardClass} ${active ? "ring-2 ring-[#ff7a00] ring-offset-2 ring-offset-[#f3f2ee]" : ""}`}>
      <div className={`pointer-events-none absolute inset-0 ${tier.patternClass}`} />
      <div className="pointer-events-none absolute -right-10 top-7 h-24 w-24 rotate-45 rounded-[8px] border border-white/12" />
      {tier.key === "diamond" ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.26)_24%,transparent_40%,transparent_100%)]" />
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full border border-white/30" />
          <div className="pointer-events-none absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_16px_5px_rgba(255,255,255,0.78)]" />
        </>
      ) : null}
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className={`text-[10px] font-black uppercase tracking-[0.12em] ${tier.accentClass}`}>{metric}</div>
          <div className="mt-1 text-base font-black">{tier.label}</div>
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star key={index} size={11} fill={index < tier.stars ? "currentColor" : "none"} className={index < tier.stars ? "" : "opacity-35"} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/45">Score {threshold}</div>
          <div className="mt-1 text-[11px] font-bold text-white/72">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [pushState, setPushState] = useState<"idle" | "on" | "denied" | "unsupported">("idle");

  useEffect(() => {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) setPushState("unsupported");
    else if (Notification.permission === "granted") setPushState("on");
    else if (Notification.permission === "denied") setPushState("denied");
  }, []);

  async function enablePush() {
    try {
      const session = readSession();
      if (!session) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPushState("denied"); return; }
      const registration = await navigator.serviceWorker.ready;
      const { data } = await fetch("/api/push?publicKey").then((r) => r.json());
      const raw = atob(data.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const key = new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", riderName: session.name, subscription: subscription.toJSON() }),
      });
      setPushState("on");
    } catch {
      setPushState("denied");
    }
  }

  return (
    <section className="px-4 pt-4">
      <div className="rounded-[8px] bg-white p-3 shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#ff7a00]">Android push</div>
            <h2 className="text-lg font-black">Avisos importantes</h2>
          </div>
          {pushState === "on" ? (
            <span className="rounded-full bg-[#e8f8ee] px-3 py-1 text-[11px] font-black text-[#0a7d3b]">Notificações ativas</span>
          ) : pushState === "unsupported" ? (
            <MessageCircle size={20} className="text-[#050505]" />
          ) : (
            <button type="button" onClick={() => void enablePush()} className="rounded-full bg-[#ff7a00] px-3 py-1.5 text-[11px] font-black text-white">
              Ativar notificações
            </button>
          )}
        </div>
        <div className="grid gap-2">
          {inbox.map((item) => (
            <InboxItem key={item.title} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickAction({ icon, title, detail, strong = false }: { icon: React.ReactNode; title: string; detail: string; strong?: boolean }) {
  return (
    <button type="button" className={`min-h-[116px] rounded-[8px] p-3 text-left shadow-[0_12px_26px_rgba(0,0,0,0.06)] ${strong ? "bg-[#ff7a00] text-[#050505]" : "bg-white text-[#050505]"}`}>
      <div className={`grid h-10 w-10 place-items-center rounded-[8px] ${strong ? "bg-[#050505] text-white" : "bg-[#fff0e4] text-[#ff7a00]"}`}>{icon}</div>
      <div className="mt-3 text-sm font-black leading-4">{title}</div>
      <div className={`mt-1 text-xs font-bold leading-4 ${strong ? "text-black/68" : "text-[#77746f]"}`}>{detail}</div>
    </button>
  );
}

function BalanceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white p-3 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#77746f]">{label}</div>
      <div className="mt-2 text-lg font-black leading-5">{value}</div>
    </div>
  );
}

function LedgerRow({ title, detail, value, status }: { title: string; detail: string; value: string; status: string }) {
  const positive = value.startsWith("+");
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className="min-w-0">
        <div className="truncate text-sm font-black">{title}</div>
        <div className="mt-1 truncate text-xs font-bold text-[#77746f]">{detail}</div>
        <div className="mt-2 inline-flex rounded-full bg-[#f3f2ee] px-2.5 py-1 text-[10px] font-black uppercase text-[#77746f]">{status}</div>
      </div>
      <div className={`text-sm font-black ${positive ? "text-[#20a65a]" : "text-[#050505]"}`}>{value}</div>
    </div>
  );
}

function RulePill({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-[8px] p-2 ${dark ? "bg-white/10 text-white" : "bg-[#f3f2ee]"}`}>
      <div className={`text-[9px] font-black uppercase tracking-[0.08em] ${dark ? "text-white/48" : "text-[#77746f]"}`}>{label}</div>
      <div className="mt-1 text-xs font-black">{value}</div>
    </div>
  );
}

function ProductRow({ name, detail, price }: { name: string; detail: string; price: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className="min-w-0">
        <div className="truncate text-sm font-black">{name}</div>
        <div className="mt-1 truncate text-xs font-bold text-[#77746f]">{detail}</div>
      </div>
      <button type="button" className="rounded-[8px] bg-[#050505] px-3 py-2 text-xs font-black text-white">{price}</button>
    </div>
  );
}

function HelpAction({ title, detail, icon: Icon }: { title: string; detail: string; icon: React.ElementType }) {
  return (
    <button type="button" className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] bg-white p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className="grid h-11 w-11 place-items-center rounded-[8px] bg-[#fff0e4] text-[#ff7a00]">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-black">{title}</div>
        <div className="mt-0.5 truncate text-xs font-bold text-[#77746f]">{detail}</div>
      </div>
      <ChevronRight size={18} />
    </button>
  );
}

function WalletCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-1 text-base font-black">{value}</div>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white/10 px-2 py-1.5 text-center ring-1 ring-white/10">
      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-white/42">{label}</div>
      <div className="mt-0.5 text-xs font-black text-white">{value}</div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ElementType; tone: string }) {
  const toneClass = tone === "orange" ? "bg-[#fff0e4] text-[#ff7a00]" : tone === "green" ? "bg-[#e8f6ee] text-[#20a65a]" : "bg-[#eeeeea] text-[#050505]";

  return (
    <div className="rounded-[8px] bg-white p-3 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
      <div className={`grid h-9 w-9 place-items-center rounded-[8px] ${toneClass}`}>
        <Icon size={18} />
      </div>
      <div className="mt-3 text-xl font-black leading-5">{value}</div>
      <div className="mt-1 min-h-8 text-xs font-bold leading-4 text-[#77746f]">{label}</div>
    </div>
  );
}

function StatusRow({ icon, title, detail, value, danger = false }: { icon: React.ReactNode; title: string; detail: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[8px] ${danger ? "bg-[#ffe5e3] text-[#e53935]" : "bg-[#fff0e4] text-[#ff7a00]"}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black">{title}</div>
        <div className="mt-0.5 truncate text-xs font-bold text-[#77746f]">{detail}</div>
      </div>
      <div className={`rounded-full px-2.5 py-1 text-xs font-black ${danger ? "bg-[#e53935] text-white" : "bg-[#e8f6ee] text-[#20a65a]"}`}>{value}</div>
    </div>
  );
}

function MissionCard({ title, reward, progress }: { title: string; reward: string; progress: number }) {
  return (
    <div className="rounded-[8px] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-black text-[#20a65a]">
            <TrendingUp size={14} />
            {reward}
          </div>
        </div>
        <div className="text-lg font-black text-[#ff7a00]">{progress}%</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#ece8df]">
        <div className="h-2 rounded-full bg-[#ff7a00]" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function InboxItem({ title, detail, time }: { title: string; detail: string; time: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[8px] bg-[#f3f2ee] p-3">
      <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#050505] text-white">
        <Clock3 size={17} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-black">{title}</div>
        <div className="mt-0.5 text-xs font-bold leading-4 text-[#77746f]">{detail}</div>
      </div>
      <span className="text-[11px] font-black text-[#ff7a00]">{time}</span>
    </div>
  );
}

function Tab({ icon, label, href, active = false }: { icon: React.ReactNode; label: string; href: string; active?: boolean }) {
  return (
    <a href={href} className={active ? "flex flex-col items-center gap-1 rounded-[8px] bg-[#ff7a00] py-2 text-[#050505]" : "flex flex-col items-center gap-1 rounded-[8px] py-2 text-white/62"}>
      {icon}
      <span className="text-[10px] font-black">{label}</span>
    </a>
  );
}
