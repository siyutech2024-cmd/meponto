"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ImagePlus, ListChecks, Loader2, RefreshCcw, Send, Smartphone, Trash2, X } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { ImagePreview } from "../components/kit";
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
  /** 模式二 S3: "pro" = 只有 PRO 池骑手收到(服务端按会话门禁). */
  audience?: "all" | "pro";
  /** A4 · 活动入口卡(首页 banner)。与开屏同一条记录、同一个页面维护。 */
  activityCard?: ActivityCard;
  /** 排行榜开关(日榜/周榜)。 */
  leaderboard?: Leaderboard;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
};

/** A4 · 活动入口卡。生效窗口与受众由服务端判定,前端只负责编辑。 */
type ActivityCard = {
  enabled: boolean; title: string; subtitle: string; badge: string;
  imageURL: string; linkURL: string;
  audience?: "all" | "pro"; startsAt?: string; endsAt?: string;
};

/** 排行榜开关。口径 = 实时快照,每人每天取 MAX(不是 SUM)。 */
type Leaderboard = { enabled: boolean; daily: boolean; weekly: boolean; topN: number };

const DEFAULT_LEADERBOARD: Leaderboard = { enabled: false, daily: true, weekly: true, topN: 20 };

/**
 * 排行榜 H5 地址 —— **骑手域是 app.meponto.com,不是 mall**。
 *
 * proxy.ts 里 mall.meponto.com 上的 /rider-app/* 会被 302 到
 * app.meponto.com 的干净路径(去掉 /rider-app 前缀)。填 mall 那条也能到,
 * 但白白多一跳;填 app 这条是最终落点。
 * cookie 域是 .meponto.com,两个子域都带得上,登录态不受影响。
 */
const RANKING_URL = "https://app.meponto.com/ranking";

/** 这个 URL 是否指向排行榜(两种写法都算:干净路径 / 旧的 mall 转跳路径)。 */
const pointsAtRanking = (url: string) => /\/(rider-app\/)?ranking\/?($|\?)/.test(url);

const DEFAULT_CARD: ActivityCard = {
  enabled: false, title: "", subtitle: "", badge: "", imageURL: "", linkURL: "",
  audience: "all", startsAt: "", endsAt: "",
};

