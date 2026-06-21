"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen launch screen (启动页). Fetched from the HQ-managed endpoint on
 * every app launch, so changes saved in PontoSys show up next time the rider
 * opens the app. Shown once per launch (browser session); a new config version
 * re-shows. Auto-dismisses after `durationMs`; tap-through opens `linkURL`.
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

export function RiderSplash() {
  const [cfg, setCfg] = useState<SplashCfg | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
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
  }, []);

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
