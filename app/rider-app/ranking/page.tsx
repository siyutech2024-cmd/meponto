"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
type Board = { top: Entry[]; me: Entry | null; total: number; date?: string; from?: string; to?: string };
type Payload = { enabled: boolean; updatedAt?: string | null; daily?: Board | null; weekly?: Board | null };

const GOLD = "#eda100";
const MEDAL = ["#d4af37", "#9fa6b2", "#c07f4a"] as const;

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
            <span className="mt-1.5 line-clamp-1 max-w-full text-center text-[11px] font-black" style={entry.pool === "pro" ? { color: GOLD } : undefined}>
              {shortName(entry.name)}
            </span>
            <span className="text-[15px] font-black tabular-nums" style={{ color: medal }}>{entry.orders}</span>
            <div
              className="mt-1 w-full rounded-t-[8px]"
              style={{
                height: heights[index],
                background: `linear-gradient(180deg, ${medal}44, ${medal}0d)`,
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

/** 榜单行。max 用来画"进度条底纹",让单量差距一眼看出来,不用读数字。 */
function Row({ entry, max, delay }: { entry: Entry; max: number; delay: number }) {
  const isPro = entry.pool === "pro";
  const pct = max > 0 ? Math.max(6, Math.round((entry.orders / max) * 100)) : 0;
  return (
    <div
      className="relative flex items-center gap-2.5 overflow-hidden rounded-[10px] px-2.5 py-2.5"
      style={{
        background: entry.isMe ? "rgba(237,161,0,.14)" : isPro ? `${GOLD}0d` : "rgba(0,0,0,.03)",
        boxShadow: entry.isMe ? `inset 0 0 0 1.5px ${GOLD}` : undefined,
        animation: delay >= 0 ? `slide .34s ${delay}s cubic-bezier(.2,.9,.3,1) both` : undefined,
      }}
    >
      {/* 底纹条。绝对定位 + 只动 width,不影响文字排版。 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-[10px]"
        style={{ width: `${pct}%`, background: isPro ? `${GOLD}1f` : "rgba(23,27,51,.06)", transition: "width .6s cubic-bezier(.2,.9,.3,1)" }}
      />
      <span className="relative w-6 shrink-0 text-center text-[13px] font-black text-[var(--muted)] tabular-nums">{entry.rank}</span>
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
        style={{ background: isPro ? GOLD : "rgba(23,27,51,.1)", color: isPro ? "#171b33" : "var(--muted-strong)" }}
      >
        {initials(entry.name)}
      </span>
      <span className="relative min-w-0 flex-1 truncate text-[13px] font-black" style={isPro ? { color: GOLD } : undefined}>
        {entry.name}
        {isPro && <span className="ml-1.5 rounded-full px-1.5 py-[1px] text-[9px] font-black" style={{ background: GOLD, color: "#171b33" }}>PRO</span>}
      </span>
      <span className="relative shrink-0 text-sm font-black tabular-nums">{entry.orders}</span>
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
      <div className="panel overflow-hidden p-3 pb-4">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-[var(--muted)]">{subtitle}</span>
          <span className="text-[11px] font-bold text-[var(--muted)]">{board.total} entregadores</span>
        </div>
        <Podium top={board.top} />
      </div>

      {rest.length > 0 && (
        <div className="panel space-y-1.5 p-3">
          {rest.map((entry, index) => (
            // 只有前 10 行做进场动画 —— 再往下用户滚到时早就渲染完了,
            // 给 30 行都挂动画在低端机上就是白白掉帧。
            <Row key={entry.rider99Id} entry={entry} max={max} delay={index < 10 ? 0.03 * index : -1} />
          ))}
        </div>
      )}

      {/* 我在榜外 —— 钉在底部。排行榜对排不进前列的人才最需要给个位置感。 */}
      {board.me && (
        <div className="panel p-3">
          <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wide text-[var(--muted)]">Sua posição</div>
          <Row entry={board.me} max={max} delay={-1} />
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

      <div className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 bg-[#f3f2ee] p-4 pb-10">
        {/* 返回:WebView 顶部有关闭按钮,但在浏览器里打开就出不去了。 */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => window.history.back()} className="tag inline-flex items-center gap-1">
            <ArrowLeft size={13} /> Voltar
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
                        ? { background: GOLD, color: "#171b33", boxShadow: `0 4px 14px ${GOLD}55` }
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