const DEFAULT_CFG: SplashCfg = {
  enabled: true, headline: "MePonto", tagline: "", durationMs: 2200,
  backgroundHex: "#07090d", accentHex: "#ffd100", imageURL: "", linkURL: "", audience: "all",
  activityCard: DEFAULT_CARD, leaderboard: DEFAULT_LEADERBOARD, version: 1,
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
  const [pushImage, setPushImage] = useState("");
  const [pushAudience, setPushAudience] = useState("__all__");
  const [pushSending, setPushSending] = useState(false);
  const [uploading, setUploading] = useState<null | "push" | "splash">(null);
  const [subs, setSubs] = useState<{ count: number; webCount?: number; fcmCount?: number; riders: string[] }>({ count: 0, riders: [] });
  const [pushHistory, setPushHistory] = useState<{ id: string; detail: string; createdAt: string }[]>([]);

  // Quick templates (PT — rider-facing copy). 快捷模板(葡语,骑手可见文案)。
  const pushTemplates = [
    { label: "新排班 Turnos", title: "Novos turnos abertos 🛵", body: "Novos turnos foram liberados para esta semana. Abra a agenda e garanta já o seu horário!", url: "/rider-app/agenda" },
    { label: "商城上新 Mall", title: "Novidades no PontoMall 🎁", body: "Chegaram novos produtos para resgatar com seus pontos. Corra para conferir antes que acabe!", url: "/rider-app/mall" },
    { label: "重要通知 Aviso", title: "Aviso importante MePonto ⚠️", body: "Temos uma atualização importante para você. Toque para ver os detalhes no app.", url: "/rider-app" },
  ];

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
    if (r && r.ok) setSubs(((await r.json()).data as { count: number; webCount?: number; fcmCount?: number; riders: string[] }) ?? { count: 0, riders: [] });
  }, [headers]);
  const loadPushHistory = useCallback(async () => {
    const r = await fetch("/api/audit", { headers, cache: "no-store" }).catch(() => null);
    if (!r || !r.ok) return;
    const entries = (((await r.json()).data ?? []) as { id: string; action: string; detail: string; createdAt: string }[]);
    setPushHistory(
      entries
        .filter((e) => e.action === "PUSH_SENT")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // newest first
        .slice(0, 10)
        .map(({ id, detail, createdAt }) => ({ id, detail, createdAt })),
    );
  }, [headers]);
  const loadTasks = useCallback(async () => {
    const r = await fetch("/api/tasks", { headers, cache: "no-store" }).catch(() => null);
    if (r && r.ok) setTasks((((await r.json()).data?.tasks ?? []) as TaskRow[]));
  }, [headers]);
  useEffect(() => { void loadSplash(); void loadSubs(); void loadTasks(); void loadPushHistory(); }, [loadSplash, loadSubs, loadTasks, loadPushHistory]);

  async function taskPost(payload: Record<string, unknown>, ok: string) {
    const r = await fetch("/api/tasks", { method: "POST", headers, body: JSON.stringify(payload) }).catch(() => null);
    const p = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setNote({ tone: "err", text: p.error ?? "操作失败" }); return; }
    setNote({ tone: "ok", text: ok });
    void loadTasks();
  }

  const set = <K extends keyof SplashCfg>(k: K, v: SplashCfg[K]) => setCfg((c) => ({ ...c, [k]: v }));
  // A4: the activity card is a nested object on the same record — patch it
  // field by field so an unrelated splash edit can never blank the campaign.
  const card = cfg.activityCard ?? DEFAULT_CARD;
  const setCard = (patch: Partial<ActivityCard>) =>
    setCfg((c) => ({ ...c, activityCard: { ...DEFAULT_CARD, ...c.activityCard, ...patch } }));
  const board = cfg.leaderboard ?? DEFAULT_LEADERBOARD;
  const setBoard = (patch: Partial<Leaderboard>) =>
    setCfg((c) => ({ ...c, leaderboard: { ...DEFAULT_LEADERBOARD, ...c.leaderboard, ...patch } }));

  async function saveSplash() {
    const r = await fetch("/api/app/rider/splash", { method: "POST", headers, body: JSON.stringify(cfg) }).catch(() => null);
    const payload = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setNote({ tone: "err", text: payload.error ?? "保存失败" }); return; }
    setCfg({ ...DEFAULT_CFG, ...(payload.data as SplashCfg) });
    setNote({ tone: "ok", text: t("dynSplashSaved", { v: payload.data.version }) });
  }

  async function sendPush() {
    if (!pushTitle.trim() || !pushBody.trim() || pushSending) return;
    setPushSending(true);
    const r = await fetch("/api/push", {
      method: "POST", headers,
      body: JSON.stringify({
        action: "send",
        title: pushTitle,
        body: pushBody,
        url: pushUrl || "/rider-app",
        ...(pushImage.trim() ? { imageUrl: pushImage.trim() } : {}),
        ...(pushAudience !== "__all__" ? { riderName: pushAudience } : {}),
      }),
    }).catch(() => null);
    setPushSending(false);
    const payload = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setNote({ tone: "err", text: payload.error ?? "发送失败" }); return; }
    const d = payload.data as { sent: number; fcmSent?: number; targets: number };
    setNote({ tone: "ok", text: `${t("dynPushSent", { sent: d.sent + (d.fcmSent ?? 0), targets: d.targets })}（Web ${d.sent} · App ${d.fcmSent ?? 0}）` });
    setPushTitle(""); setPushBody(""); setPushImage("");
    void loadPushHistory();
  }

  /** Downscale + re-encode a local image so the upload stays small (FCM banners
   *  render at ~1024px; 4MB server cap). Returns a JPEG data URL. */
  function compressImage(file: File, maxW = 1280, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("canvas")); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => reject(new Error("decode"));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });
  }

  /** Upload a local image → public https URL (push banner or splash art). */
  async function uploadLocalImage(file: File | undefined | null, kind: "push" | "splash") {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNote({ tone: "err", text: "请选择图片文件（JPG/PNG/WebP）" }); return; }
    setUploading(kind);
    try {
      const dataUrl = await compressImage(file);
      const r = await fetch("/api/mall/upload", { method: "POST", headers, body: JSON.stringify({ dataUrl, kind }) }).catch(() => null);
      const p = r ? await r.json().catch(() => ({})) : {};
      if (p.url) {
        if (kind === "push") setPushImage(p.url as string);
        else set("imageURL", p.url as string);
        setNote({ tone: "ok", text: "图片已上传，链接已自动填入。" });
      } else {
        setNote({ tone: "err", text: p.error ? `上传失败：${p.error}` : "上传失败" });
      }
    } catch {
      setNote({ tone: "err", text: "图片处理失败，请换一张试试" });
    } finally {
      setUploading(null);
    }
  }

  const field = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";
  const label = "mb-1 block text-[10px] font-black uppercase text-[var(--muted)]";
  const uploadBtn = "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-3 text-xs font-black text-[var(--muted-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]";

  return (
    <AppShell>
      <PageTitle
        title="App 配置 / 推送"
        eyebrow="启动页 · 推送通知 — 主后台统一管理，骑手 App 实时生效"
        action={<button type="button" onClick={() => { void loadSplash(); void loadSubs(); void loadPushHistory(); void loadTasks(); }} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
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
          {/* 模式二 S3: 定向受众 —— 服务端按会话门禁,非 PRO 骑手(含所有老版本 APP)直接收到 enabled=false */}
          <label className="mt-3 block">
            <span className={label}>投放对象 Audiência</span>
            <select value={cfg.audience ?? "all"} onChange={(e) => set("audience", e.target.value as "all" | "pro")} className={field}>
              <option value="all">全部骑手 Todos</option>
              <option value="pro">仅 PRO 池 Somente PRO</option>
            </select>
            <span className="mt-1 block text-[11px] text-[var(--muted)]">选“仅 PRO”后，普通骑手（含老版本 App）在服务端就被拦掉，不会看到该开屏。</span>
          </label>
          <div className="mt-3">
            <span className={label}>开屏广告图（本地上传或粘贴 URL，可空）</span>
            <div className="flex gap-2">
              <input value={cfg.imageURL} onChange={(e) => set("imageURL", e.target.value)} placeholder="https://…" className={field} />
              <label className={uploadBtn}>
                {uploading === "splash" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} 本地图片
                <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={(e) => { void uploadLocalImage(e.target.files?.[0], "splash"); e.target.value = ""; }} />
              </label>
            </div>
            <ImagePreview url={cfg.imageURL} size={56} width={96} className="mt-2" alt="开屏广告图预览" />
          </div>
          <label className="mt-3 block"><span className={label}>点击跳转 URL（可空）</span><input value={cfg.linkURL} onChange={(e) => set("linkURL", e.target.value)} placeholder="https://… 或 /store" className={field} /></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><span className={label}>背景色 Hex</span><div className="flex gap-2"><input type="color" value={cfg.backgroundHex} onChange={(e) => set("backgroundHex", e.target.value)} className="h-11 w-12 rounded-[8px] border border-[var(--line)] bg-transparent" /><input value={cfg.backgroundHex} onChange={(e) => set("backgroundHex", e.target.value)} className={field} /></div></label>
            <label><span className={label}>强调色 Hex</span><div className="flex gap-2"><input type="color" value={cfg.accentHex} onChange={(e) => set("accentHex", e.target.value)} className="h-11 w-12 rounded-[8px] border border-[var(--line)] bg-transparent" /><input value={cfg.accentHex} onChange={(e) => set("accentHex", e.target.value)} className={field} /></div></label>
          </div>

          {/* A4 · 活动入口卡 —— 与开屏同一条记录、同一个保存按钮,不另开菜单。
              生效窗口和受众都在服务端判定,过期的卡不依赖手机时钟。 */}
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={card.enabled} onChange={(e) => setCard({ enabled: e.target.checked })} />
              <span className="text-sm font-black">首页活动入口卡 / Card de campanha</span>
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><span className={label}>标题</span><input value={card.title} onChange={(e) => setCard({ title: e.target.value })} placeholder="Campanha Realme" className={field} /></label>
              <label><span className={label}>角标(可空)</span><input value={card.badge} onChange={(e) => setCard({ badge: e.target.value })} placeholder="NOVO" className={field} /></label>
            </div>
            <label className="mt-3 block"><span className={label}>副标题</span><input value={card.subtitle} onChange={(e) => setCard({ subtitle: e.target.value })} className={field} /></label>
            <label className="mt-3 block"><span className={label}>图片 URL(可空)</span><input value={card.imageURL} onChange={(e) => setCard({ imageURL: e.target.value })} placeholder="https://…" className={field} /></label>
            <label className="mt-3 block">
              <span className={label}>点击跳转 URL</span>
              <input value={card.linkURL} onChange={(e) => setCard({ linkURL: e.target.value })} placeholder="https://mall.meponto.com/…" className={field} />
              {/* 一键填入 —— 手填这个 URL 最容易错在域上:页面里调的是相对路径
                  /api/…,请求会打到 serve 页面的那个域,填错域会"页面能开、接口 404"。 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCard({ linkURL: RANKING_URL })}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--line)] px-3 text-[11px] font-black text-[var(--muted-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  填入排行榜地址
                </button>
                {card.linkURL && (
                  <a
                    href={card.linkURL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-full border border-[var(--line)] px-3 text-[11px] font-black text-[var(--muted-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    预览这个链接
                  </a>
                )}
              </div>
              {/* A5 白名单:APP 只在 *.meponto.com 内嵌打开,其余一律跳系统浏览器 */}
              <span className="mt-1 block text-[11px] font-bold text-[var(--muted)]">
                只有 *.meponto.com 会在 APP 内打开;其他域名会跳到系统浏览器。
              </span>
              {/* 联动校验:卡指向排行榜但排行榜是关的 → 骑手点进去只会看到"已停用"。
                  两个开关分处两块,不提示的话运营一定会踩。 */}
              {pointsAtRanking(card.linkURL) && !card.enabled && (
                <span className="mt-1.5 block rounded-[6px] border border-[var(--warning)] bg-[var(--warning-bg)] px-2 py-1.5 text-[11px] font-black text-[var(--warning-ink)]">
                  URL 填好了,但最上面的「首页活动入口卡」还没勾 —— 卡片不会下发到 APP,骑手看不到入口。
                </span>
              )}
              {pointsAtRanking(card.linkURL) && !board.enabled && (
                <span className="mt-1.5 block rounded-[6px] border border-[var(--warning)] bg-[var(--warning-bg)] px-2 py-1.5 text-[11px] font-black text-[var(--warning-ink)]">
                  这张卡指向排行榜,但下面的「骑手排行榜」开关还没打开 —— 骑手点进去会看到"排行榜已停用"。
                </span>
              )}
              {/* 骑手页的域是 app.meponto.com。mall 上的 /rider-app/* 会被 302 过去,
                  能到但多一跳;写在这里省得下次又有人按 mall 域去填。 */}
              {card.linkURL.includes("mall.meponto.com/rider-app/") && (
                <span className="mt-1.5 block rounded-[6px] border border-[var(--warning)] bg-[var(--warning-bg)] px-2 py-1.5 text-[11px] font-black text-[var(--warning-ink)]">
                  骑手页面的域是 app.meponto.com。填 mall 这条会被自动转跳过去(能用,但多一跳),建议点「填入排行榜地址」换成干净地址。
                </span>
              )}
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label><span className={label}>受众</span>
                <select value={card.audience ?? "all"} onChange={(e) => setCard({ audience: e.target.value as "all" | "pro" })} className={field}>
                  <option value="all">全部骑手</option>
                  <option value="pro">仅 PRO 池</option>
                </select>
              </label>
              <label><span className={label}>开始日期(可空)</span><input type="date" value={card.startsAt ?? ""} onChange={(e) => setCard({ startsAt: e.target.value })} className={field} /></label>
              <label><span className={label}>结束日期(可空)</span><input type="date" value={card.endsAt ?? ""} onChange={(e) => setCard({ endsAt: e.target.value })} className={field} /></label>
            </div>
          </div>

          {/* 排行榜开关 —— 同一条记录、同一个保存按钮,不另开菜单。
              口径写在界面上:榜单来自实时抓取,每人每天取当日最高累计值。
              运营看得到口径,才不会拿榜单去和结算报表对数。 */}
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={board.enabled} onChange={(e) => setBoard({ enabled: e.target.checked })} />
              <span className="text-sm font-black">骑手排行榜 / Ranking</span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={board.daily} disabled={!board.enabled} onChange={(e) => setBoard({ daily: e.target.checked })} />
                每日订单榜
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={board.weekly} disabled={!board.enabled} onChange={(e) => setBoard({ weekly: e.target.checked })} />
                每周订单榜
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                显示前
                <input
                  type="number"
                  min={3}
                  max={100}
                  value={board.topN}
                  disabled={!board.enabled}
                  onChange={(e) => setBoard({ topN: Number(e.target.value) || 20 })}
                  className="h-9 w-20 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]"
                />
                名
              </label>
            </div>
            {/* 入口链路自检。三个开关分处两块,任何一个漏了骑手就看不到入口,
                而且**页面上完全没有报错**,只是什么都不出现 —— 最难自己发现的那种。
                所以这里逐条点名缺的是哪一步,不要只说"配置不完整"。 */}
            {board.enabled && !(card.enabled && pointsAtRanking(card.linkURL)) && (
              <div className="mt-2 rounded-[6px] border border-[var(--warning)] bg-[var(--warning-bg)] px-2 py-1.5 text-[11px] font-black leading-relaxed text-[var(--warning-ink)]">
                排行榜已开启,但骑手在 APP 里**还看不到入口**,缺:
                {!pointsAtRanking(card.linkURL) && <><br />· 活动卡的跳转 URL 没指向排行榜 —— 点上面的「填入排行榜地址」</>}
                {pointsAtRanking(card.linkURL) && !card.enabled && <><br />· 活动卡本身没启用 —— 勾上上面的「首页活动入口卡」</>}
                {pointsAtRanking(card.linkURL) && card.enabled && !card.title.trim() && <><br />· 活动卡没有标题 —— 骑手会看到一张空白卡</>}
                <br />改完记得点「保存启动页」。
              </div>
            )}
            <div className="mt-2 text-[11px] font-bold leading-relaxed text-[var(--muted)]">
              口径:实时抓取快照,每人每天取当日最高累计完单(不是各批次相加)。
              周榜 = 最近 7 天每日最高值之和。<br />
              一张总榜,PRO 骑手标金色,显示全名;骑手本人的名次永远附带,哪怕排在榜外。
              <br />
              <span className="text-[var(--warning-ink)]">注意:榜单与结算/考核口径不同(那两个以 T+1 导入报表为准),不要拿来对数。</span>
            </div>
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

      {/* Push composer — full-featured: audience, image, templates, live preview, history */}
      <div className="panel mt-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
          <BellRing size={14} /> 推送通知（Web Push + 原生 FCM 双通道，后台运行也能收到）
          <span className="ml-auto rounded-full bg-[var(--surface-raised)] px-3 py-1 text-[11px] font-bold text-[var(--muted-strong)]">
            设备：{subs.count}{typeof subs.webCount === "number" ? `（Web ${subs.webCount} · App ${subs.fcmCount ?? 0}）` : ""}
          </span>
        </div>

        {/* Quick templates */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase text-[var(--muted)]">快捷模板：</span>
          {pushTemplates.map((tpl) => (
            <button key={tpl.label} type="button" onClick={() => { setPushTitle(tpl.title); setPushBody(tpl.body); setPushUrl(tpl.url); }} className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-[11px] font-bold text-[var(--muted-strong)] hover:border-[var(--accent)]">
              {tpl.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Editor */}
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className={label}>接收对象</span>
                <select value={pushAudience} onChange={(e) => setPushAudience(e.target.value)} className={field}>
                  <option value="__all__">全体骑手（{subs.count} 台设备）</option>
                  {subs.riders.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label><span className={label}>点击打开（可空，默认 /rider-app）</span><input value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} className={field} /></label>
            </div>
            <label className="mt-3 block"><span className={label}>标题（最长 80 字符）</span><input value={pushTitle} onChange={(e) => setPushTitle(e.target.value.slice(0, 80))} placeholder="如：Novos turnos abertos 🛵" className={field} /></label>
            <label className="mt-3 block"><span className={label}>内容（葡语正文，最长 500 字符 — App 端自动展开长文本）</span>
              <textarea value={pushBody} onChange={(e) => setPushBody(e.target.value.slice(0, 500))} placeholder="Ex.: Novos turnos foram liberados para esta semana…" className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <span className="mt-1 block text-right text-[10px] font-bold text-[var(--muted)]">{pushBody.length}/500</span>
            </label>
            <div className="block">
              <span className={label}>通知大图（本地上传或粘贴 https URL，可空）</span>
              <div className="flex gap-2">
                <input value={pushImage} onChange={(e) => setPushImage(e.target.value)} placeholder="https://…/banner.jpg" className={field} />
                <label className={uploadBtn}>
                  {uploading === "push" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} 本地图片
                  <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={(e) => { void uploadLocalImage(e.target.files?.[0], "push"); e.target.value = ""; }} />
                </label>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ImagePreview url={pushImage} size={56} width={96} alt="通知大图预览" />
                {pushImage.trim() !== "" && (
                  <button type="button" onClick={() => setPushImage("")} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--line)] px-2.5 text-xs font-black text-[var(--danger-ink)]"><X size={12} /> 移除图片</button>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" disabled={!pushTitle.trim() || !pushBody.trim() || pushSending || uploading !== null} onClick={() => void sendPush()} className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50">
                <Send size={15} /> {pushSending ? "发送中…" : pushAudience === "__all__" ? "发送给全员" : `发送给 ${pushAudience}`}
              </button>
              <span className="text-[11px] font-bold text-[var(--muted)]">同时下发 Web Push 与原生 FCM；骑手需先在 App 内授权通知。</span>
            </div>
          </div>

          {/* Live notification preview — sticky so it stays visible while editing */}
          <div className="self-start lg:sticky lg:top-4">
            <div className="mb-2 text-[10px] font-black uppercase text-[var(--muted)]">通知预览（骑手手机上的样子）</div>
            <div className="rounded-[18px] bg-[#0d1117] p-3">
              <div className="rounded-[14px] bg-[#1c2128] p-3 shadow-lg">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon-192.png" alt="" className="h-5 w-5 rounded" />
                  <span className="text-[11px] font-bold text-white/60">MePonto · agora</span>
                </div>
                <div className="mt-1.5 text-[13px] font-black leading-snug text-white">{pushTitle || "Título da notificação"}</div>
                <div className="mt-0.5 whitespace-pre-wrap text-[12px] font-medium leading-snug text-white/75">{pushBody || "Corpo da mensagem que o entregador verá no celular."}</div>
                {pushImage.trim().startsWith("https://") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pushImage.trim()} alt="" className="mt-2 max-h-36 w-full rounded-[10px] object-cover" />
                )}
              </div>
              <div className="mt-2 text-center text-[10px] font-bold text-white/40">点按通知 → 打开 {pushUrl || "/rider-app"}</div>
            </div>
          </div>
        </div>

        {/* Send history */}
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <div className="mb-2 text-[10px] font-black uppercase text-[var(--muted)]">最近发送记录</div>
          {pushHistory.length === 0 ? (
            <div className="text-xs font-bold text-[var(--muted)]">暂无发送记录。</div>
          ) : (
            <div className="space-y-1.5">
              {pushHistory.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-[8px] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold">
                  <span className="text-[var(--muted)]">{h.createdAt}</span>
                  <span className="text-[var(--muted-strong)]">{h.detail}</span>
                </div>
              ))}
            </div>
          )}
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
