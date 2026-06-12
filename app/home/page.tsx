"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * MePonto marketing homepage — scroll-driven narrative over a code-drawn
 * Brazil network map (no images, no animation libraries).
 *
 * Fixed SVG Brazil map background (glowing country outline, capital hubs,
 * flowing delivery corridors radiating from São Paulo, live marker plates)
 * → full-screen chapters that dive the camera into the Southeast as you
 * scroll → CTA finale + footer. No loader: the map is visible instantly.
 */

type Lang = "pt" | "zh" | "en";

const copy: Record<Lang, {
  loading: string;
  pontos: string;
  chapters: Array<{ tag: string; title: string[]; text: string; cta?: { label: string; href: string } }>;
  finale: { title: string[]; text: string; rider: string; franchise: string };
  footer: { tagline: string; systems: Array<{ label: string; href: string }> };
}> = {
  pt: {
    loading: "Carregando a rede",
    pontos: "PONTOS",
    chapters: [
      {
        tag: "Rede",
        title: ["Construímos", "a rede da", "última milha"],
        text: "Pontos de apoio físicos espalhados por São Paulo: líder local, água, banheiro, segurança — uma rede que cresce todos os dias.",
        cta: { label: "Conhecer a rede", href: "https://app.meponto.com" },
      },
      {
        tag: "Turnos",
        title: ["Escala", "transparente,", "renda real"],
        text: "Turnos semanais direto no app, regras claras e acerto na conta. Você escolhe quando rodar — a gente organiza o resto.",
        cta: { label: "Quero entregar", href: "https://app.meponto.com/rider-login" },
      },
      {
        tag: "PontoMall",
        title: ["Cada entrega", "vira", "benefício"],
        text: "Pedidos viram pontos, pontos viram produtos, serviços e descontos reais em parceiros do seu bairro. Sem pegadinha.",
        cta: { label: "Ver o PontoMall", href: "https://mall.meponto.com" },
      },
      {
        tag: "Parceria",
        title: ["Opere um", "território", "com sistema"],
        text: "Franqueados recebem modelo validado, sistema completo de operação, escala, finanças e suporte da rede MePonto.",
        cta: { label: "Quero ser franqueado", href: "https://franchise.meponto.com" },
      },
    ],
    finale: {
      title: ["E definimos o", "amanhã da entrega"],
      text: "Junte-se à rede que profissionaliza a última milha no Brasil.",
      rider: "Quero entregar",
      franchise: "Quero ser franqueado",
    },
    footer: {
      tagline: "Conectar · Apoiar · Entregar",
      systems: [
        { label: "App do Entregador", href: "https://app.meponto.com" },
        { label: "PontoMall", href: "https://mall.meponto.com" },
        { label: "Painel da Franquia", href: "https://franchise.meponto.com" },
        { label: "Painel do Ponto", href: "https://ponto.meponto.com" },
        { label: "PontoSys (Matriz)", href: "https://sys.meponto.com" },
      ],
    },
  },
  zh: {
    loading: "网络加载中",
    pontos: "个站点",
    chapters: [
      { tag: "网络", title: ["我们构建", "最后一公里", "服务网络"], text: "实体服务点遍布圣保罗：本地站长、饮水、卫生间、安全保障，网络每天都在生长。", cta: { label: "了解网络", href: "https://app.meponto.com" } },
      { tag: "排班", title: ["透明排班", "真实收入"], text: "每周班次 App 直达，规则清晰、结算到账。你选择何时上线——其余交给我们。", cta: { label: "我要跑单", href: "https://app.meponto.com/rider-login" } },
      { tag: "积分商城", title: ["每一单", "都变成权益"], text: "订单变积分，积分换商品、服务和街区合作伙伴的真实折扣。没有套路。", cta: { label: "逛逛商城", href: "https://mall.meponto.com" } },
      { tag: "合作", title: ["用系统", "运营一片区域"], text: "加盟商获得验证过的模型、完整的运营/排班/财务系统，以及 MePonto 网络的支持。", cta: { label: "我要加盟", href: "https://franchise.meponto.com" } },
    ],
    finale: { title: ["共同定义", "配送的明天"], text: "加入正在让巴西最后一公里专业化的网络。", rider: "我要跑单", franchise: "我要加盟" },
    footer: {
      tagline: "连接 · 支持 · 送达",
      systems: [
        { label: "骑手 App", href: "https://app.meponto.com" },
        { label: "积分商城", href: "https://mall.meponto.com" },
        { label: "加盟商后台", href: "https://franchise.meponto.com" },
        { label: "站点后台", href: "https://ponto.meponto.com" },
        { label: "PontoSys 主后台", href: "https://sys.meponto.com" },
      ],
    },
  },
  en: {
    loading: "Loading the network",
    pontos: "PONTOS",
    chapters: [
      { tag: "Network", title: ["We build", "the last-mile", "network"], text: "Physical support points across São Paulo: local leaders, water, restrooms, safety — a network growing every day.", cta: { label: "Explore the network", href: "https://app.meponto.com" } },
      { tag: "Shifts", title: ["Transparent", "shifts,", "real income"], text: "Weekly shifts in the app, clear rules, payouts on time. You choose when to ride — we handle the rest.", cta: { label: "I want to deliver", href: "https://app.meponto.com/rider-login" } },
      { tag: "PontoMall", title: ["Every delivery", "becomes", "a benefit"], text: "Orders become points; points become products, services and real discounts at neighborhood partners.", cta: { label: "Visit PontoMall", href: "https://mall.meponto.com" } },
      { tag: "Partnership", title: ["Run a", "territory", "with a system"], text: "Franchisees get a validated model, full operations, scheduling and finance systems, plus MePonto network support.", cta: { label: "Become a franchisee", href: "https://franchise.meponto.com" } },
    ],
    finale: { title: ["And define the", "tomorrow of delivery"], text: "Join the network professionalizing the last mile in Brazil.", rider: "I want to deliver", franchise: "Become a franchisee" },
    footer: {
      tagline: "Connect · Support · Deliver",
      systems: [
        { label: "Rider App", href: "https://app.meponto.com" },
        { label: "PontoMall", href: "https://mall.meponto.com" },
        { label: "Franchise Panel", href: "https://franchise.meponto.com" },
        { label: "Ponto Panel", href: "https://ponto.meponto.com" },
        { label: "PontoSys (HQ)", href: "https://sys.meponto.com" },
      ],
    },
  },
};

