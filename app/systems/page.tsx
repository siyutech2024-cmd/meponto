import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MePonto · Sistemas",
  description: "Acesso rápido a todos os sistemas MePonto.",
};

type SystemCard = {
  name: string;
  role: string; // zh
  rolePt: string; // pt
  url: string;
  badge: string;
};

const SYSTEMS: SystemCard[] = [
  { name: "官网 · Site", role: "品牌主页", rolePt: "Página institucional", url: "https://meponto.com", badge: "WWW" },
  { name: "PontoSys", role: "总部运营后台", rolePt: "Console da sede", url: "https://sys.meponto.com", badge: "HQ" },
  { name: "Franqueado", role: "加盟商后台", rolePt: "Painel do franqueado", url: "https://franchise.meponto.com", badge: "FR" },
  { name: "Ponto", role: "站点 / 网点后台", rolePt: "Painel da estação", url: "https://ponto.meponto.com", badge: "PT" },
  { name: "App do Motoboy", role: "骑手 App", rolePt: "Aplicativo do entregador", url: "https://app.meponto.com", badge: "APP" },
  { name: "PontoMall", role: "积分商城门面（公开）", rolePt: "Loja de pontos (pública)", url: "https://mall.meponto.com", badge: "MALL" },
  { name: "PontoMall · Admin", role: "商城后台 · 运营/供应商/合作伙伴", rolePt: "Back office · operação/fornecedor/parceiro", url: "https://mall.meponto.com/admin", badge: "OPS" },
];

export default function SystemsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b0e14", color: "#fff" }} className="px-5 py-12 md:px-10 md:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-app-icon.png" alt="MePonto" className="h-14 w-14 rounded-2xl" style={{ filter: "drop-shadow(0 0 14px rgba(245,179,1,.35))" }} />
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">MePonto · Sistemas</h1>
            <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,.55)" }}>各模块系统入口 · Acesso a todos os sistemas</p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SYSTEMS.map((s) => (
            <a
              key={s.url}
              href={s.url}
              className="group flex flex-col gap-2 rounded-2xl border p-5 transition-colors"
              style={{ borderColor: "rgba(255,255,255,.1)", background: "rgba(255,255,255,.03)" }}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 min-w-9 place-items-center rounded-lg px-2 text-[11px] font-black tracking-wider" style={{ background: "#f5b301", color: "#0b0e14" }}>{s.badge}</span>
                <span className="text-[11px] font-black uppercase tracking-wider opacity-50 transition-opacity group-hover:opacity-100" style={{ color: "#f5b301" }}>Abrir →</span>
              </div>
              <div className="mt-1 text-lg font-black leading-tight">{s.name}</div>
              <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,.7)" }}>{s.role}</div>
              <div className="text-[12px] font-bold" style={{ color: "rgba(255,255,255,.4)" }}>{s.rolePt}</div>
              <div className="mt-2 truncate text-[12px] font-mono" style={{ color: "rgba(245,179,1,.85)" }}>{s.url.replace("https://", "")}</div>
            </a>
          ))}
        </div>

        <p className="mt-10 text-[12px] font-bold leading-relaxed" style={{ color: "rgba(255,255,255,.4)" }}>
          供应商与合作伙伴统一在 <b style={{ color: "rgba(245,179,1,.85)" }}>mall.meponto.com</b> 登录,按角色进入各自工作台。每个系统登录入口为各自域名下的 <span className="font-mono">/login</span>(骑手用 App 内手机号 + 验证码)。
        </p>
      </div>
    </main>
  );
}
