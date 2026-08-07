"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, ArrowLeft, Home, Flame } from "lucide-react";

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
type Board = { top: Entry[]; me: Entry | null; total: number; date?: string; from?: string; to?: string };
type Payload = { enabled: boolean; updatedAt?: string | null; daily?: Board | null; weekly?: Board | null };

const GOLD = "#eda100";
const MEDAL = ["#f5b301", "#9fb3c8", "#d08b4f"] as const;

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
function Podium({ top }: { top: Entry[] }) {
  if (top.length < 3) return null;
  // 视觉顺序 2-1-3,冠军在中间且台子最高。
  const order = [top[1], top[0], top[2]];
  const heights = [58, 82, 44];
  return (
    <div className="flex items-end justify-center gap-2 px-2 pt-2">
      {order.map((entry, index) => {
        const medal = MEDAL[entry.rank - 1];
        const champion = entry.rank === 1;
        return (
          <div key={entry.rider99Id} className="flex min-w-0 flex-1 flex-col items-center" style={{ animation: `rise .5s ${0.08 * index}s cubic-bezier(.2,.9,.3,1.2) both` }}>
            <div
              className="relative flex items-center justify-center rounded-full font-black"
              style={{
                width: champion ? 56 : 46,
                height: champion ? 56 : 46,
                background: entry.pool === "pro" ? `linear-gradient(145deg, ${GOLD}, #b97900)` : `linear-gradient(145deg, ${medal}, ${medal}bb)`,
                color: "#171b33",
                fontSize: champion ? 17 : 14,
                boxShadow: `0 6px 18px ${medal}55`,
              }}
            >
              {initials(entry.name)}
              {champion && <span className="absolute -top-3 text-[18px] leading-none" style={{ animation: "bob 2.4s ease-in-out infinite" }}>👑</span>}
            </div>
            <span className="mt-1.5 line-clamp-1 max-w-full text-center text-[11px] font-black text-white/90">
              {shortName(entry.name)}
            </span>
            <span className="text-[15px] font-black tabular-nums" style={{ color: medal }}>{entry.orders}</span>
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
  const ratio = max > 0 ? Math.max(0.06, entry.orders / max) : 0;
  const hue = rankHue(entry.rank, count);
  // PRO 保持金色身份;其余按名次取色带。
  const c1 = isPro ? GOLD : `hsl(${hue} 78% 56%)`;
  const c2 = isPro ? "#ffd97a" : `hsl(${hue + 18} 82% 66%)`;
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
      {/* 彩色进度底纹。绝对定位 + scaleX,不影响文字排版也不触发 layout。 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-full origin-left rounded-[10px]"
        style={{
          background: `linear-gradient(90deg, ${c1}38, ${c2}14)`,
          transform: `scaleX(${ratio})`,
          transition: "transform .55s cubic-bezier(.2,.9,.3,1)",
        }}
      />
      {/* 左侧一道实色条 —— 名次色带的"锚点",一眼分辨梯队。 */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${c1}, ${c2})` }} />
      <span className="relative w-6 shrink-0 text-center text-[13px] font-black tabular-nums" style={{ color: c1 }}>{entry.rank}</span>
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
        style={{ background: `linear-gradient(145deg, ${c1}, ${c2})` }}
      >
        {initials(entry.name)}
      </span>
      <span className="relative min-w-0 flex-1 truncate text-[13px] font-black" style={isPro ? { color: "#8a5c00" } : undefined}>
        {entry.name}
        {isPro && <span className="ml-1.5 rounded-full px-1.5 py-[1px] text-[9px] font-black" style={{ background: GOLD, color: "#171b33" }}>PRO</span>}
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

function BoardView({ board, subtitle }: { board: Board | null | undefined; subtitle: string }) {
  const rest = useMemo(() => board?.top.slice(3) ?? [], [board]);
  const max = board?.top[0]?.orders ?? 0;
  if (!board) return null;
  if (board.top.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <div className="text-[28px]">🛵</div>
        <div className="mt-2 text-sm font-bold text-[var(--muted)]">Ainda sem dados para este período.</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* 领奖台放在深色"舞台"上 —— 和下面浅色的列表拉开层次,
          前三名才有被单独打光的感觉。 */}
      <div
        className="relative overflow-hidden rounded-[14px] p-3 pb-4"
        style={{
          background: "linear-gradient(160deg, #1b1f36 0%, #2a2140 55%, #3a1f33 100%)",
          // 提成独立合成层 + 隔离重绘:里面几层大渐变就不会跟着滚动一起重画。
          transform: "translateZ(0)",
          contain: "paint",
        }}
      >
        {/* 顶部金色光晕。纯装饰,pointer-events 关掉。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full"
          style={{ background: `radial-gradient(closest-side, ${GOLD}55, transparent)` }}
        />
        <div className="relative mb-1 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-white/55">{subtitle}</span>
          <span className="text-[11px] font-bold text-white/55">{board.total} entregadores</span>
        </div>
        <Podium top={board.top} />
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

  const load = useCallback(async () => {
    try {
      // 不带任何自定义 header —— 认证完全靠 cookie(APP WebView 已注入)。
      const response = await fetch("/api/rider/leaderboard", { cache: "no-store", credentials: "include" });
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
    void load();
  }, [load]);

  /**
   * 返回按钮:能不能 back 要在运行时判断,不能写死。
   *
   * 这页有两种进法:
   *   · APP 活动卡 → WebView 新开一个页面,**没有上一页**(history.length === 1)。
   *     无脑 history.back() 什么都不会发生 —— 按钮看着能点,点了没反应。
   *   · 骑手端内部点进来 → 有上一页,back() 正常。
   *
   * 所以:有历史就返回,没历史就回骑手端首页,并且把按钮文案也换掉
   * (写"Voltar"却跳首页会让人以为点错了)。
   */
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);
  const goBack = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/"; // app.meponto.com/ = 骑手端首页
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
          <button type="button" onClick={goBack} className="tag inline-flex items-center gap-1">
            {canGoBack ? <ArrowLeft size={13} /> : <Home size={13} />}
            {canGoBack ? "Voltar" : "Início"}
          </button>
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
                {([["daily", "Último dia", <Flame key="f" size={13} />], ["weekly", "Esta semana", <Trophy key="t" size={13} />]] as const).map(([key, label, icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
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
              {/* 副标题必须带日期 —— 这是「昨天」的榜,不写清楚骑手会当成今天的。 */}
              {tab === "daily" && <BoardView board={daily} subtitle={daily?.date ? `Dia ${daily.date}` : ""} />}
              {tab === "weekly" && <BoardView board={weekly} subtitle={weekly ? `${weekly.from} – ${weekly.to}` : ""} />}
            </div>

            {/* 口径声明 —— 必须写,否则骑手会拿榜单去质疑工资。 */}
            <div className="panel p-3 text-[11px] font-bold leading-relaxed text-[var(--muted)]">
              O ranking usa o relatório confirmado — o mesmo número do seu pagamento e da avaliação semanal.
              Por isso o dia de hoje entra amanhã, quando o relatório é fechado.
              {data.updatedAt && (
                <>
                  <br />
                  Último dia disponível: {String(data.updatedAt).slice(0, 10)}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
