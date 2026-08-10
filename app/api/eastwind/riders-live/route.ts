import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { Rider } from "../../../lib/data";
import { extractRiderPerf } from "../../../lib/eastwind";

/**
 * Live rider monitor feed for the HQ / franchise / station dashboards.
 *
 *   GET /api/eastwind/riders-live?franchise=<name>&ponto=<name>
 *
 * Reads the latest Eastwind snapshot batch (rider_status_snapshots + KPI),
 * joins each rider to its MePonto profile (ninetyNineId → rider_ext_id, else
 * cpf → id_no, else phone) to attach ownership (franchise / ponto / leader),
 * then scopes: HQ → all (unmatched flagged 未归属); franchise/ponto → own only.
 *
 * Returns rows (with a normalized status category + Chinese label) plus
 * per-status / per-franchise / per-ponto summaries and the header KPI.
 */

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Normalize Eastwind workStatus → a stable category + Chinese label.
// Categories are fixed so the dashboard columns/cards are always consistent.
type Cat = "delivering" | "online" | "notOnline" | "below" | "outArea" | "other";
const CAT_BY_CODE: Record<string, { cat: Cat; label: string }> = {
  "2": { cat: "delivering", label: "配送中" },
  "4": { cat: "online", label: "在线" },
  "3": { cat: "outArea", label: "不在区域内" },
};
// Classify by status TEXT first (the displayed status), code only as fallback.
// IMPORTANT: "Não está online" (未履约/未上线) contains "online" but is negated,
// so the not-online check must run BEFORE the online check.
// ⚠ "Ausente"(离开/挂起)不是未上线!用户 2026-08-10 实锤:Ausente 骑手
// 有 28 分钟在线 + 28 分钟休息记录 —— 是登录后的暂离状态,和 Em pausa
// 一样归"在线"档。之前把它并进未上线,导致未上线卡比 99 官方多出几人。
// 修完之后:未上线卡 = 99 看板 Não está online 的原数。
function classify(statusCode: string | null, statusStr: string | null): { cat: Cat; label: string } {
  const s = (statusStr || "").toLowerCase();
  if (/entregando|em rota/.test(s)) return { cat: "delivering", label: "配送中" };
  if (/não está online|nao esta online|não conectado|nao conectado|offline|desconect|未履约|未上线|未在线/.test(s))
    return { cat: "notOnline", label: "未上线" };
  if (/conectado|em pausa|pausa|ausente|\bonline\b/.test(s)) return { cat: "online", label: "在线" };
  if (/abaixo|expectativ|不及预期/.test(s)) return { cat: "below", label: "不及预期" };
  if (/fora|área|area|不在区域/.test(s)) return { cat: "outArea", label: "不在区域内" };
  const byCode = statusCode != null ? CAT_BY_CODE[String(statusCode)] : undefined;
  if (byCode) return byCode;
  return { cat: "other", label: statusStr || "未知" };
}
const EMPTY_CATS = () => ({ delivering: 0, online: 0, notOnline: 0, below: 0, outArea: 0, other: 0 });

