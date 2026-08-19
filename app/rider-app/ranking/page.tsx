"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Trophy, ArrowLeft, Flame } from "lucide-react";

/**
 * 骑手排行榜(每日 / 每周订单榜)。
 *
 * ⚠️ 这张页面**故意不使用 `readSession()` / localStorage**。
 *
 * 它主要在 APP 的内嵌 WebView 里打开(A5)。WebView 注入的只有 `meponto_session`
 * **cookie**,localStorage 是另一套存储 —— 照抄别的 rider-app 页面用
 * readSession() 判断登录,页面在 APP 里会一律显示"请先登录"。
 *
 * 正确做法:直接 fetch,浏览器自动带 cookie,由**服务端**告诉我们"你是谁、
 * 你第几名"。响应里没有 me 就是没登录,页面照常显示榜单,只是不高亮某一行。
 *
 * 文案按 rider-app 惯例硬编码葡语。
 *
 * ── 口径:T+1 确认报表,不是实时抓取
 * 实测实时快照的名次是错的(详见 route.ts)。所以「日榜」是**昨日榜** ——
 * 取报表里最新有数据的一天。界面上必须把这个日期显示出来,
 * 否则骑手会以为是今天的,跑完一天回来看没变就会来问。
 *
 * ── 性能(2026-08-07 重做)
 * 卡顿来自两处,都已处理:
 *   1. 接口原本要传回整周 4 万多行快照 —— 换成 T+1 后一周约 1000 行,
 *      库内聚合后只回 ~150 行。
 *   2. 首屏一次性挂 30+ 行 DOM 且每行带独立动画,低端安卓机上会掉帧。
 *      现在只给前 10 行做进场动画(超过的部分肉眼也看不到),
 *      并用 transform/opacity 这类合成器属性,不触发重排。
 */

type Entry = { rank: number; name: string; rider99Id: string; orders: number; pool: "standard" | "pro"; isMe: boolean };
type Board = { top: Entry[]; me: Entry | null; total: number; date?: string; from?: string; to?: string; live?: boolean };
type Payload = { enabled: boolean; updatedAt?: string | null; daily?: Board | null; weekly?: Board | null };

const GOLD = "#eda100";
const MEDAL = ["#f5b301", "#9fb3c8", "#d08b4f"] as const;

/**
 * realme C100x 周榜活动(两期)。日榜不动,只有**周榜**的领奖台换成
 * realme 品牌黄的活动皮肤;活动结束后把 CAMPAIGN_WEEKS 清空即可整体回到
 * 深色默认皮肤,不用改别的代码。
 */
const CAMPAIGN_WEEKS = [
  { from: "2026-08-17", to: "2026-08-23", label: "17/08 – 23/08", award: "28/08" },
  { from: "2026-08-24", to: "2026-08-30", label: "24/08 – 30/08", award: "04/09" },
] as const;
const REALME_YELLOW = "linear-gradient(160deg, #FFD60A 0%, #FFC300 55%, #F5B301 100%)";

/** GA4 事件(gtag 由全局 layout 注入;不存在时静默跳过,不影响页面)。 */
function track(event: string, params?: Record<string, unknown>) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  gtag?.("event", event, params);
}

/**
 * ⚠️ 颜色一律走这个函数,不要用 `${color}66` 这种 8 位 hex 拼 alpha。
 *
 * 那个写法只对 hex 合法。名次色带是 `hsl(...)` 算出来的,
 * `hsl(14 78% 56%)66` 是**非法 CSS**,浏览器直接丢掉整条声明 ——
 * 结果就是进度条一条都不显示,而且控制台不报错,极难查。
 * (2026-08-07 实测踩过一次)
 */
function hsl(hue: number, sat: number, light: number, alpha = 1): string {
  return `hsl(${hue} ${sat}% ${light}% / ${alpha})`;
}
/** PRO 的金色也换成 hsl,好让它和色带用同一套 alpha 语法。 */
const PRO_C1 = (a = 1) => hsl(41, 100, 46, a);
const PRO_C2 = (a = 1) => hsl(45, 100, 74, a);

/**
 * 名次色带:第 1 名热橙,一路过渡到榜尾的紫。
 *
 * 为什么不用灰:灰色进度条只传达"长短",色相变化额外传达"你在哪个梯队" ——
 * 骑手不用读数字就知道自己离前面有多远。而且一屏彩条比一屏灰条好看得多。
 * 色相 14°(橙红) → 276°(紫),饱和度压在 78% 免得刺眼。
 */
