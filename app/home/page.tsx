"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bike,
  Building2,
  CheckCircle2,
  Handshake,
  MapPinned,
  Network,
  ShieldCheck,
  Store,
  Warehouse,
} from "lucide-react";

type Lang = "pt" | "zh" | "en";
type LeadKind = "franchise" | "partner";

const copy = {
  pt: {
    nav: { ecosystem: "Ecossistema", franchise: "Franquia", partner: "Parceiros", rider: "Entregadores", login: "Entrar nos sistemas" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "A rede de pontos que profissionaliza a última milha no Brasil",
      subtitle:
        "MePonto conecta pontos de apoio, líderes locais, entregadores, lojistas e fornecedores em um único sistema operacional — com escala, segurança e dados.",
      ctaFranchise: "Quero ser franqueado",
      ctaRider: "Quero ser entregador",
      stats: [
        { value: "São Paulo", label: "Operação em expansão" },
        { value: "7 sistemas", label: "Um ecossistema integrado" },
        { value: "24/7", label: "Operação dia e noite" },
        { value: "3 idiomas", label: "PT · EN · 中文" },
      ],
    },
    ecosystem: {
      eyebrow: "O ecossistema",
      title: "Um sistema operacional, não páginas isoladas",
      cards: [
        { title: "PontoSys", text: "Console de operação: rede de pontos, escalas, incidentes, finanças, auditoria e risco em tempo real." },
        { title: "Rede de Pontos", text: "Pontos de apoio físicos com líderes locais, cobertura noturna e padrão operacional auditável." },
        { title: "Entregadores", text: "App com escala semanal, pontos, recompensas e benefícios reais em parceiros credenciados." },
        { title: "PontoMall + Parceiros", text: "Shopping de pontos, oficinas, postos e fornecedores — a economia que sustenta a rede." },
      ],
    },
    franchise: {
      eyebrow: "Para investidores",
      title: "Opere um território com um sistema completo",
      bullets: [
        "Modelo de negócio validado com receita por ponto e por serviços",
        "Sistema completo: operação, finanças, escala, risco e auditoria",
        "Treinamento, SOPs e suporte da rede MePonto",
        "Painel financeiro com simulador de lucro por cenário",
      ],
      cta: "Receber proposta de franquia",
    },
    partner: {
      eyebrow: "Para comércios e fornecedores",
      title: "Sua loja dentro da economia MePonto",
      bullets: [
        "Oficinas, postos e lojas atendem entregadores com demanda garantida",
        "Pontos e benefícios trazem o entregador de volta sempre",
        "Fornecedores vendem para toda a rede pelo PontoMall",
        "Liquidação transparente em sistema de razão (ledger)",
      ],
      cta: "Quero ser parceiro",
    },
    rider: {
      eyebrow: "Para entregadores",
      title: "Mais que corridas: estrutura, pontos e respeito",
      bullets: [
        "Ponto de apoio físico com líder, água, banheiro e segurança",
        "Escala semanal transparente direto no app",
        "Pontos por entrega trocáveis em produtos e serviços",
        "Descontos reais em oficinas e postos parceiros",
      ],
      cta: "Acessar o app do entregador",
    },
    form: {
      title: "Fale com a nossa equipe",
      subtitle: "Resposta em até 1 dia útil.",
      kindFranchise: "Quero uma franquia",
      kindPartner: "Quero ser parceiro/fornecedor",
      name: "Nome completo",
      phone: "WhatsApp / telefone",
      email: "E-mail (opcional)",
      city: "Cidade",
      message: "Conte rapidamente seu interesse",
      submit: "Enviar",
      sending: "Enviando...",
      success: "Recebido! Nossa equipe vai falar com você em breve.",
      error: "Não foi possível enviar. Tente novamente.",
      required: "Preencha nome e telefone.",
    },
    footer: {
      systems: "Acesso aos sistemas",
      contact: "Contato",
      rights: "MePonto · Conectar · Apoiar · Entregar",
    },
  },
  zh: {
    nav: { ecosystem: "生态系统", franchise: "加盟", partner: "合作伙伴", rider: "骑手", login: "登录各系统" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "让巴西末端配送专业化的站点网络",
      subtitle: "MePonto 把站点、站长、骑手、商户与供应商连接进同一个运营系统——规模化、安全、数据驱动。",
      ctaFranchise: "我要加盟",
      ctaRider: "我要成为骑手",
      stats: [
        { value: "圣保罗", label: "运营持续扩张" },
        { value: "7 大系统", label: "一体化生态" },
        { value: "24/7", label: "日夜运营" },
        { value: "3 种语言", label: "PT · EN · 中文" },
      ],
    },
    ecosystem: {
      eyebrow: "生态系统",
      title: "一个操作系统，而不是一堆孤立页面",
      cards: [
        { title: "PontoSys", text: "运营总台：站点网络、排班、事故、财务、审计与风控实时一体。" },
        { title: "站点网络", text: "实体站点 + 本地站长，夜间覆盖与可审计的运营标准。" },
        { title: "骑手", text: "骑手 App：周排班、积分、奖励与合作商户的真实福利。" },
        { title: "PontoMall + 合作伙伴", text: "积分商城、维修店、加油站与供应商——支撑网络的经济体。" },
      ],
    },
    franchise: {
      eyebrow: "面向投资人",
      title: "用一套完整系统运营一个区域",
      bullets: [
        "经过验证的商业模式：站点收入 + 服务收入",
        "系统完备：运营、财务、排班、风控、审计",
        "MePonto 网络提供培训、SOP 与支持",
        "财务面板内置多场景利润模拟器",
      ],
      cta: "获取加盟方案",
    },
    partner: {
      eyebrow: "面向商户与供应商",
      title: "把你的门店接入 MePonto 经济体",
      bullets: [
        "维修店、加油站、门店获得稳定的骑手客流",
        "积分与福利让骑手持续回流",
        "供应商通过 PontoMall 面向全网销售",
        "账本式（ledger）结算，透明可查",
      ],
      cta: "申请成为合作伙伴",
    },
    rider: {
      eyebrow: "面向骑手",
      title: "不只是接单：有据点、有积分、有尊重",
      bullets: [
        "实体站点：站长、饮水、卫生间与安全保障",
        "App 内透明的每周排班",
        "每单积分，可兑换商品与服务",
        "合作维修店、加油站真实折扣",
      ],
      cta: "进入骑手 App",
    },
    form: {
      title: "联系我们的团队",
      subtitle: "1 个工作日内回复。",
      kindFranchise: "我想加盟",
      kindPartner: "我想成为合作伙伴/供应商",
      name: "姓名",
      phone: "WhatsApp / 电话",
      email: "邮箱（选填）",
      city: "城市",
      message: "简单说明你的需求",
      submit: "提交",
      sending: "提交中...",
      success: "已收到！我们会尽快与你联系。",
      error: "提交失败，请重试。",
      required: "请填写姓名和电话。",
    },
    footer: { systems: "系统入口", contact: "联系方式", rights: "MePonto · Conectar · Apoiar · Entregar" },
  },
  en: {
    nav: { ecosystem: "Ecosystem", franchise: "Franchise", partner: "Partners", rider: "Riders", login: "System login" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "The support-point network professionalizing last-mile delivery in Brazil",
      subtitle:
        "MePonto connects support points, local leaders, riders, merchants and suppliers in one operating system — with scale, safety and data.",
      ctaFranchise: "Become a franchisee",
      ctaRider: "Become a rider",
      stats: [
        { value: "São Paulo", label: "Expanding operation" },
        { value: "7 systems", label: "One integrated ecosystem" },
        { value: "24/7", label: "Day and night operation" },
        { value: "3 languages", label: "PT · EN · 中文" },
      ],
    },
    ecosystem: {
      eyebrow: "The ecosystem",
      title: "An operating system, not isolated pages",
      cards: [
        { title: "PontoSys", text: "Operations console: point network, shifts, incidents, finance, audit and risk in real time." },
        { title: "Point Network", text: "Physical support points with local leaders, night coverage and auditable standards." },
        { title: "Riders", text: "Rider app with weekly shifts, points, rewards and real benefits at accredited partners." },
        { title: "PontoMall + Partners", text: "Points mall, repair shops, gas stations and suppliers — the economy behind the network." },
      ],
    },
    franchise: {
      eyebrow: "For investors",
      title: "Run a territory with a complete system",
      bullets: [
        "Validated business model: revenue per point and per service",
        "Full stack: operations, finance, shifts, risk and audit",
        "Training, SOPs and support from the MePonto network",
        "Finance panel with scenario-based profit simulator",
      ],
      cta: "Get the franchise deck",
    },
    partner: {
      eyebrow: "For merchants & suppliers",
      title: "Your store inside the MePonto economy",
      bullets: [
        "Repair shops, gas stations and stores get steady rider demand",
        "Points and benefits keep riders coming back",
        "Suppliers sell to the whole network through PontoMall",
        "Transparent ledger-based settlement",
      ],
      cta: "Apply as a partner",
    },
    rider: {
      eyebrow: "For riders",
      title: "More than gigs: structure, points and respect",
      bullets: [
        "Physical support point with leader, water, restroom and safety",
        "Transparent weekly shifts in the app",
        "Points per delivery, redeemable for products and services",
        "Real discounts at partner shops and stations",
      ],
      cta: "Open the rider app",
    },
    form: {
      title: "Talk to our team",
      subtitle: "Reply within 1 business day.",
      kindFranchise: "I want a franchise",
      kindPartner: "I want to be a partner/supplier",
      name: "Full name",
      phone: "WhatsApp / phone",
      email: "E-mail (optional)",
      city: "City",
      message: "Briefly describe your interest",
      submit: "Send",
      sending: "Sending...",
      success: "Received! Our team will contact you soon.",
      error: "Could not send. Please try again.",
      required: "Name and phone are required.",
    },
    footer: { systems: "System access", contact: "Contact", rights: "MePonto · Conectar · Apoiar · Entregar" },
  },
} as const;