type SnapshotRow = {
  rider_ext_id: string | null; rider_name: string | null; phone: string | null; id_no: string | null;
  status: string | null; status_code: string | null; shift_start: string | null; shift_end: string | null;
  hot_zone: string | null; vehicle: string | null; online_mins: number | null; rest_mins: number | null;
  finished_cnt: number | null; lat: number | null; lng: number | null;
  error_show: string | null; raw: unknown;
  source?: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  let franchise = url.searchParams.get("franchise")?.trim() || "";
  let ponto = url.searchParams.get("ponto")?.trim() || "";

  // ---- Session scope enforcement (same rule as /api/mall) -----------------
  // The query params exist for the dashboards' convenience, but the SESSION
  // decides what a caller may see: franchise sessions are pinned to their own
  // franchise, station sessions to their own station — a caller-supplied
  // param can never widen the view. HQ passes params through untouched.
  const { scopeFromRequest } = await import("../../../lib/server/authz");
  const sessionScope = await scopeFromRequest(request);
  if (sessionScope.station) {
    ponto = sessionScope.station;
    franchise = "";
  } else if (sessionScope.franchise) {
    franchise = sessionScope.franchise;
    ponto = ""; // station drill-down for franchise views stays client-side
  }

  const client = getSupabaseServerClient();
  // TWO feeds write here (main VPS + PRO VPS, disjoint rider sets). Each
  // source keeps its own cadence, so the live board is the UNION of each
  // source's LATEST batch — one lagging feed must not hide the other.
  //
  // ⚠ 修 bug(2026-08-10,PRO 上线当天用户实测"PRO 骑手时有时无"):
  // 原来是拉"最近 60 行"再归类找各源最新批 —— 但快照是**一行一骑手**,
  // 主号一批就是 63 行;只要主号批次比 PRO 新,60 行窗口全被主号占满,
  // PRO 层整层消失。谁的批次新谁就把对方挤掉。现在按源各查最新一批。
  const KNOWN_SOURCES = ["main", "pro"] as const;
  const latestBySource = new Map<string, string>();
  const latestPerSource = await Promise.all(
    KNOWN_SOURCES.map((src) =>
      client
        .from("rider_status_snapshots")
        .select("captured_at")
        .eq("source", src)
        .order("captured_at", { ascending: false })
        .limit(1)
        .then((r) => ({ src, at: (r.data?.[0] as { captured_at: string } | undefined)?.captured_at ?? null, error: r.error })),
    ),
  );
  for (const { error } of latestPerSource) {
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
  }
  for (const { src, at } of latestPerSource) {
    if (at) latestBySource.set(src, at);
  }
  // 新鲜度护栏:某源断供(会话掉线/服务停)时,它的"最新批"可能是几小时
  // 前的,不能再当实时层展示。以最新的源为基准,落后超过 20 分钟的源剔除。
  // 用相对基准而不是绝对时钟,收班后(两源都停)看板仍能显示最后状态。
  const newest = [...latestBySource.values()].sort().reverse()[0] ?? null;
  if (newest) {
    const cutoff = new Date(new Date(newest).getTime() - 20 * 60_000).toISOString();
    for (const [src, at] of latestBySource) {
      if (at < cutoff) latestBySource.delete(src);
    }
  }
  const capturedAt = newest;

  let snapshots: SnapshotRow[] = [];
  let kpi: Record<string, unknown> | null = null;
  let kpiPro: Record<string, unknown> | null = null;
  if (capturedAt) {
    const batches = await Promise.all(
      [...latestBySource.entries()].map(([src, at]) =>
        client.from("rider_status_snapshots").select("*").eq("captured_at", at).eq("source", src).then((r) => (r.data ?? []) as SnapshotRow[]),
      ),
    );
    snapshots = batches.flat();
    // City KPI:**当前班次**口径(业务方 2026-08-07 定)。
    //
    // 实时看板的语义是"现在",所以 KPI 显示当前班段(11/14/18 点切班)的读数;
    // 全天累计在「当日数据」页看(那边是班段求和)。两页分工,不再混。
    //
    // 但不能傻取"最新一批":换班后的头几分钟 Eastwind 面板是空的,抓到的
    // 批次全 0/NULL(实测 18:20 批),直接显示会像看板坏了。所以:
    //   1. 按"计数明显回落"自动定位当前班段的起点(不依赖排班时刻)
    //   2. 取当前班段内**最新一个有读数**的批次显示
    //   3. 班段刚开始、一个有值批都没有时,数字如实显示 0(当前班次确实刚起步)
    const spDayStart = (() => {
      const sp = new Date(Date.now() - 3 * 3600_000);
      return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3)).toISOString();
    })();
    const { data: kpiRows } = await client
      .from("rider_kpi_snapshots")
      .select("captured_at, source, ar, caa, accept_cnt, overtime, tsh, finished_cnt")
      .gte("captured_at", spDayStart)
      .order("captured_at", { ascending: true })
      .limit(1000); // 两个源 × 3 分钟一批,一天最多 ~480 批
    if (kpiRows && kpiRows.length) {
      type KRow = { captured_at: string; source?: string | null; ar: number | null; caa: number | null; accept_cnt: number | null; overtime: number | null; tsh: number | null; finished_cnt: number | null };
      // ⚠ 必须**分源**统计:两个 Eastwind 账号各有自己的城市计数器,量级差
      // 两个数量级(主号几百 vs PRO 个位数)。混在一个序列里,PRO 的小读数
      // 会被"计数明显回落"的换班检测当成换班,班段起点被反复误判。
      const grouped = new Map<string, KRow[]>();
      for (const row of kpiRows as KRow[]) {
        const src = row.source ?? "main";
        const list = grouped.get(src) ?? [];
        list.push(row);
        grouped.set(src, list);
      }
      const perSource: KRow[] = [];
      for (const [src, rows] of grouped.entries()) {
        // 定位当前班段起点:计数从高位明显回落 = 新班段开始。
        let slotStart = 0;
        let acceptMax = 0, finishedMax = 0;
        for (let i = 0; i < rows.length; i += 1) {
          const a = rows[i].accept_cnt ?? 0, f = rows[i].finished_cnt ?? 0;
          if (a < acceptMax * 0.5 && f < finishedMax * 0.5 && (acceptMax > 5 || finishedMax > 5)) {
            slotStart = i;
            acceptMax = 0; finishedMax = 0;
          }
          if (a > acceptMax) acceptMax = a;
          if (f > finishedMax) finishedMax = f;
        }
        // 当前班段内最新的有读数批次(跳过换班空窗的全 0/NULL 批)。
        const slot = rows.slice(slotStart);
        const lastRated = [...slot].reverse().find((row) => row.ar != null || (row.accept_cnt ?? 0) > 0 || (row.finished_cnt ?? 0) > 0);
        if (lastRated) {
          perSource.push(lastRated);
          // PRO 源单独留一份 —— KPI 条上以金色小字副值显示(业务方
          // 2026-08-10 定,与 T+1 看板顶卡的 PRO 小计同一套视觉语言)。
          if (src === "pro") kpiPro = lastRated as unknown as Record<string, unknown>;
        }
      }
      if (perSource.length) {
        // 计数可加(两个账号的骑手集不相交);比率不可加,取主导源
        // (完单多的那个 —— 即主号)的读数,量级上就是全城比率。
        const dom = perSource.reduce((a, b) => ((b.finished_cnt ?? 0) > (a.finished_cnt ?? 0) ? b : a));
        kpi = {
          ar: dom.ar ?? null,
          caa: dom.caa ?? null,
          overtime: dom.overtime ?? null,
          tsh: dom.tsh ?? null,
          accept_cnt: perSource.reduce((n, r) => n + (r.accept_cnt ?? 0), 0),
          finished_cnt: perSource.reduce((n, r) => n + (r.finished_cnt ?? 0), 0),
        };
      }
    }
  }

  await refreshCollectionsFromDatabase(["riders"]);
  const by99 = new Map<string, Rider>(), byCpf = new Map<string, Rider>(), byPhone = new Map<string, Rider>();
  for (const r of memory.riders as Rider[]) {
    if (r.ninetyNineId) by99.set(String(r.ninetyNineId), r);
    if (r.cpf) byCpf.set(digits(r.cpf), r);
    if (r.phone) byPhone.set(digits(r.phone), r);
  }

  // AUTO-MATERIALIZATION DISABLED (2026-07-21 incident): an instance holding a
  // STALE riders view re-created profiles for riders that already existed, and
  // the resulting mass write-back reverted fresh franchise assignments to
  // "Unassigned" (materialize→merge→stale-flush churn). Until the data-core
  // migration gives us a single source of truth (W4), this endpoint is
  // READ-ONLY: unmatched live riders surface in the /riders onboarding queue
  // (matched:false) for MANUAL onboarding instead.

  const rows = snapshots.map((s) => {
    const match =
      (s.rider_ext_id && by99.get(String(s.rider_ext_id))) ||
      (s.id_no && byCpf.get(digits(s.id_no))) ||
      (s.phone && byPhone.get(digits(s.phone))) || null;
    const { cat, label } = classify(s.status_code, s.status);
    return {
      riderExtId: s.rider_ext_id, name: match?.name || s.rider_name, phone: s.phone,
      status: s.status, statusLabel: label, cat,
      shift: [s.shift_start, s.shift_end].filter(Boolean).join("-"),
      hotZone: s.hot_zone, vehicle: s.vehicle, onlineMins: s.online_mins, restMins: s.rest_mins,
      finishedCnt: s.finished_cnt, lat: s.lat, lng: s.lng,
      franchise: match?.franchise || "", ponto: match?.ponto || "", leader: match?.leader || "",
      // 模式二: pool membership for the PRO realtime monitor view.
      // 规则(业务方 2026-08-10 定):在新 Eastwind(PRO 账号)看板上出现
      // 即为 PRO —— 快照的 source 直接定池,档案匹配只是补充(没建档 /
      // 还没被入库自动标记的骑手也立即显示为 PRO,不会误归普通池)。
      pool: s.source === "pro" || match?.pool === "pro" ? "pro" : "standard",
      // "Unassigned" is the placeholder franchise for auto-materialized
      // profiles — those riders are NOT assigned yet (the 只看未归属 filter
      // was matching nobody because the placeholder string is truthy).
      assigned: Boolean(match && match.franchise && match.franchise !== "Unassigned"),
      // No MePonto profile at all (99 ID / CPF / phone all unmatched) — the
      // riders page surfaces these so operations can onboard + assign.
      // (CPF deliberately NOT exposed here: list endpoints stay masked.)
      matched: Boolean(match),
      // Per-rider "Performance in Current Shift" detail (tolerant extraction
      // from the stored raw record; missing fields are null → shown as N/A).
      perf: extractRiderPerf(s.raw),
    };
  });

  // 模式二: optional pool filter (?pool=pro) — the PRO realtime monitor view.
  // Orthogonal to the session scope pinning above (a franchise session asking
  // for pool=pro sees only ITS OWN pro riders).
  const poolParam = url.searchParams.get("pool")?.trim() || "";
  const scoped = rows.filter((r) => {
    if (poolParam && r.pool !== poolParam) return false;
    if (franchise) return r.franchise === franchise;
    if (ponto) return r.ponto === ponto;
    return true;
  });

  // Summaries.
  const cats = EMPTY_CATS();
  const frAgg: Record<string, { total: number; finished: number } & ReturnType<typeof EMPTY_CATS>> = {};
  const ptAgg: Record<string, { total: number; finished: number } & ReturnType<typeof EMPTY_CATS>> = {};
  for (const r of scoped) {
    cats[r.cat] += 1;
    for (const [key, name] of [["fr", r.franchise || "未归属"], ["pt", r.ponto || "未归属"]] as const) {
      const agg = key === "fr" ? frAgg : ptAgg;
      agg[name] = agg[name] || { total: 0, finished: 0, ...EMPTY_CATS() };
      agg[name].total += 1;
      agg[name].finished += r.finishedCnt || 0;
      agg[name][r.cat] += 1;
    }
  }
  const sortAgg = (agg: typeof frAgg) =>
    Object.entries(agg).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);

  // Scope-level KPI (franchise/station views): aggregate the per-rider
  // "Performance in Current Shift" counters with Eastwind's OWN formulas —
  //   AR = accepts / (accepts + declines)
  //   CAA = cancels-after-accept / accepts
  //   ATRASO(overtime) = delayed / finished
  //   %TSH = online-minutes-weighted mean of per-rider TSH
  // Count-based (exact) when the counters exist; falls back to the mean of
  // per-rider percentages only where Eastwind omitted counters entirely.
  // 班段已过分钟数(圣保罗时钟):TSH 的权重底数。
  // 例:14:00-18:00 班,现在 15:30 → 已过 90 分钟;班还没开始 → 0。
  const spNowMin = (() => {
    const sp = new Date(Date.now() - 3 * 3600_000);
    return sp.getUTCHours() * 60 + sp.getUTCMinutes();
  })();
  const parseHM = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const elapsedSlotMin = (shift: string): number => {
    const [st, en] = shift.split("-");
    const start = st != null ? parseHM(st) : null;
    const end = en != null ? parseHM(en) : null;
    if (start == null || end == null || end <= start) return 0;
    return Math.max(0, Math.min(spNowMin, end) - start);
  };
  const aggregateScopeKpi = (rowsIn: typeof scoped) => {
    if (rowsIn.length === 0) return null;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    let accept = 0, declined = 0, cancelled = 0, delayed = 0, finished = 0;
    let arSum = 0, arN = 0, caaSum = 0, caaN = 0, otSum = 0, otN = 0, tshWeighted = 0, tshWeight = 0;
    for (const row of rowsIn) {
      const p = row.perf;
      if (typeof p.acceptCnt === "number") accept += p.acceptCnt;
      if (typeof p.declinedCnt === "number") declined += p.declinedCnt;
      if (typeof p.cancelledCnt === "number") cancelled += p.cancelledCnt;
      if (typeof p.delayedCnt === "number") delayed += p.delayedCnt;
      finished += row.finishedCnt || 0;
      if (typeof p.ar === "number") { arSum += p.ar; arN += 1; }
      if (typeof p.caa === "number") { caaSum += p.caa; caaN += 1; }
      if (typeof p.overtime === "number") { otSum += p.overtime; otN += 1; }
      // ── TSH(2026-08-10 修口径,业务方指出):
      // 旧算法只平均"有 TSH 读数"的骑手,还按在线分钟加权 —— 未上线的
      // 骑手没有读数被整个排除,旷工不拉低团队 TSH,数字系统性虚高。
      // 新口径:排了班就计入 —— 未上线按 0 计;权重 = 班段已过时长
      // (同班段人人相等,跨班段长短公平;班段没开始的权重为 0 不参与)。
      // 在线但读数缺失(抽取失败)的仍跳过,不冤枉人。
      const elapsed = elapsedSlotMin(row.shift ?? "");
      if (elapsed > 0) {
        if (typeof p.tsh === "number") {
          tshWeighted += p.tsh * elapsed;
          tshWeight += elapsed;
        } else if (row.cat === "notOnline") {
          tshWeight += elapsed; // TSH=0,只加权重
        }
      }
    }
    const offers = accept + declined;
    return {
      ar: offers > 0 ? r1((accept / offers) * 100) : arN > 0 ? r1(arSum / arN) : null,
      caa: accept > 0 ? r1((cancelled / accept) * 100) : caaN > 0 ? r1(caaSum / caaN) : null,
      acceptCnt: offers > 0 || accept > 0 ? accept : null,
      overtime: finished > 0 ? r1((delayed / finished) * 100) : otN > 0 ? r1(otSum / otN) : null,
      tsh: tshWeight > 0 ? r1(tshWeighted / tshWeight) : null,
      finishedCnt: finished,
    };
  };
  const isScopedView = Boolean(franchise || ponto);
  const scopeKpi = isScopedView ? aggregateScopeKpi(scoped) : null; // HQ keeps the city KPI row
  // 加盟商/站点视角的 PRO 副值:**自家 PRO 骑手**按同一套公式单独聚合。
  // (总部视角的 PRO 副值走 kpiPro —— PRO 账号的城市读数,口径更准。)
  const scopeKpiPro = isScopedView ? aggregateScopeKpi(scoped.filter((r) => r.pool === "pro")) : null;

  return jsonResponse({
    data: {
      capturedAt,
      kpi: kpi ? { ar: kpi.ar, caa: kpi.caa, acceptCnt: kpi.accept_cnt, overtime: kpi.overtime, tsh: kpi.tsh, finishedCnt: kpi.finished_cnt } : null,
      // PRO 源当前班次读数 —— 存在才带(PRO 收班/断供时为 null,前端不显示)。
      kpiPro: kpiPro ? { ar: kpiPro.ar, caa: kpiPro.caa, acceptCnt: kpiPro.accept_cnt, overtime: kpiPro.overtime, tsh: kpiPro.tsh, finishedCnt: kpiPro.finished_cnt } : null,
      scopeKpi,
      scopeKpiPro,
      riders: scoped,
      summary: {
        total: scoped.length,
        assigned: scoped.filter((r) => r.assigned).length,
        unassigned: scoped.filter((r) => !r.assigned).length,
        finishedTotal: scoped.reduce((sum, r) => sum + (r.finishedCnt || 0), 0),
        cats,
        byFranchise: sortAgg(frAgg),
        byPonto: sortAgg(ptAgg),
      },
    },
  });
}
