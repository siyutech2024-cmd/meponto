"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bike, Building2, CheckCircle2, Clock4, Coins, MapPinned, ShieldCheck, Users } from "lucide-react";

type Lang = "pt" | "zh" | "en";

const copy = {
  pt: {
    nav: { rider: "Entregadores", franchise: "Franquia" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "A rede de pontos que profissionaliza a última milha no Brasil",
      subtitle:
        "Pontos de apoio físicos, líderes locais, escala transparente e pontos que viram benefícios reais. Estamos recrutando entregadores e franqueados.",
      ctaFranchise: "Quero ser franqueado",
      ctaRider: "Quero ser entregador",
      stats: [
        { value: "São Paulo", label: "Operação em expansão" },
        { value: 24, suffix: "/7", label: "Operação dia e noite" },
        { value: 100, suffix: "%", label: "Escala transparente no app" },
        { value: 3, suffix: " idiomas", label: "PT · EN · 中文" },
      ],
    },
    rider: {
      eyebrow: "Recrutamento de entregadores",
      title: "Mais que corridas: estrutura, pontos e respeito",
      bullets: [
        "Ponto de apoio físico com líder, água, banheiro e segurança",
        "Escala semanal transparente direto no app",
        "Pontos por entrega trocáveis em produtos e serviços",
        "Descontos reais em oficinas e postos parceiros",
        "Cobertura noturna organizada com adicional",
      ],
      cta: "Acessar o app do entregador",
      cards: [
        { icon: "map", title: "Ponto de apoio", text: "Base física no seu bairro" },
        { icon: "clock", title: "Escala semanal", text: "Você escolhe seus turnos" },
        { icon: "coins", title: "Pontos", text: "Cada entrega vira benefício" },
        { icon: "shield", title: "Segurança", text: "Líder e rede de apoio 24/7" },
      ],
    },
    franchise: {
      eyebrow: "Recrutamento de franqueados",
      title: "Opere um território com um sistema completo",
      bullets: [
        "Modelo validado: receita por ponto e por serviços",
        "Sistema completo de operação, finanças, escala e auditoria",
        "Treinamento, SOPs e suporte da rede MePonto",
        "Simulador de lucro por cenário incluído",
        "Território exclusivo com rede de entregadores ativa",
      ],
      cta: "Receber proposta de franquia",
    },
    form: {
      title: "Quero ser franqueado",
      subtitle: "Deixe seus dados — resposta em até 1 dia útil.",
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
    footer: { contact: "Contato", rights: "MePonto · Conectar · Apoiar · Entregar" },
  },
  zh: {
    nav: { rider: "骑手招募", franchise: "加盟招募" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "让巴西末端配送专业化的站点网络",
      subtitle: "实体站点、本地站长、透明排班、积分变真实福利。我们正在招募骑手与加盟商。",
      ctaFranchise: "我要加盟",
      ctaRider: "我要成为骑手",
      stats: [
        { value: "圣保罗", label: "运营持续扩张" },
        { value: 24, suffix: "/7", label: "日夜运营" },
        { value: 100, suffix: "%", label: "App 内透明排班" },
        { value: 3, suffix: " 种语言", label: "PT · EN · 中文" },
      ],
    },
    rider: {
      eyebrow: "骑手招募",
      title: "不只是接单：有据点、有积分、有尊重",
      bullets: [
        "实体站点：站长、饮水、卫生间与安全保障",
        "App 内透明的每周排班",
        "每单积分，可兑换商品与服务",
        "合作维修店、加油站真实折扣",
        "夜班有组织、有补贴",
      ],
      cta: "进入骑手 App",
      cards: [
        { icon: "map", title: "支持站点", text: "你所在街区的实体基地" },
        { icon: "clock", title: "每周排班", text: "自己选择班次" },
        { icon: "coins", title: "积分", text: "每一单都变成福利" },
        { icon: "shield", title: "安全", text: "站长与 24/7 支持网络" },
      ],
    },
    franchise: {
      eyebrow: "加盟商招募",
      title: "用一套完整系统运营一个区域",
      bullets: [
        "经过验证的模式：站点收入 + 服务收入",
        "运营、财务、排班、审计系统完备",
        "MePonto 网络提供培训、SOP 与支持",
        "内置多场景利润模拟器",
        "独家区域 + 活跃骑手网络",
      ],
      cta: "获取加盟方案",
    },
    form: {
      title: "申请加盟",
      subtitle: "留下信息，1 个工作日内回复。",
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
    footer: { contact: "联系方式", rights: "MePonto · Conectar · Apoiar · Entregar" },
  },
  en: {
    nav: { rider: "Riders", franchise: "Franchise" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "The support-point network professionalizing last-mile delivery in Brazil",
      subtitle:
        "Physical support points, local leaders, transparent shifts and points that become real benefits. We are recruiting riders and franchisees.",
      ctaFranchise: "Become a franchisee",
      ctaRider: "Become a rider",
      stats: [
        { value: "São Paulo", label: "Expanding operation" },
        { value: 24, suffix: "/7", label: "Day and night operation" },
        { value: 100, suffix: "%", label: "Transparent shifts in-app" },
        { value: 3, suffix: " languages", label: "PT · EN · 中文" },
      ],
    },
    rider: {
      eyebrow: "Rider recruitment",
      title: "More than gigs: structure, points and respect",
      bullets: [
        "Physical support point with leader, water, restroom and safety",
        "Transparent weekly shifts in the app",
        "Points per delivery, redeemable for products and services",
        "Real discounts at partner shops and stations",
        "Organized night coverage with extra pay",
      ],
      cta: "Open the rider app",
      cards: [
        { icon: "map", title: "Support point", text: "A physical base in your area" },
        { icon: "clock", title: "Weekly shifts", text: "You pick your slots" },
        { icon: "coins", title: "Points", text: "Every delivery becomes a benefit" },
        { icon: "shield", title: "Safety", text: "Leader and 24/7 support network" },
      ],
    },
    franchise: {
      eyebrow: "Franchisee recruitment",
      title: "Run a territory with a complete system",
      bullets: [
        "Validated model: revenue per point and per service",
        "Full operations, finance, shifts and audit stack",
        "Training, SOPs and support from the MePonto network",
        "Scenario-based profit simulator included",
        "Exclusive territory with an active rider network",
      ],
      cta: "Get the franchise deck",
    },
    form: {
      title: "Become a franchisee",
      subtitle: "Leave your details — reply within 1 business day.",
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
    footer: { contact: "Contact", rights: "MePonto · Conectar · Apoiar · Entregar" },
  },
} as const;

const cardIcons = { map: MapPinned, clock: Clock4, coins: Coins, shield: ShieldCheck } as const;

/** Animated counter that counts up once when it enters the viewport. */
function StatValue({ value, suffix }: { value: string | number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(typeof value === "number" ? 0 : value);

  useEffect(() => {
    if (typeof value !== "number") return;
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1100;
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      {display}
      {suffix ?? ""}
    </span>
  );
}

export default function MarketingHomePage() {
  const [lang, setLang] = useState<Lang>("pt");
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "ok" | "fail" | "invalid">("idle");
  const rootRef = useRef<HTMLElement>(null);
  const t = copy[lang];

  // Scroll-linked reveal animations: one IntersectionObserver, unobserve after
  // reveal — no animation library, no continuous scroll listener.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.querySelectorAll(".rv").forEach((el) => el.classList.add("rv-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("rv-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
    );
    root.querySelectorAll(".rv").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lang]);

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
        body: JSON.stringify({ type: "franchise", language: lang, ...form }),
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
    <main ref={rootRef} className="min-h-screen overflow-x-clip bg-[var(--background)] text-[var(--text)]">
      <style>{`
        .rv { opacity: 0; transform: translateY(26px); transition: opacity .65s ease, transform .65s cubic-bezier(.16,1,.3,1); transition-delay: var(--d, 0ms); will-change: opacity, transform; }
        .rv-in { opacity: 1; transform: none; }
        @keyframes mp-float { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-40px,30px,0) scale(1.12); } }
        @keyframes mp-float2 { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(50px,-24px,0) scale(.92); } }
        .mp-glow { animation: mp-float 14s ease-in-out infinite; }
        .mp-glow2 { animation: mp-float2 18s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .rv { transition: none; } .mp-glow, .mp-glow2 { animation: none; } }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(7,9,13,0.92)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-logo.png" alt="MePonto" translate="no" className="h-10 w-auto" />
          <nav className="hidden items-center gap-5 text-xs font-black uppercase tracking-wide text-[var(--muted-strong)] md:flex">
            <a href="#rider" className="hover:text-[var(--accent)]">{t.nav.rider}</a>
            <a href="#franchise" className="hover:text-[var(--accent)]">{t.nav.franchise}</a>
          </nav>
          <div translate="no" className="flex overflow-hidden rounded-[8px] border border-[var(--line)]">
            {(["pt", "en", "zh"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`px-2.5 py-1.5 text-[11px] font-black uppercase ${lang === code ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
              >
                {code === "zh" ? "中文" : code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mp-glow pointer-events-none absolute -top-36 right-[-12%] h-[420px] w-[420px] rounded-full bg-[var(--accent-glow)] blur-3xl" />
        <div className="mp-glow2 pointer-events-none absolute bottom-[-30%] left-[-10%] h-96 w-96 rounded-full bg-[var(--cyan-glow)] blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="rv inline-flex items-center gap-2 rounded-full border border-[var(--line-alpha)] bg-[var(--surface)] px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">
            <ShieldCheck size={14} /> <span translate="no">{t.hero.eyebrow}</span>
          </div>
          <h1 className="rv mt-6 max-w-4xl text-4xl font-black leading-tight md:text-6xl" style={{ ["--d" as never]: "90ms" }}>
            {t.hero.title}
          </h1>
          <p className="rv mt-5 max-w-2xl text-base font-bold leading-7 text-[var(--muted-strong)] md:text-lg" style={{ ["--d" as never]: "180ms" }}>
            {t.hero.subtitle}
          </p>

          <div className="rv mt-8 flex flex-wrap gap-3" style={{ ["--d" as never]: "260ms" }}>
            <a href="#contact" className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] transition-transform hover:scale-[1.03] hover:bg-[var(--accent-strong)]">
              <Building2 size={18} /> {t.hero.ctaFranchise} <ArrowRight size={16} />
            </a>
            <a href="https://app.meponto.com" className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent)] transition-transform hover:scale-[1.03] hover:bg-[var(--accent-glow)]">
              <Bike size={18} /> {t.hero.ctaRider}
            </a>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-4">
            {t.hero.stats.map((stat, index) => (
              <div key={stat.label} className="rv rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-4" style={{ ["--d" as never]: `${320 + index * 90}ms` }}>
                <div className="text-xl font-black text-[var(--accent)]">
                  <StatValue value={stat.value} suffix={"suffix" in stat ? (stat as { suffix?: string }).suffix : undefined} />
                </div>
                <div className="mt-1 text-xs font-bold text-[var(--muted)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rider recruitment */}
      <section id="rider" className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="rv text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{t.rider.eyebrow}</div>
            <h2 className="rv mt-3 text-3xl font-black md:text-4xl" style={{ ["--d" as never]: "80ms" }}>{t.rider.title}</h2>
            <ul className="mt-6 space-y-3">
              {t.rider.bullets.map((bullet, index) => (
                <li key={bullet} className="rv flex items-start gap-3 text-sm font-bold leading-6 text-[var(--text-soft)]" style={{ ["--d" as never]: `${140 + index * 70}ms` }}>
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {bullet}
                </li>
              ))}
            </ul>
            <a href="https://app.meponto.com" className="rv mt-8 inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] transition-transform hover:scale-[1.03] hover:bg-[var(--accent-strong)]" style={{ ["--d" as never]: "500ms" }}>
              <Bike size={18} /> {t.rider.cta} <ArrowRight size={16} />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {t.rider.cards.map((card, index) => {
              const Icon = cardIcons[card.icon as keyof typeof cardIcons];
              return (
                <div key={card.title} className="rv rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 transition-transform hover:-translate-y-1" style={{ ["--d" as never]: `${120 + index * 110}ms` }}>
                  <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-[var(--accent-glow)] text-[var(--accent)]">
                    <Icon size={22} />
                  </div>
                  <div className="mt-4 text-base font-black">{card.title}</div>
                  <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted-strong)]">{card.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Franchise recruitment */}
      <section id="franchise">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <div className="rv rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] p-8">
              <Users size={56} className="text-[var(--accent)]" />
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[68, 44, 84].map((height, index) => (
                  <div key={index} className="flex h-28 items-end rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-2">
                    <div className="w-full rounded bg-[var(--accent-glow)]" style={{ height: `${height}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-4 h-2 w-2/3 rounded bg-[var(--accent-glow)]" />
              <div className="mt-2 h-2 w-1/2 rounded bg-[var(--line)]" />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <div className="rv text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{t.franchise.eyebrow}</div>
            <h2 className="rv mt-3 text-3xl font-black md:text-4xl" style={{ ["--d" as never]: "80ms" }}>{t.franchise.title}</h2>
            <ul className="mt-6 space-y-3">
              {t.franchise.bullets.map((bullet, index) => (
                <li key={bullet} className="rv flex items-start gap-3 text-sm font-bold leading-6 text-[var(--text-soft)]" style={{ ["--d" as never]: `${140 + index * 70}ms` }}>
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {bullet}
                </li>
              ))}
            </ul>
            <a href="#contact" className="rv mt-8 inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] transition-transform hover:scale-[1.03] hover:bg-[var(--accent-strong)]" style={{ ["--d" as never]: "500ms" }}>
              <Building2 size={18} /> {t.franchise.cta} <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* Franchise lead form */}
      <section id="contact" className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="rv text-3xl font-black md:text-4xl">{t.form.title}</h2>
          <p className="rv mt-2 text-sm font-bold text-[var(--muted-strong)]" style={{ ["--d" as never]: "80ms" }}>{t.form.subtitle}</p>

          <form onSubmit={submit} className="rv mt-8 space-y-4" style={{ ["--d" as never]: "160ms" }}>
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
              className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-8 text-sm font-black uppercase text-[var(--accent-ink)] transition-transform hover:scale-[1.03] hover:bg-[var(--accent-strong)] disabled:opacity-60"
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
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-logo.png" alt="MePonto" translate="no" className="h-9 w-auto" />
            <p className="mt-3 text-xs font-bold text-[var(--muted)]" translate="no">{t.footer.rights}</p>
          </div>
          <div className="text-sm font-bold text-[var(--muted-strong)]">
            <div className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">{t.footer.contact}</div>
            <div className="mt-2" translate="no">contato@meponto.com</div>
            <div>São Paulo · Brasil</div>
          </div>
        </div>
      </footer>
    </main>
  );
}
