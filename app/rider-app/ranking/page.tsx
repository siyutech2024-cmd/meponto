"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Medal, ArrowLeft } from "lucide-react";

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
 */

type Entry = { rank: number; name: string; rider99Id: string; orders: number; pool: "standard" | "pro"; isMe: boolean };
type Board = { top: Entry[]; me: Entry | null; total: number; date?: string; from?: string; to?: string };
type Payload = { enabled: boolean; updatedAt?: string | null; daily?: Board | null; weekly?: Board | null };

const GOLD = "#eda100";

/** 前三名给奖牌色,其余用普通序号 —— 只突出真正的头部。 */
function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "#d4af37" : rank === 2 ? "#9fa6b2" : rank === 3 ? "#c07f4a" : null;
  if (!color) {
    return <span className="w-7 shrink-0 text-center text-[13px] font-black text-[var(--muted)]">{rank}</span>;
  }
  return (
    <span className="flex w-7 shrink-0 justify-center">
      <Medal size={17} style={{ color }} />
    </span>
  );
}

function Row({ entry, highlight }: { entry: Entry; highlight?: boolean }) {
  const isPro = entry.pool === "pro";
  return (
    <div
      className={`flex items-center gap-2 rounded-[8px] px-2 py-2.5 ${highlight ? "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]" : ""}`}
      style={!highlight && isPro ? { background: `${GOLD}0F` } : undefined}
    >
      <RankBadge rank={entry.rank} />
      <span className="min-w-0 flex-1 truncate text-sm font-black" style={isPro ? { color: GOLD } : undefined}>
        {entry.name}
        {isPro && (
          <span className="ml-1.5 rounded-full px-1.5 py-[1px] text-[9px] font-black" style={{ background: GOLD, color: "#171b33" }}>
            PRO
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-black tabular-nums">{entry.orders}</span>
    </div>
  );
}

function BoardView({ board, subtitle }: { board: Board | null | undefined; subtitle: string }) {
  if (!board) return null;
  if (board.top.length === 0) {
    return <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">Ainda sem dados para este período.</div>;
  }
  return (
    <div className="panel p-3">
      <div className="mb-2 px-2 text-[11px] font-bold text-[var(--muted)]">
        {subtitle} · {board.total} entregadores
      </div>
      <div className="space-y-0.5">
        {board.top.map((entry) => (
          <Row key={entry.rider99Id} entry={entry} highlight={entry.isMe} />
        ))}
      </div>
      {/* 我在榜外 —— 单独钉在底部。排行榜对排不进前列的人才最需要给个位置感。 */}
      {board.me && (
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <div className="mb-1 px-2 text-[10px] font-black uppercase text-[var(--muted)]">Sua posição</div>
          <Row entry={board.me} highlight />
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
  // gtag 由 layout 注入;WebView 里也会加载,所以 APP 内打开同样能统计到。
  useEffect(() => {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.("event", "leaderboard_open");
  }, []);

  // 后台开关关了 → 服务端返回 enabled:false。这里不显示任何榜单内容。
  const off = data && !data.enabled;
  const daily = data?.daily ?? null;
  const weekly = data?.weekly ?? null;
  // 只有一个榜开着时不显示切换,省得点了没反应。
  const bothOn = Boolean(daily && weekly);

  useEffect(() => {
    if (!daily && weekly) setTab("weekly");
  }, [daily, weekly]);

  return (
    <main className="min-h-screen bg-[#101010]">
      <div className="rider-light mx-auto min-h-screen w-full max-w-[430px] space-y-4 bg-[#f3f2ee] p-4 pb-10">
        {/* 返回:在 APP 的 WebView 里顶部有关闭按钮,但在浏览器里打开就出不去了。
            history.back() 两种场景都成立(从活动卡进来也是一次导航)。 */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => window.history.back()} className="tag inline-flex items-center gap-1">
            <ArrowLeft size={13} /> Voltar
          </button>
          <h1 className="flex items-center gap-2 text-lg font-black">
            <Trophy size={18} className="text-[var(--accent)]" /> Ranking de pedidos
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

        {data?.enabled && (
          <>
            {bothOn && (
              <div className="flex gap-2">
                {([["daily", "Hoje"], ["weekly", "Esta semana"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`inline-flex h-9 flex-1 items-center justify-center rounded-full text-xs font-black ${
                      tab === key ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line)] text-[var(--muted-strong)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {tab === "daily" && <BoardView board={daily} subtitle={daily?.date ?? ""} />}
            {tab === "weekly" && <BoardView board={weekly} subtitle={weekly ? `${weekly.from} – ${weekly.to}` : ""} />}

            {/* 口径声明 —— 必须写,否则骑手会拿榜单去质疑工资。
                榜单来自实时抓取,工资和考核以次日确认的报表为准。 */}
            <div className="panel p-3 text-[11px] font-bold leading-relaxed text-[var(--muted)]">
              Os números são atualizados ao longo do dia e servem apenas para acompanhamento.
              O valor a receber e a avaliação semanal seguem sempre o relatório confirmado no dia seguinte.
              {data.updatedAt && (
                <>
                  <br />
                  Atualizado: {String(data.updatedAt).slice(0, 16).replace("T", " ")}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