/** Deterministic PRNG so SSR and client draw the identical map. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Map camera framing per chapter. transform-origin sits on São Paulo, so
 * every zoom dives toward the Southeast — big scale jumps for drama.
 */
const CAMERA = [
  "translate(0%, 0%) scale(1)",
  "translate(3%, -3%) scale(2.1)",
  "translate(-5%, 1%) scale(2.7)",
  "translate(6%, 5%) scale(1.75)",
  "translate(0%, 1%) scale(1.2)",
];

const MARKER_POS = [
  { left: "64%", top: "63%" },
  { left: "75%", top: "57%" },
  { left: "57%", top: "76%" },
  { left: "49%", top: "57%" },
];

/** Brazil country outline (simplified, viewBox 1200×800). */
const BRAZIL =
  "M450,20 L488,39 L550,82 L600,73 L675,39 L700,117 L738,145 L843,166 L913,174 L988,190 L1020,209 L1070,224 L1080,254 L1078,273 L1063,302 L1025,332 L988,371 L973,410 L975,458 L943,513 L903,554 L870,566 L793,585 L738,628 L738,653 L670,743 L615,774 L555,721 L510,706 L558,663 L610,630 L585,614 L560,585 L510,548 L495,503 L438,435 L318,330 L188,332 L150,312 L105,260 L125,203 L215,137 L200,121 L203,84 L275,84 L363,41 Z";