function rankHue(rank: number, count: number): number {
  const span = Math.max(1, Math.min(count, 30) - 1);
  const t = Math.min(1, (rank - 1) / span);
  return 14 + t * 262;
}

/** 巴西人名很长,领奖台上只放"名 + 姓首字" —— 全名会挤成三行。 */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * 领奖台。前三名值得一个和第 27 名不一样的位置 —— 这是整张榜唯一真正
 * 「有奖」的部分,平铺成列表就没有任何戏剧性了。
 */
function Podium({ top, variant = "dark" }: { top: Entry[]; variant?: "dark" | "realme" }) {
  if (top.length < 3) return null;
  const realme = variant === "realme";
  // 视觉顺序 2-1-3,冠军在中间且台子最高。
  const order = [top[1], top[0], top[2]];
  // 活动皮肤台子加高一档,2/3 名要放得下"耳机"奖品标签。
  const heights = realme ? [80, 96, 68] : [58, 82, 44];
  return (
    <div className="flex items-end justify-center gap-2 px-2 pt-2">
      {order.map((entry, index) => {
        const medal = MEDAL[entry.rank - 1];
        const champion = entry.rank === 1;
        // 活动皮肤:黄底上文字一律近黑;冠军头像黑底黄字呼应奖品海报,
        // 台子用深色半透明块压住黄底,冠军台标注奖品。
        const avatarBg = realme && champion
          ? "linear-gradient(145deg, #111, #333)"
          : entry.pool === "pro" ? `linear-gradient(145deg, ${GOLD}, #b97900)` : `linear-gradient(145deg, ${medal}, ${medal}bb)`;
        return (
          <div key={entry.rider99Id} className="flex min-w-0 flex-1 flex-col items-center" style={{ animation: `rise .5s ${0.08 * index}s cubic-bezier(.2,.9,.3,1.2) both` }}>
            <div
              className="relative flex items-center justify-center rounded-full font-black"
              style={{
                width: champion ? 56 : 46,
                height: champion ? 56 : 46,
                background: avatarBg,
                color: realme && champion ? "#FFD60A" : "#171b33",
                fontSize: champion ? 17 : 14,
                boxShadow: realme ? "0 5px 14px rgba(0,0,0,.28)" : `0 6px 18px ${medal}55`,
                // PRO 冠军在活动皮肤里头像描金圈,保住金色身份。
                border: realme ? (entry.pool === "pro" ? `3px solid ${GOLD}` : "2px solid #fff") : undefined,
              }}
            >
              {initials(entry.name)}
              {champion && <span className="absolute -top-3 text-[18px] leading-none" style={{ animation: "bob 2.4s ease-in-out infinite" }}>👑</span>}
            </div>
            {/* PRO 标志:头像渐变色太隐晦(和金牌色几乎分不清),
                加显式徽章,和榜单行同一款。 */}
            <span className="mt-1.5 flex max-w-full items-center justify-center gap-1">
              <span className={`line-clamp-1 min-w-0 text-center text-[11px] font-black ${realme ? "text-[#111]" : "text-white/90"}`}>{shortName(entry.name)}</span>
              {entry.pool === "pro" && (
                // 活动黄底上黑色小徽章会和黑名字融成一团 —— 放大并描白边,
                // 黑底金字在黄底上重新跳出来。深色皮肤维持原金色胶囊。
                <span
                  className={`shrink-0 rounded-full font-black tracking-wide ${realme ? "px-1.5 py-[2px] text-[9px]" : "px-1 py-[1px] text-[8px]"}`}
                  style={realme
                    ? { background: "#111", color: "#FFD60A", border: "1.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)" }
                    : { background: `linear-gradient(135deg, ${GOLD}, #ffce4d)`, color: "#171b33" }}
                >
                  PRO
                </span>
              )}
            </span>
            <span className="text-[15px] font-black tabular-nums" style={{ color: realme ? "#111" : medal }}>{entry.orders}</span>
            {realme ? (
              <div
                className="mt-1 w-full rounded-t-[10px] text-center"
                style={{
                  height: heights[index],
                  background: champion
                    ? "linear-gradient(180deg, #111 0%, #2a2a2a 100%)"
                    : "linear-gradient(180deg, rgba(17,17,17,.8), rgba(17,17,17,.5))",
                  borderTop: champion ? "3px solid #FFD60A" : `3px solid ${medal}`,
                  boxShadow: champion ? "0 -4px 18px rgba(0,0,0,.25)" : undefined,
                }}
              >
                <div className="pt-1 text-[14px] font-black" style={{ color: "#FFD60A" }}>{entry.rank}</div>
                {champion ? (
                  <div className="px-1 text-[8.5px] font-black leading-[1.25]" style={{ color: "#FFD60A" }}>
                    realme C100x<br /><span className="text-white/90">8000mAh</span>
                  </div>
                ) : (
                  // 2/3 名奖品:耳机(与活动海报一致)。
                  <div className="px-1 text-[8.5px] font-black leading-[1.25] text-white/85">Fone de<br />ouvido</div>
                )}
              </div>
            ) : (
              <div
                className="mt-1 w-full rounded-t-[8px]"
                style={{
                  height: heights[index],
                  background: `linear-gradient(180deg, ${medal}66, ${medal}0a)`,
                  borderTop: `2px solid ${medal}`,
                }}
              >
                <div className="pt-1 text-center text-[13px] font-black" style={{ color: medal }}>{entry.rank}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 榜单行。
 *
 * 两处专门为滚动流畅做的处理:
 *   1. `contentVisibility: auto` —— 滚出视口的行浏览器直接跳过渲染。
 *      长列表滚动掉帧,九成是每行都在重复 paint;这一条最管用。
 *      配 `containIntrinsicSize` 给个占位高度,否则滚动条会跳。
 *   2. 进度条用 `transform: scaleX` 而不是 `width` —— width 每帧触发 layout,
 *      scaleX 只走合成器。
 */
function Row({ entry, max, count, delay }: { entry: Entry; max: number; count: number; delay: number }) {
  const isPro = entry.pool === "pro";
  // 最低 8% —— 末位也要看得见那根条,否则"进度条"在榜尾整个消失。
  const pct = max > 0 ? Math.max(8, Math.round((entry.orders / max) * 100)) : 0;
  const hue = rankHue(entry.rank, count);
  // PRO 保持金色身份;其余按名次取色带。alpha 版本单独取,别拼字符串。
  const c1 = isPro ? PRO_C1() : hsl(hue, 78, 56);
  const c2 = isPro ? PRO_C2() : hsl(hue + 18, 82, 66);
  const fill = isPro
    ? `linear-gradient(90deg, ${PRO_C1(0.42)} 0%, ${PRO_C1(0.3)} 62%, ${PRO_C2(0.12)} 100%)`
    : `linear-gradient(90deg, ${hsl(hue, 78, 56, 0.42)} 0%, ${hsl(hue, 78, 56, 0.3)} 62%, ${hsl(hue + 18, 82, 66, 0.1)} 100%)`;
  return (
    <div
      className="relative flex items-center gap-2.5 overflow-hidden rounded-[10px] px-2.5 py-2.5"
      style={{
        background: entry.isMe ? "rgba(237,161,0,.16)" : "rgba(255,255,255,.72)",
        outline: entry.isMe ? `1.5px solid ${GOLD}` : "1px solid rgba(23,27,51,.06)",
        outlineOffset: -1,
        contentVisibility: "auto",
        containIntrinsicSize: "auto 52px",
        animation: delay >= 0 ? `slide .34s ${delay}s cubic-bezier(.2,.9,.3,1) both` : undefined,
      }}
    >
      {/* 彩色进度条 = 一条横向背景色带。
          不加左右竖线:竖线在一屏十几行里会连成一列栅栏,反而抢眼;
          横条本身够长、够有色相,一眼就能比长短。靠饱和度让它看得见,
          不靠边框。末端做渐隐,不切一刀。
          用静态 width 而不是 scaleX —— 值从不变化,不存在每帧 layout。 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-[10px]"
        style={{ width: `${pct}%`, background: fill }}
      />
      <span className="relative w-6 shrink-0 text-center text-[13px] font-black tabular-nums" style={{ color: c1 }}>{entry.rank}</span>
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
        style={{ background: `linear-gradient(145deg, ${c1}, ${c2})` }}
      >
        {initials(entry.name)}
      </span>
      {/* 徽章必须在 truncate 容器**外面**:放里面时长名字会把徽章一起裁掉,
          只露出一条橙色残边(用户 2026-08-10 截图实锤)。名字自己截断,
          徽章 shrink-0 永远完整可见。 */}
      <span className="relative flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate text-[13px] font-black" style={isPro ? { color: "#8a5c00" } : undefined}>{entry.name}</span>
        {isPro && <span className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-black tracking-wide" style={{ background: `linear-gradient(135deg, ${GOLD}, #ffce4d)`, color: "#171b33", boxShadow: "0 1px 4px rgba(237,161,0,.5)" }}>PRO</span>}
      </span>
      <span className="relative shrink-0 text-sm font-black tabular-nums" style={{ color: c1 }}>{entry.orders}</span>
    </div>
  );
}

function Skeleton() {
  // 骨架屏而不是转圈:高度和真实榜单一致,数据到了不会整页跳一下。
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-[52px] rounded-[10px]" style={{ background: "rgba(0,0,0,.05)", animation: `pulse 1.4s ${index * 0.06}s ease-in-out infinite` }} />
      ))}
    </div>
  );
}

function BoardView({ board, subtitle, variant = "dark", stageExtra }: { board: Board | null | undefined; subtitle: string; variant?: "dark" | "realme"; stageExtra?: ReactNode }) {
  const rest = useMemo(() => board?.top.slice(3) ?? [], [board]);
  const max = board?.top[0]?.orders ?? 0;
  const realme = variant === "realme";
  if (!board) return null;
  if (board.top.length === 0) {
    return (
      <div className="space-y-3">
        {/* 空榜(比如第二期还没开赛)也要把奖品横幅和期次切换留在台上,
            否则骑手切过去就"什么都没了",不知道怎么切回来。 */}
        {stageExtra && (realme ? (
          <div className="relative overflow-hidden rounded-[14px] p-3" style={{ background: REALME_YELLOW, boxShadow: "0 10px 30px rgba(245,179,1,.35)" }}>{stageExtra}</div>
        ) : stageExtra)}
        <div className="panel p-8 text-center">
          <div className="text-[28px]">🛵</div>
          <div className="mt-2 text-sm font-bold text-[var(--muted)]">Ainda sem dados para este período.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* 领奖台舞台:默认深色;周榜活动期换 realme 品牌黄(黄底黑字),
          与 C100x 奖品海报同一视觉。 */}
      <div
        className="relative overflow-hidden rounded-[14px] p-3 pb-4"
        style={{
          background: realme ? REALME_YELLOW : "linear-gradient(160deg, #1b1f36 0%, #2a2140 55%, #3a1f33 100%)",
          boxShadow: realme ? "0 10px 30px rgba(245,179,1,.35)" : undefined,
          // 提成独立合成层 + 隔离重绘:里面几层大渐变就不会跟着滚动一起重画。
          transform: "translateZ(0)",
          contain: "paint",
        }}
      >
        {/* 顶部金色光晕。纯装饰,pointer-events 关掉。黄底上不需要。 */}
        {!realme && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full"
            style={{ background: `radial-gradient(closest-side, ${GOLD}55, transparent)` }}
          />
        )}
        {stageExtra}
        <div className="relative mb-1 flex items-center justify-between px-1">
          <span className={`text-[11px] font-bold ${realme ? "text-[#111]/60" : "text-white/55"}`}>{subtitle}</span>
          <span className={`text-[11px] font-bold ${realme ? "text-[#111]/60" : "text-white/55"}`}>{board.total} entregadores</span>
        </div>
        <Podium top={board.top} variant={variant} />
      </div>

      {rest.length > 0 && (
        <div className="panel space-y-1.5 p-2.5">
          {rest.map((entry, index) => (
            // 只有前 10 行做进场动画 —— 再往下用户滚到时早就渲染完了,
            // 给 30 行都挂动画在低端机上就是白白掉帧。
            <Row key={entry.rider99Id} entry={entry} max={max} count={board.top.length} delay={index < 10 ? 0.03 * index : -1} />
          ))}
        </div>
      )}

      {/* 我在榜外 —— 钉在底部。排行榜对排不进前列的人才最需要给个位置感。 */}
      {board.me && (
        <div className="panel p-3">
          <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-[var(--muted)]">Sua posição</div>
          <Row entry={board.me} max={max} count={board.top.length} delay={-1} />
        </div>
      )}
    </div>
  );
}

export default function RiderRankingPage() {
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  // 活动期次:null = 让服务端用当前周(默认行为);选了某期就带 ?week= 拉那一周。
  const [campaignWeek, setCampaignWeek] = useState<string | null>(null);

  const load = useCallback(async (week?: string | null) => {
    try {
      // 不带任何自定义 header —— 认证完全靠 cookie(APP WebView 已注入)。
      const url = week ? `/api/rider/leaderboard?week=${week}` : "/api/rider/leaderboard";
      const response = await fetch(url, { cache: "no-store", credentials: "include" });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setData((await response.json()).data as Payload);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load(campaignWeek);
  }, [load, campaignWeek]);

  /**
   * 返回按钮:**没有上一页就不显示**。
   *
   * 这页有两种进法:
   *   · 骑手端内部点进来 → 有上一页,显示 Voltar,back() 正常
   *   · APP 活动卡 → WebView 新开一个页面,history.length === 1,没有上一页。
   *     这种情况下 WebView 顶部本来就有原生关闭按钮 —— 页面里再放一个
   *     只会多此一举:back() 点了没反应,跳首页又会把人从活动里带走。
   *     不显示,把退出交给原生那颗。
   *
   * 判断必须放在 useEffect 里:服务端没有 window,写在渲染期会 hydration 不一致。
   */
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  // 打开率埋点。方案里要看"有多少人真的点进来" —— 没有这个数,
  // 就没法判断排行榜到底有没有用、要不要继续投入。
  useEffect(() => {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.("event", "leaderboard_open");
  }, []);

  const off = data && !data.enabled;
  const daily = data?.daily ?? null;
  const weekly = data?.weekly ?? null;
  const bothOn = Boolean(daily && weekly);

  useEffect(() => {
    if (!daily && weekly) setTab("weekly");
  }, [daily, weekly]);

  return (
    <main className="min-h-screen bg-[#101010]">
      {/* 动画全部走 transform / opacity —— 合成器属性,不触发重排,
          低端安卓机上也能跑满帧。prefers-reduced-motion 一律关掉。 */}
      <style>{`
        @keyframes rise { from { opacity:0; transform:translateY(14px) scale(.96) } to { opacity:1; transform:none } }
        @keyframes slide { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        @keyframes bob { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-3px) } }
        @keyframes pulse { 0%,100% { opacity:.5 } 50% { opacity:.85 } }
        @keyframes pop { from { transform:scale(.9); opacity:0 } to { transform:none; opacity:1 } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
      `}</style>

      <div
        className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 p-4 pb-10"
        style={{ background: "linear-gradient(180deg, #fff7e6 0%, #f3f2ee 22%, #f3f2ee 100%)" }}
      >
        {/* 返回:WebView 顶部有关闭按钮,但在浏览器里打开就出不去了。 */}
        <div className="flex items-center gap-3">
          {canGoBack && (
            <button type="button" onClick={() => window.history.back()} className="tag inline-flex items-center gap-1">
              <ArrowLeft size={13} /> Voltar
            </button>
          )}
          <h1 className="flex items-center gap-2 text-lg font-black">
            <Trophy size={18} style={{ color: GOLD }} /> Ranking de pedidos
          </h1>
        </div>

        {failed && (
          <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">
            Não foi possível carregar o ranking. Tente novamente mais tarde.
          </div>
        )}

        {off && (
          <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">
            O ranking está desativado no momento.
          </div>
        )}

        {!data && !failed && <Skeleton />}

        {data?.enabled && (
          <>
            {bothOn && (
              <div className="relative flex gap-2">
                {([["daily", daily?.live ? "Hoje" : "Último dia", <Flame key="f" size={13} />], ["weekly", "Esta semana", <Trophy key="t" size={13} />]] as const).map(([key, label, icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setTab(key); track("leaderboard_tab", { tab: key }); }}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-black"
                    style={
                      tab === key
                        ? { background: `linear-gradient(135deg, ${GOLD}, #ffc93c)`, color: "#171b33" }
                        : { border: "1px solid var(--line)", color: "var(--muted-strong)" }
                    }
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            )}

            {/* key 让切 tab 时整块重新播一次进场动画 —— 否则切换毫无反馈,
                会让人以为没点上。 */}
            <div key={tab} style={{ animation: "pop .26s ease-out both" }}>
              {/* 实时日榜写明"今天·半小时更新";回退 T+1 时必须带日期 ——
                  那是「昨天」的榜,不写清楚骑手会当成今天的。 */}
              {tab === "daily" && (
                <BoardView
                  board={daily}
                  subtitle={daily?.live ? "Hoje · atualiza a cada 30 min" : daily?.date ? `Dia ${daily.date}` : ""}
                />
              )}
              {tab === "weekly" && (
                <BoardView
                  board={weekly}
                  subtitle={weekly ? `${weekly.from} – ${weekly.to}` : ""}
                  variant={CAMPAIGN_WEEKS.length > 0 ? "realme" : "dark"}
                  stageExtra={CAMPAIGN_WEEKS.length > 0 ? (
                    <div className="relative">
                      {/* 奖品横幅:realme C100x 海报同款黄底黑字 + 双机剪影。 */}
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[20px]">🏆</span>
                          <div>
                            <div className="text-[15px] font-black leading-none tracking-tight text-[#111]">
                              realme C100x <span className="ml-0.5 rounded-[4px] border-[1.5px] border-[#111] px-[3px] align-[2px] text-[9px] font-black">NFC</span>
                            </div>
                            <div className="mt-0.5 text-[11px] font-black text-[#111]">
                              <span className="text-[15px]">8000</span>mAh Bateria · Prêmio do 1º lugar
                            </div>
                            <div className="text-[10px] font-black text-[#111]/70">2º e 3º lugar: fone de ouvido</div>
                          </div>
                        </div>
                        <div className="relative h-[58px] w-[44px] shrink-0" aria-hidden>
                          <span className="absolute right-0 top-[2px] h-[54px] w-[26px] rounded-[6px]" style={{ background: "linear-gradient(160deg,#1a2b4a,#0d1526)", boxShadow: "-2px 3px 8px rgba(0,0,0,.25)" }} />
                          <span className="absolute left-0 top-0 h-[54px] w-[26px] rounded-[6px]" style={{ background: "linear-gradient(160deg,#f5f0e6,#dcd4c2)", boxShadow: "-2px 3px 8px rgba(0,0,0,.2)" }}>
                            <span className="absolute left-[4px] top-[4px] h-2 w-2 rounded-full bg-[#333]" style={{ boxShadow: "0 10px 0 -2px #333" }} />
                          </span>
                        </div>
                      </div>
                      {/* 期次切换:17/08–23/08(颁奖 28/08)/ 24/08–30/08(颁奖 04/09)。 */}
                      <div className="mt-2.5 flex gap-1.5">
                        {CAMPAIGN_WEEKS.map((c) => {
                          const active = weekly?.from === c.from || (campaignWeek === null && weekly == null && c === CAMPAIGN_WEEKS[0]);
                          return (
                            <button
                              key={c.from}
                              type="button"
                              onClick={() => { setCampaignWeek(c.from); track("campaign_week_select", { week: c.from, label: c.label }); }}
                              className="flex-1 rounded-full px-1 py-[6px] text-[10.5px] font-black"
                              style={active
                                ? { background: "#111", color: "#FFD60A" }
                                : { background: "rgba(17,17,17,.08)", color: "#111", border: "1.5px solid rgba(17,17,17,.35)" }}
                            >
                              {c.label} · 🏅 {c.award}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : undefined}
                />
              )}
            </div>

            {/* 口径声明 —— 必须写,否则骑手会拿榜单去质疑工资。
                日榜实时时要说清:今天是实时的"部分"数据,最终以确认报表为准。 */}
            <div className="panel p-3 text-[11px] font-bold leading-relaxed text-[var(--muted)]">
              {daily?.live ? (
                <>
                  O ranking de hoje é parcial, em tempo real, e atualiza a cada 30 minutos.
                  A semana usa o relatório confirmado — o mesmo número do seu pagamento.
                  O número final de hoje fecha amanhã, no relatório.
                </>
              ) : (
                <>
                  O ranking usa o relatório confirmado — o mesmo número do seu pagamento e da avaliação semanal.
                  Por isso o dia de hoje entra amanhã, quando o relatório é fechado.
                  {data.updatedAt && (
                    <>
                      <br />
                      Último dia disponível: {String(data.updatedAt).slice(0, 10)}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
