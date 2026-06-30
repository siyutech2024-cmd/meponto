"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ListChecks, RefreshCcw, Send, Smartphone, Trash2 } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

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
  updatedAt?: string;
  updatedBy?: string;
};

const DEFAULT_CFG: SplashCfg = {
  enabled: true, headline: "MePonto", tagline: "", durationMs: 2200,
  backgroundHex: "#07090d", accentHex: "#ffd100", imageURL: "", linkURL: "", version: 1,
};

export default function AppConfigPage() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);
  const [cfg, setCfg] = useState<SplashCfg>(DEFAULT_CFG);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Push composer + audience.
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("/rider-app");
  const [subs, setSubs] = useState<{ count: number; riders: string[] }>({ count: 0, riders: [] });

  // Tasks (任务) config.
  type TaskRow = { id: string; title: string; metric: string; target: number; rewardPoints: number; period: string; audience: string; enabled: boolean };
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tForm, setTForm] = useState({ title: "", metric: "completed_orders", target: "100", rewardPoints: "500", period: "weekly" });
  const metricLabel: Record<string, string> = { completed_orders: "完单数", checkins: "签到次数", redemptions: "兑换次数", slot_enrollments: "报名数" };

  const loadSplash = useCallback(async () => {
    const r = await fetch("/api/app/rider/splash", { cache: "no-store" }).catch(() => null);
    if (r && r.ok) setCfg({ ...DEFAULT_CFG, ...((await r.json()).data as SplashCfg) });
  }, []);
  const loadSubs = useCallback(async () => {
    const r = await fetch("/api/push", { headers, cache: "no-store" }).catch(() => null);
    if (r && r.ok) setSubs(((await r.json()).data as { count: number; riders: string[] }) ?? { count: 0, riders: [] });
  }, [headers]);
  const loadTasks = useCallback(async () => {
    const r = await fetch("/api/tasks", { headers, cache: "no-store" }).catch(() => null);
    if (r && r.ok) setTasks((((await r.json()).data?.tasks ?? []) as TaskRow[]));
  }, [headers]);
  useEffect(() => { void loadSplash(); void loadSubs(); void loadTasks(); }, [loadSplash, loadSubs, loadTasks]);

  async function taskPost(payload: Record<string, unknown>, ok: string) {
    const r = await fetch("/api/tasks", { method: "POST", headers, body: JSON.stringify(payload) }).catch(() => null);
    const p = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setNote({ tone: "err", text: p.error ?? "操作失败" }); return; }
    setNote({ tone: "ok", text: ok });
    void loadTasks();
  }

  const set = <K extends keyof SplashCfg>(k: K, v: SplashCfg[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function saveSplash() {
    const r = await fetch("/api/app/rider/splash", { method: "POST", headers, body: JSON.stringify(cfg) }).catch(() => null);
    const payload = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setNote({ tone: "err", text: payload.error ?? "保存失败" }); return; }
    setCfg({ ...DEFAULT_CFG, ...(payload.data as SplashCfg) });
    setNote({ tone: "ok", text: t("dynSplashSaved", { v: payload.data.version }) });
  }

  async function sendPush() {
    if (!pushTitle.trim() || !pushBody.trim()) return;
    const r = await fetch("/api/push", { method: "POST", headers, body: JSON.stringify({ action: "send", title: pushTitle, body: pushBody, url: pushUrl || "/rider-app" }) }).catch(() => null);
    const payload = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setNote({ tone: "err", text: payload.error ?? "发送失败" }); return; }
    setNote({ tone: "ok", text: t("dynPushSent", { sent: payload.data.sent, targets: payload.data.targets }) });
    setPushTitle(""); setPushBody("");
  }

  const field = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";
  const label = "mb-1 block text-[10px] font-black uppercase text-[var(--muted)]";

  return (
    <AppShell>
      <PageTitle
        title="App 配置 / 推送"
        eyebrow="启动页 · 推送通知 — 主后台统一管理，骑手 App 实时生效"
        action={<button type="button" onClick={() => { void loadSplash(); void loadSubs(); }} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {note && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${note.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {note.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Splash editor */}
        <div className="panel p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Smartphone size={14} /> App 启动页（开屏）</div>

          <label className="mb-3 flex items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
            <span className="text-sm font-black">启用启动页</span>
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={label}>标题 Headline</span><input value={cfg.headline} onChange={(e) => set("headline", e.target.value)} className={field} /></label>
            <label><span className={label}>停留时长 (ms)</span><input inputMode="numeric" value={String(cfg.durationMs)} onChange={(e) => set("durationMs", Number(e.target.value.replace(/[^\d]/g, "")) || 0)} className={field} /></label>
          </div>
          <label className="mt-3 block"><span className={label}>副标题 Tagline（骑手可见，建议葡语）</span><input value={cfg.tagline} onChange={(e) => set("tagline", e.target.value)} className={field} /></label>
          <label className="mt-3 block"><span className={label}>图片 URL（开屏广告图，可空）</span><input value={cfg.imageURL} onChange={(e) => set("imageURL", e.target.value)} placeholder="https://…" className={field} /></label>
          <label className="mt-3 block"><span className={label}>点击跳转 URL（可空）</span><input value={cfg.linkURL} onChange={(e) => set("linkURL", e.target.value)} placeholder="https://… 或 /store" className={field} /></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><span className={label}>背景色 Hex</span><div className="flex gap-2"><input type="color" value={cfg.backgroundHex} onChange={(e) => set("backgroundHex", e.target.value)} className="h-11 w-12 rounded-[8px] border border-[var(--line)] bg-transparent" /><input value={cfg.backgroundHex} onChange={(e) => set("backgroundHex", e.target.value)} className={field} /></div></label>
            <label><span className={label}>强调色 Hex</span><div className="flex gap-2"><input type="color" value={cfg.accentHex} onChange={(e) => set("accentHex", e.target.value)} className="h-11 w-12 rounded-[8px] border border-[var(--line)] bg-transparent" /><input value={cfg.accentHex} onChange={(e) => set("accentHex", e.target.value)} className={field} /></div></label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => void saveSplash()} className="h-11 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]">保存启动页</button>
            <span className="text-[11px] font-bold text-[var(--muted)]">{t("dynCurrentV", { v: cfg.version })}{cfg.updatedAt ? ` · ${cfg.updatedAt} · ${cfg.updatedBy ?? ""}` : ""}</span>
          </div>
        </div>

        {/* Live preview */}
        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">预览</div>
          <div className="relative mx-auto aspect-[9/19] w-full max-w-[220px] overflow-hidden rounded-[26px] border-4 border-[var(--line)]" style={{ backgroundColor: cfg.backgroundHex || "#07090d" }}>
            <div className="grid h-full place-items-center px-4 text-center">
              <div className="flex flex-col items-center gap-3">
                {cfg.imageURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cfg.imageURL} alt="" className="max-h-[40%] max-w-[80%] rounded-xl object-contain" />
                ) : null}
                <div className="text-2xl font-black" style={{ color: cfg.accentHex || "#ffd100" }}>{cfg.headline || "MePonto"}</div>
                {cfg.tagline ? <div className="text-[11px] font-bold text-white/80">{cfg.tagline}</div> : null}
              </div>
            </div>
            {!cfg.enabled && <div className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-black text-white">已停用</div>}
          </div>
        </div>
      </div>

      {/* Push composer */}
      <div className="panel mt-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
          <BellRing size={14} /> 推送通知（发送到骑手 App，后台运行也能收到）
          <span className="ml-auto rounded-full bg-[var(--surface-raised)] px-3 py-1 text-[11px] font-bold text-[var(--muted-strong)]">已订阅设备：{subs.count}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label><span className={label}>标题</span><input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="如：Novos turnos abertos" className={field} /></label>
          <label><span className={label}>点击打开（可空，默认 /rider-app）</span><input value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} className={field} /></label>
        </div>
        <label className="mt-3 block"><span className={label}>内容（葡语，骑手看到的正文）</span><textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" /></label>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={!pushTitle.trim() || !pushBody.trim()} onClick={() => void sendPush()} className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"><Send size={15} /> 发送推送</button>
          <span className="text-[11px] font-bold text-[var(--muted)]">通过 Web Push 下发；骑手需先在 App 内「开启通知」授权。</span>
        </div>
      </div>

      {/* Tasks config */}
      <div className="panel mt-4 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><ListChecks size={14} /> 任务配置（目标 + 奖励 + 周期，骑手 App 展示进度并领取）</div>
        <div className="mb-3 grid gap-2 lg:grid-cols-[2fr_1.2fr_0.8fr_1fr_1fr_auto]">
          <input value={tForm.title} onChange={(e) => setTForm({ ...tForm, title: e.target.value })} placeholder="任务标题" className={field} />
          <select value={tForm.metric} onChange={(e) => setTForm({ ...tForm, metric: e.target.value })} className={field}>
            {Object.entries(metricLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={tForm.target} onChange={(e) => setTForm({ ...tForm, target: e.target.value.replace(/[^\d]/g, "") })} placeholder="目标" className={field} />
          <input value={tForm.rewardPoints} onChange={(e) => setTForm({ ...tForm, rewardPoints: e.target.value.replace(/[^\d]/g, "") })} placeholder="奖励 pts" className={field} />
          <select value={tForm.period} onChange={(e) => setTForm({ ...tForm, period: e.target.value })} className={field}>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
          <button type="button" onClick={() => { if (!tForm.title.trim()) return; void taskPost({ action: "create", ...tForm, target: Number(tForm.target) || 1, rewardPoints: Number(tForm.rewardPoints) || 0 }, "任务已创建"); setTForm({ ...tForm, title: "" }); }} className="h-11 rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)]">添加</button>
        </div>
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
              <span className="font-black">{t.title}</span>
              <span className="text-[11px] font-bold text-[var(--muted)]">{metricLabel[t.metric] ?? t.metric} ≥ {t.target} · {t.rewardPoints} pts · {t.period === "weekly" ? "每周" : "每月"}</span>
              <button type="button" onClick={() => void taskPost({ action: "toggle", taskId: t.id, enabled: !t.enabled }, t.enabled ? "已停用" : "已启用")} className={`ml-auto h-8 rounded-[8px] px-3 text-xs font-black ${t.enabled ? "bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border border-[var(--line)] text-[var(--muted)]"}`}>{t.enabled ? "启用中" : "已停用"}</button>
              <button type="button" onClick={() => void taskPost({ action: "delete", taskId: t.id }, "已删除")} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--danger-ink)]"><Trash2 size={12} /> 删除</button>
            </div>
          ))}
          {tasks.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无任务。上面添加一个:目标达成后骑手在 App 内领取,奖励自动入积分账本。</div>}
        </div>
      </div>
    </AppShell>
  );
}