/** Capital hubs of the delivery network (x, y in the same viewBox). */
const CITIES: Array<{ name: string; x: number; y: number; r: number }> = [
  { name: "São Paulo", x: 785, y: 577, r: 6 },
  { name: "Rio de Janeiro", x: 870, y: 566, r: 3.4 },
  { name: "Belo Horizonte", x: 853, y: 506, r: 3 },
  { name: "Brasília", x: 753, y: 425, r: 3 },
  { name: "Salvador", x: 988, y: 371, r: 2.6 },
  { name: "Recife", x: 1078, y: 273, r: 2.4 },
  { name: "Fortaleza", x: 988, y: 190, r: 2.4 },
  { name: "Belém", x: 738, y: 145, r: 2.2 },
  { name: "Manaus", x: 450, y: 178, r: 2.4 },
  { name: "Curitiba", x: 718, y: 612, r: 2.8 },
  { name: "Porto Alegre", x: 670, y: 702, r: 2.6 },
  { name: "Goiânia", x: 718, y: 443, r: 2.2 },
  { name: "Cuiabá", x: 548, y: 421, r: 2 },
  { name: "Campo Grande", x: 585, y: 515, r: 2 },
  { name: "Vitória", x: 943, y: 513, r: 2.2 },
];

/** Flowing delivery corridors, all radiating from São Paulo. */
const ROUTES = [
  "M785,577 C820,540 840,525 853,506 C900,460 955,420 988,371 C1030,310 1010,240 988,190",
  "M785,577 C775,520 765,470 753,425 C690,330 540,240 450,178",
  "M785,577 C765,592 735,600 718,612 C700,645 682,675 670,702",
  "M785,577 C815,575 845,572 870,566 C900,550 925,532 943,513",
];