const systemLinks = [
  { label: "PontoSys", href: "https://sys.meponto.com" },
  { label: "Franquia", href: "https://franchise.meponto.com" },
  { label: "Ponto / Líder", href: "https://ponto.meponto.com" },
  { label: "Rider App", href: "https://app.meponto.com" },
  { label: "PontoMall", href: "https://mall.meponto.com" },
  { label: "Partner", href: "https://partner.meponto.com" },
  { label: "Supplier", href: "https://supplier.meponto.com" },
];

const sectionIcons = [Network, MapPinned, Bike, Store];

export default function MarketingHomePage() {
  const [lang, setLang] = useState<Lang>("pt");
  const [kind, setKind] = useState<LeadKind>("franchise");
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "ok" | "fail" | "invalid">("idle");
  const t = copy[lang];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setState("invalid");
      return;
    }
    setState("sending");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, language: lang, ...form }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("ok");
      setForm({ name: "", phone: "", email: "", city: "", message: "" });
    } catch {
      setState("fail");
    }
  }

  const input =
    "h-12 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(7,9,13,0.92)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-logo.svg" alt="MePonto" className="h-9 w-auto" />
          </div>
          <nav className="hidden items-center gap-5 text-xs font-black uppercase tracking-wide text-[var(--muted-strong)] md:flex">
            <a href="#ecosystem" className="hover:text-[var(--accent)]">{t.nav.ecosystem}</a>
            <a href="#franchise" className="hover:text-[var(--accent)]">{t.nav.franchise}</a>
            <a href="#partner" className="hover:text-[var(--accent)]">{t.nav.partner}</a>
            <a href="#rider" className="hover:text-[var(--accent)]">{t.nav.rider}</a>
          </nav>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-[8px] border border-[var(--line)]">
              {(["pt", "en", "zh"] as Lang[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`px-2.5 py-1.5 text-[11px] font-black uppercase ${lang === code ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
                >
                  {code === "zh" ? "中" : code.toUpperCase()}
                </button>
              ))}
            </div>
            <a href="/login" className="hidden rounded-[8px] border border-[var(--line)] px-3 py-2 text-[11px] font-black uppercase text-[var(--text-soft)] hover:border-[var(--accent)] sm:block">
              {t.nav.login}
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-[var(--accent-glow)] blur-3xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line-alpha)] bg-[var(--surface)] px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">
            <ShieldCheck size={14} /> {t.hero.eyebrow}
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight md:text-6xl">{t.hero.title}</h1>
          <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-[var(--muted-strong)] md:text-lg">{t.hero.subtitle}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#contact" onClick={() => setKind("franchise")} className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
              <Building2 size={18} /> {t.hero.ctaFranchise} <ArrowRight size={16} />
            </a>
            <a href="https://app.meponto.com" className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent)] hover:bg-[var(--accent-glow)]">
              <Bike size={18} /> {t.hero.ctaRider}
            </a>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-4">
            {t.hero.stats.map((stat) => (
              <div key={stat.label} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-xl font-black text-[var(--accent)]">{stat.value}</div>
                <div className="mt-1 text-xs font-bold text-[var(--muted)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem */}
      <section id="ecosystem" className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{t.ecosystem.eyebrow}</div>
          <h2 className="mt-3 max-w-3xl text-3xl font-black md:text-4xl">{t.ecosystem.title}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {t.ecosystem.cards.map((card, index) => {
              const Icon = sectionIcons[index];
              return (
                <div key={card.title} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                  <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-[var(--accent-glow)] text-[var(--accent)]">
                    <Icon size={22} />
                  </div>
                  <div className="mt-4 text-lg font-black">{card.title}</div>
                  <p className="mt-2 text-sm font-bold leading-6 text-[var(--muted-strong)]">{card.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Audience sections */}
      {(
        [
          { id: "franchise", icon: Warehouse, data: t.franchise, cta: { href: "#contact", kind: "franchise" as LeadKind } },
          { id: "partner", icon: Handshake, data: t.partner, cta: { href: "#contact", kind: "partner" as LeadKind } },
          { id: "rider", icon: Bike, data: t.rider, cta: { href: "https://app.meponto.com" } },
        ] as const
      ).map((section, index) => (
        <section key={section.id} id={section.id} className={index % 2 === 0 ? "" : "bg-[var(--surface)]"}>
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>
              <div className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{section.data.eyebrow}</div>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">{section.data.title}</h2>
              <ul className="mt-6 space-y-3">
                {section.data.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3 text-sm font-bold leading-6 text-[var(--text-soft)]">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {bullet}
                  </li>
                ))}
              </ul>
              <a
                href={section.cta.href}
                onClick={"kind" in section.cta ? () => setKind((section.cta as { kind: LeadKind }).kind) : undefined}
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
              >
                {section.data.cta} <ArrowRight size={16} />
              </a>
            </div>
            <div className={`rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] p-8 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
              <section.icon size={64} className="text-[var(--accent)]" />
              <div className="mt-6 h-2 w-2/3 rounded bg-[var(--accent-glow)]" />
              <div className="mt-3 h-2 w-1/2 rounded bg-[var(--line)]" />
              <div className="mt-3 h-2 w-3/4 rounded bg-[var(--line)]" />
              <div className="mt-8 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((cell) => (
                  <div key={cell} className="h-16 rounded-[8px] border border-[var(--line)] bg-[var(--surface)]" />
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Contact form */}
      <section id="contact" className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-black md:text-4xl">{t.form.title}</h2>
          <p className="mt-2 text-sm font-bold text-[var(--muted-strong)]">{t.form.subtitle}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { value: "franchise", label: t.form.kindFranchise },
                  { value: "partner", label: t.form.kindPartner },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={`h-12 rounded-[8px] border px-4 text-sm font-black ${kind === option.value ? "border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--muted)]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <input className={input} placeholder={t.form.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={input} placeholder={t.form.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className={input} placeholder={t.form.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className={input} placeholder={t.form.city} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <textarea
              className="min-h-28 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              placeholder={t.form.message}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
            {/* Honeypot field — invisible to humans */}
            <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            <button
              type="submit"
              disabled={state === "sending"}
              className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-8 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-60"
            >
              {state === "sending" ? t.form.sending : t.form.submit} <ArrowRight size={16} />
            </button>

            {state === "ok" && <div className="rounded-[8px] border border-[var(--ok)] bg-[var(--ok-bg)] px-4 py-3 text-sm font-black text-[var(--ok-ink)]">{t.form.success}</div>}
            {state === "fail" && <div className="rounded-[8px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-black text-[var(--danger-ink)]">{t.form.error}</div>}
            {state === "invalid" && <div className="rounded-[8px] border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3 text-sm font-black text-[var(--warning-ink)]">{t.form.required}</div>}
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-logo.svg" alt="MePonto" className="h-9 w-auto" />
            <p className="mt-4 text-xs font-bold leading-6 text-[var(--muted)]">{t.footer.rights}</p>
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{t.footer.systems}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {systemLinks.map((link) => (
                <a key={link.href} href={link.href} className="text-sm font-bold text-[var(--muted-strong)] hover:text-[var(--accent)]">
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{t.footer.contact}</div>
            <div className="mt-4 space-y-2 text-sm font-bold text-[var(--muted-strong)]">
              <div>contato@meponto.com</div>
              <div>São Paulo · Brasil</div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
