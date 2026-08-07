"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Full-screen launch screen (启动页). Fetched from the HQ-managed endpoint on
 * every app launch, so changes saved in PontoSys show up next time the rider
 * opens the app. Shown once per launch (browser session); a new config version
 * re-shows. Auto-dismisses after `durationMs`; tap-through opens `linkURL`.
 *
 * ⚠️ **只在骑手端首页出现。**
 * 它挂在 rider-app 的 layout 上,所以本来每个 rider-app 页面都会触发。首页进来
 * 没问题(一次会话只显示一次),但**深链打开的页面会中招** —— 排行榜是从活动卡
 * 在 WebView 里打开的,那是一个全新会话,sessionStorage 是空的,于是点一次卡片
 * 就先糊一屏启动页,得等它放完才看到榜单。
 *
 * 启动页的语义是"打开 APP",不是"打开任意一个页面"。所以按路径卡死在首页。
 */

type SplashCfg = {
  enabled: boolean;
  headline: string;
  tagline: string;
  durationMs: number;
  backgroundHex: string;
  accentHex: string;
  imageURL: string;
  linkURL: string;
  version: number;
};

/** 只有这些路径算"打开 APP"。深链进来的内容页一律不放启动页。 */
const LAUNCH_PATHS = new Set(["/", "/rider-app", "/rider-app/"]);

export function RiderSplash() {
  const pathname = usePathname();
  const isLaunch = LAUNCH_PATHS.has(pathname ?? "");
  const [cfg, setCfg] = useState<SplashCfg | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLaunch) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const r = await fetch("/api/app/rider/splash", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()).data as SplashCfg;
        if (cancelled || !data?.enabled) return;
        const key = `meponto_splash_seen_v${data.version}`;
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
        try { sessionStorage.setItem(key, "1"); } catch { /* private mode */ }
        setCfg(data);
        setShow(true);
        const ms = Math.min(8000, Math.max(600, data.durationMs || 2200));
        timer = setTimeout(() => { if (!cancelled) setShow(false); }, ms);
      } catch { /* offline → skip splash */ }
    })();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [isLaunch]);

  if (!show || !cfg) return null;

  const inner = (
    <div className="flex flex-col items-center gap-5 px-8 text-center">
      {cfg.imageURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cfg.imageURL} alt={cfg.headline} className="max-h-[42vh] max-w-[82vw] rounded-2xl object-contain" />
      ) : null}
      <div className="text-4xl font-black tracking-tight" style={{ color: cfg.accentHex }}>{cfg.headline || "MePonto"}</div>
      {cfg.tagline ? <div className="max-w-[80vw] text-sm font-bold text-white/80">{cfg.tagline}</div> : null}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center"
      style={{ backgroundColor: cfg.backgroundHex || "#07090d" }}
      onClick={() => setShow(false)}
    >
      {cfg.linkURL ? (
        <a href={cfg.linkURL} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{inner}</a>
      ) : (
        inner
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow(false); }}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur"
      >
        Pular ›
      </button>
    </div>
  );
}