export default function HomePage() {
  const [lang, setLang] = useState<Lang>("pt");
  const [chapter, setChapter] = useState(0);
  const [markers, setMarkers] = useState<Array<{ name: string; count: number }>>([]);
  const sectionsRef = useRef<Array<HTMLElement | null>>([]);
  const t = copy[lang];
  const ready = true; // no loader — the map is visible immediately

  // Live network numbers for the marker plates (public summary endpoint).
  useEffect(() => {
    void fetch("/api/network?public=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const rows = (payload?.data?.markers ?? []) as Array<{ name: string; count: number }>;
        if (rows.length > 0) setMarkers(rows.slice(0, 4));
      })
      .catch(() => undefined);
  }, []);

  // Scroll-driven chapter detection.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setChapter(Number((entry.target as HTMLElement).dataset.chapter ?? 0));
        }
      },
      { threshold: 0.55 },
    );
    sectionsRef.current.forEach((section) => section && observer.observe(section));
    return () => observer.disconnect();
  }, [ready]);

  // ---- Interior texture for the country body ------------------------------
  const map = useMemo(() => {
    const rand = mulberry32(20260612);
    const streets: Array<{ x1: number; y1: number; x2: number; y2: number; w: number; o: number }> = [];
    for (let i = 0; i < 150; i += 1) {
      const cx = rand() * 1200;
      const cy = rand() * 800;
      const horizontal = rand() > 0.45;
      const len = 30 + rand() * 130;
      const tilt = (rand() - 0.5) * 14;
      streets.push({
        x1: cx,
        y1: cy,
        x2: cx + (horizontal ? len : tilt),
        y2: cy + (horizontal ? tilt : len),
        w: rand() > 0.85 ? 2.2 : 1,
        o: 0.06 + rand() * 0.16,
      });
    }
    return { streets };
  }, []);

  const setSection = (index: number) => (el: HTMLElement | null) => {
    sectionsRef.current[index] = el;
  };

  const railNames = [...t.chapters.map((section) => section.tag), "MePonto"];

  return (
    <main className="hometown" data-i18n-skip style={{ background: "#0b0e14", color: "#fff7ef", fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
      <style>{`
        .hometown ::selection { background:#f5b301; color:#0b0e14; }
        @keyframes mpPulse { 0%{transform:scale(.6);opacity:.9} 70%{transform:scale(2.4);opacity:0} 100%{opacity:0} }
        @keyframes mpFlow { to { stroke-dashoffset: -640; } }
        @keyframes mpDrift { 0%{transform:translate3d(0,0,0)} 50%{transform:translate3d(-12px,8px,0)} 100%{transform:translate3d(0,0,0)} }
        @keyframes mpRise { from { opacity:0; transform:translateY(46px) } to { opacity:1; transform:translateY(0) } }
        @keyframes mpGlow { 0%,100%{opacity:.55} 50%{opacity:1} }
        .mp-rise { animation: mpRise .9s cubic-bezier(.22,.8,.26,1) both; }
        .mp-rise-2 { animation: mpRise .9s .15s cubic-bezier(.22,.8,.26,1) both; }
        .mp-rise-3 { animation: mpRise .9s .3s cubic-bezier(.22,.8,.26,1) both; }
        @media (prefers-reduced-motion: reduce) { .hometown * { animation: none !important; transition: none !important; } }
      `}</style>

      {/* ---- Fixed map background (code-drawn Brazil) ----------------------- */}
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-[-12%] transition-transform duration-[1800ms]"
          style={{
            transform: CAMERA[Math.min(chapter, CAMERA.length - 1)],
            transformOrigin: "65% 70%",
            transitionTimingFunction: "cubic-bezier(.22,.9,.24,1)",
          }}
        >
          <div style={{ animation: "mpDrift 26s ease-in-out infinite", height: "100%", width: "100%" }}>
            <svg viewBox="0 0 1200 800" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
              <defs>
                <clipPath id="mpBrazil">
                  <path d={BRAZIL} />
                </clipPath>
              </defs>
              {/* country body + glowing border */}
              <path d={BRAZIL} fill="rgba(245,179,1,.045)" stroke="none" />
              <path d={BRAZIL} fill="none" stroke="#f5b301" strokeWidth="6" opacity="0.10" strokeLinejoin="round" />
              <path d={BRAZIL} fill="none" stroke="#f5b301" strokeWidth="2" opacity="0.55" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 8px rgba(245,179,1,.5))" }} />
              {/* interior texture — clipped to the country */}
              <g clipPath="url(#mpBrazil)">
                {/* rio Amazonas */}
                <path d="M150,150 C260,160 360,172 450,178 C560,170 660,160 720,128" fill="none" stroke="#05070c" strokeWidth="22" opacity="0.9" />
                <path d="M150,150 C260,160 360,172 450,178 C560,170 660,160 720,128" fill="none" stroke="#141b29" strokeWidth="16" opacity="0.95" />
                {map.streets.map((s, i) => (
                  <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#f5b301" strokeWidth={s.w} opacity={s.o} strokeLinecap="round" />
                ))}
              </g>
              {/* static corridor traces */}
              {ROUTES.map((d, i) => (
                <path key={`trace-${i}`} d={d} fill="none" stroke="#f5b301" strokeWidth="1.6" opacity="0.22" />
              ))}
              {/* flowing delivery corridors */}
              {ROUTES.map((d, i) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  stroke={i % 2 === 1 ? "#ffe9a8" : "#f5b301"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="14 70 4 552"
                  style={{ animation: `mpFlow ${8 + i * 3}s linear infinite`, opacity: 0.9, filter: "drop-shadow(0 0 6px rgba(245,179,1,.8))" }}
                />
              ))}
              {/* capital hubs */}
              {CITIES.map((c) => (
                <g key={c.name}>
                  {c.name === "São Paulo" && <circle cx={c.x} cy={c.y} r={16} fill="rgba(245,179,1,.18)" />}
                  <circle cx={c.x} cy={c.y} r={c.r} fill="#ffd966" opacity="0.95" />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={c.r * 3.2}
                    fill="none"
                    stroke="#f5b301"
                    strokeWidth="1"
                    style={{ transformOrigin: `${c.x}px ${c.y}px`, animation: `mpPulse 4.6s ${(c.x + c.y) % 5}s ease-out infinite` }}
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 42%, transparent 0%, rgba(11,14,20,.62) 72%, rgba(11,14,20,.94) 100%)" }} />

        {/* franchise marker plates (live data) */}
        {(markers.length > 0 ? markers : [{ name: "São Paulo", count: 0 }]).slice(0, 4).map((marker, i) => (
          <div
            key={marker.name}
            className="absolute hidden -translate-x-1/2 -translate-y-1/2 select-none md:block"
            style={{ ...MARKER_POS[i], opacity: ready && chapter === 0 ? 1 : 0, transition: "opacity .8s ease", transitionDelay: `${0.3 + i * 0.18}s` }}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div className="rounded-[10px] border px-3.5 py-2 text-center backdrop-blur-sm" style={{ borderColor: "rgba(245,179,1,.4)", background: "rgba(11,14,20,.72)" }}>
                <div className="text-xl font-black leading-none" style={{ color: "#f5b301" }}>{marker.count > 0 ? String(marker.count).padStart(2, "0") : "··"}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: "rgba(255,255,255,.75)" }}>{t.pontos}</div>
              </div>
              <div className="h-7 w-px" style={{ background: "linear-gradient(to bottom, rgba(245,179,1,.7), transparent)" }} />
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,.85)" }}>{marker.name}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Top bar -------------------------------------------------------- */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4 md:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/meponto-logo.png" alt="MePonto" className="h-14 w-auto" style={{ filter: "drop-shadow(0 0 14px rgba(245,179,1,.35))" }} />
        <div className="flex items-center gap-2">
          {(["pt", "zh", "en"] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className="rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider transition-colors"
              style={{ borderColor: lang === code ? "#f5b301" : "rgba(255,255,255,.18)", color: lang === code ? "#f5b301" : "rgba(255,255,255,.6)" }}
            >
              {code === "zh" ? "中" : code}
            </button>
          ))}
          <a href="https://app.meponto.com" className="ml-2 rounded-full px-4 py-1.5 text-[12px] font-black uppercase tracking-wider" style={{ background: "#f5b301", color: "#0b0e14" }}>
            App
          </a>
        </div>
      </header>

      {/* ---- Chapter rail ---------------------------------------------------- */}
      <nav className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-4 lg:flex">
        {railNames.map((name, index) => (
          <button key={name} type="button" onClick={() => sectionsRef.current[index]?.scrollIntoView({ behavior: "smooth" })} className="group flex items-center gap-2.5 text-left">
            <span className="h-px transition-all duration-500" style={{ width: chapter === index ? 34 : 14, background: chapter === index ? "#f5b301" : "rgba(255,255,255,.25)" }} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em] transition-colors duration-500" style={{ color: chapter === index ? "#f5b301" : "rgba(255,255,255,.35)" }}>
              {name}
            </span>
          </button>
        ))}
      </nav>

      {/* ---- Chapters -------------------------------------------------------- */}
      <div className="relative z-10">
        {t.chapters.map((section, index) => {
          // SEO: every chapter is always present in the server-rendered HTML
          // (crawlers and AI engines don't run JS). Inactive chapters are
          // hidden via CSS; remount (key change) replays entry animations.
          const active = chapter === index && ready;
          const Heading = index === 0 ? "h1" : "h2";
          return (
            <section key={section.tag} ref={setSection(index)} data-chapter={index} className="flex min-h-screen items-center px-6 md:px-24 lg:px-36">
              <div className="max-w-3xl" key={`${lang}-${index}-${active ? "on" : "off"}`} style={active ? undefined : { visibility: "hidden" }} aria-hidden={active ? undefined : true}>
                <div className="mp-rise mb-5 flex items-center gap-3">
                  <span className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: "#f5b301" }}>
                    {String(index + 1).padStart(2, "0")} · {section.tag}
                  </span>
                  <span className="h-px w-16" style={{ background: "rgba(245,179,1,.5)" }} />
                </div>
                <Heading className="mp-rise text-5xl font-black leading-[1.02] md:text-7xl lg:text-8xl">
                  {section.title.map((line) => (
                    <span key={line} className="block">{line}</span>
                  ))}
                </Heading>
                <p className="mp-rise-2 mt-7 max-w-xl text-base font-medium leading-7 md:text-lg" style={{ color: "rgba(255,255,255,.65)" }}>{section.text}</p>
                {section.cta && (
                  <a href={section.cta.href} className="mp-rise-3 group mt-9 inline-flex items-center gap-3 text-[13px] font-black uppercase tracking-[0.2em]" style={{ color: "#f5b301" }}>
                    <span className="grid h-10 w-10 place-items-center rounded-full border transition-transform group-hover:scale-110" style={{ borderColor: "#f5b301" }}>→</span>
                    {section.cta.label}
                  </a>
                )}
              </div>
            </section>
          );
        })}

        {/* ---- Finale -------------------------------------------------------- */}
        <section ref={setSection(t.chapters.length)} data-chapter={t.chapters.length} className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
          {(() => {
            const finaleActive = chapter === t.chapters.length;
            return (
            <div key={`finale-${lang}-${finaleActive ? "on" : "off"}`} style={finaleActive ? undefined : { visibility: "hidden" }} aria-hidden={finaleActive ? undefined : true}>
              <h2 className="mp-rise text-5xl font-black leading-[1.02] md:text-7xl lg:text-8xl">
                {t.finale.title.map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </h2>
              <p className="mp-rise-2 mx-auto mt-6 max-w-xl text-base font-medium leading-7 md:text-lg" style={{ color: "rgba(255,255,255,.65)" }}>{t.finale.text}</p>
              <div className="mp-rise-3 mt-10 flex flex-wrap items-center justify-center gap-4">
                <a href="https://app.meponto.com/rider-login" className="rounded-full px-8 py-4 text-sm font-black uppercase tracking-wider transition-transform hover:scale-105" style={{ background: "#f5b301", color: "#0b0e14" }}>
                  {t.finale.rider}
                </a>
                <a href="https://franchise.meponto.com" className="rounded-full border px-8 py-4 text-sm font-black uppercase tracking-wider transition-transform hover:scale-105" style={{ borderColor: "rgba(245,179,1,.65)", color: "#f5b301" }}>
                  {t.finale.franchise}
                </a>
              </div>
            </div>
            );
          })()}

          <footer className="absolute inset-x-0 bottom-0 border-t px-6 py-5" style={{ borderColor: "rgba(255,255,255,.08)", background: "rgba(11,14,20,.6)", backdropFilter: "blur(6px)" }}>
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: "rgba(255,255,255,.45)" }}>MePonto · {t.footer.tagline}</div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                {t.footer.systems.map((system) => (
                  <a key={system.href} href={system.href} className="text-[11px] font-bold transition-colors hover:text-[#f5b301]" style={{ color: "rgba(255,255,255,.55)" }}>
                    {system.label}
                  </a>
                ))}
              </div>
            </div>
          </footer>
        </section>
      </div>

      {/* ---- Prev / Next ------------------------------------------------------ */}
      <div className="fixed bottom-6 right-6 z-40 flex gap-2">
        {[
          { label: "↑", target: Math.max(0, chapter - 1) },
          { label: "↓", target: Math.min(t.chapters.length, chapter + 1) },
        ].map((button) => (
          <button
            key={button.label}
            type="button"
            onClick={() => sectionsRef.current[button.target]?.scrollIntoView({ behavior: "smooth" })}
            className="grid h-11 w-11 place-items-center rounded-full border text-lg font-black transition-colors hover:border-[#f5b301] hover:text-[#f5b301]"
            style={{ borderColor: "rgba(255,255,255,.2)", color: "rgba(255,255,255,.7)", background: "rgba(11,14,20,.5)", backdropFilter: "blur(4px)" }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </main>
  );
}
