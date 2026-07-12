"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import type { MarketplaceOrder } from "../../lib/points";
import { Chip, DataTable, Drawer, Pager, SearchInput, Skeleton, TodoCard, Toolbar, type DataColumn } from "../kit";
import { orderStatusLabel, paymentStatusChip, statusBadge, useMallAdmin } from "./context";

/** 订单履约 — 待办卡 + Toolbar + DataTable + Drawer 工作台。
 *  平面管理：总部在此直接完成整条履约链（审核放行 → 到站/批量到站 → 交付），
 *  不依赖站点工作台。行内只保留一个最主要操作，完整操作集中在订单抽屉；
 *  勾选多个在途（created）订单可「批量到站」（batchArrived action）；
 *  「按站点分组」切换合并了原站点工作台的今日待取视图——逐站点列出
 *  已到站待取订单，总部可直接逐单交付。 */

const ORDER_PAGE_SIZE = 50;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 可参与「批量到站」：实体在途订单，未被高价值审核挂起，非合作方直送。 */
const canBatchArrive = (order: MarketplaceOrder) =>
  order.status === "created" && !order.voucherCode && order.reviewStatus !== "pending" && order.accountType !== "partner";

const ROW_BTN = "h-8 rounded-[8px] border border-[var(--accent)]/40 px-2.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10";
const PRIMARY_BTN = "inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]";
const DANGER_BTN = "inline-flex h-9 items-center rounded-[8px] border border-[var(--danger)]/40 px-3.5 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-bg)]";

export default function OrdersTab() {
  const { loading, mall, setMall, optimisticPost, patchOrder, preset, clearPreset } = useMallAdmin();
  const dialog = useDialog();
  /** First load still in flight — "…" cards + Skeleton table, never fake zeros. */
  const booting = loading && !mall;
  const n = (value: string | number) => (booting ? "…" : value);

  const [orderFilter, setOrderFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [groupByStation, setGroupByStation] = useState(false);

  // One-shot preset: overview "高价值待审核" card → review-pending orders only.
  useEffect(() => {
    if (preset !== "review") return;
    setReviewOnly(true);
    setOrderFilter("");
    setOrderPage(1);
    clearPreset();
  }, [preset, clearPreset]);

  // ---- Status + keyword + date range filter + pagination ----
  const allOrders = useMemo(() => mall?.orders ?? [], [mall]);
  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return allOrders.filter((order) => {
      if (reviewOnly && order.reviewStatus !== "pending") return false;
      if (orderFilter && order.status !== orderFilter) return false;
      if (q && ![order.productName ?? "", order.riderName ?? "", order.station ?? "", order.id].some((text) => text.toLowerCase().includes(q))) return false;
      const day = (order.createdAt ?? "").slice(0, 10);
      if (orderDateFrom && day < orderDateFrom) return false;
      if (orderDateTo && day > orderDateTo) return false;
      return true;
    });
  }, [allOrders, orderFilter, orderSearch, orderDateFrom, orderDateTo, reviewOnly]);
  const orderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const safeOrderPage = Math.min(orderPage, orderPages);
  const pagedOrders = useMemo(() => filteredOrders.slice((safeOrderPage - 1) * ORDER_PAGE_SIZE, safeOrderPage * ORDER_PAGE_SIZE), [filteredOrders, safeOrderPage]);

  // ---- 待办计数（点击即预筛） ----
  const today = todayStr();
  const reviewPendingCount = useMemo(() => allOrders.filter((o) => o.reviewStatus === "pending").length, [allOrders]);
  const inTransitCount = useMemo(() => allOrders.filter((o) => o.status === "created").length, [allOrders]);
  const arrivedCount = useMemo(() => allOrders.filter((o) => o.status === "arrived").length, [allOrders]);
  const todayCount = useMemo(() => allOrders.filter((o) => (o.createdAt ?? "").slice(0, 10) === today).length, [allOrders, today]);

  function applyQuickFilter(next: { review?: boolean; status?: string; today?: boolean }) {
    setReviewOnly(next.review ?? false);
    setOrderFilter(next.status ?? "");
    if (next.today) { setOrderDateFrom(today); setOrderDateTo(today); }
    else { setOrderDateFrom(""); setOrderDateTo(""); }
    setOrderPage(1);
  }

  // ---- 操作（行内与抽屉共用；沿用既有 action + optimisticPost + 确认弹窗） ----
  function actApprove(order: MarketplaceOrder) {
    const prev = mall;
    void optimisticPost("/api/mall", { action: "reviewOrder", orderId: order.id, decision: "approve" }, "已批准，资格放行", () => patchOrder(order.id, { reviewStatus: "approved" }), () => setMall(prev));
  }
  async function actReject(order: MarketplaceOrder) {
    if (!(await dialog.confirm("拒绝高价值兑换", { message: `拒绝并退还 ${order.pointsSpent} 分给 ${order.riderName}？`, confirmText: "拒绝并退分", tone: "danger" }))) return;
    const prev = mall;
    void optimisticPost("/api/mall", { action: "reviewOrder", orderId: order.id, decision: "reject" }, "已拒绝并退分", () => patchOrder(order.id, { reviewStatus: "rejected", status: "cancelled" }), () => setMall(prev));
  }
  function actArrive(order: MarketplaceOrder) {
    const prev = mall;
    void optimisticPost("/api/mall", { action: "markArrived", orderId: order.id }, "已标记到站并推送骑手", () => patchOrder(order.id, { status: "arrived" }), () => setMall(prev));
  }
  function actDeliver(order: MarketplaceOrder) {
    const prev = mall;
    void optimisticPost("/api/mall", { action: "markPickedUp", orderId: order.id }, "已交付", () => patchOrder(order.id, { status: "fulfilled" }), () => setMall(prev));
  }

  // ---- 批量到站：勾选的 created 订单 → 现有 batchArrived action ----
  const selectedEligible = useMemo(() => allOrders.filter((o) => selectedIds.has(o.id) && canBatchArrive(o)), [allOrders, selectedIds]);
  async function runBatchArrived() {
    if (batchBusy || selectedEligible.length === 0) return;
    const ids = selectedEligible.map((o) => o.id);
    const prev = mall;
    setBatchBusy(true);
    await optimisticPost("/api/mall", { action: "batchArrived", orderIds: ids }, `已批量到站 ${ids.length} 单并推送骑手`, () => { for (const id of ids) patchOrder(id, { status: "arrived" }); }, () => setMall(prev));
    setBatchBusy(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageEligible = pagedOrders.filter(canBatchArrive);
  const allPageSelected = pageEligible.length > 0 && pageEligible.every((o) => selectedIds.has(o.id));

  // ---- 行内主操作：每行只留一个最主要按钮，其余进抽屉 ----
  function rowPrimaryAction(order: MarketplaceOrder): ReactNode {
    if (order.reviewStatus === "pending") return <button type="button" onClick={() => actApprove(order)} className={ROW_BTN}>批准</button>;
    if (order.accountType === "partner") return <span className="text-xs font-bold text-[var(--muted)]">{order.status === "fulfilled" ? "合作方已确认收货" : "直送门店·待合作方确认"}</span>;
    if (order.status === "created" && !order.voucherCode) return <button type="button" onClick={() => actArrive(order)} className={ROW_BTN}>到站</button>;
    if (order.status === "arrived") return <button type="button" onClick={() => actDeliver(order)} className={ROW_BTN}>交付</button>;
    return <span className="text-xs font-bold text-[var(--muted)]">—</span>;
  }

  const columns: Array<DataColumn<MarketplaceOrder>> = [
    {
      key: "select",
      className: "w-10",
      label: (
        <input
          type="checkbox"
          aria-label="全选本页在途订单"
          checked={allPageSelected}
          disabled={pageEligible.length === 0}
          onChange={() => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const o of pageEligible) { if (allPageSelected) next.delete(o.id); else next.add(o.id); }
              return next;
            });
          }}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      ),
      render: (order) => canBatchArrive(order) ? (
        <span onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" aria-label={`选择订单 ${order.id}`} checked={selectedIds.has(order.id)} onChange={() => toggleSelect(order.id)} className="h-4 w-4 accent-[var(--accent)]" />
        </span>
      ) : null,
    },
    {
      key: "product",
      label: "商品",
      render: (order) => (
        <div className="min-w-0">
          <div className="max-w-[220px] truncate font-black">{order.productName ?? "—"}</div>
          <div className="max-w-[220px] truncate font-mono text-[10px] font-bold text-[var(--muted)]">{order.id}</div>
        </div>
      ),
    },
    { key: "rider", label: "骑手", render: (order) => order.riderName ?? "—" },
    { key: "station", label: "站点", render: (order) => order.pickupStoreName ?? order.station ?? "—" },
    {
      key: "amount",
      label: "金额",
      render: (order) => (
        <span>{order.pointsSpent.toLocaleString()} 分{order.cashDue ? <span className="text-[11px] text-[var(--muted)]"> + R${order.cashDue.toFixed(2)}</span> : null}</span>
      ),
    },
    { key: "payment", label: "支付", render: (order) => order.paymentStatus ? statusBadge(order.paymentStatus, paymentStatusChip[order.paymentStatus] ?? order.paymentStatus) : <span className="text-xs text-[var(--muted)]">—</span> },
    { key: "status", label: "状态", render: (order) => order.reviewStatus === "pending" ? statusBadge("pending", "待审核·高价值") : statusBadge(order.status, orderStatusLabel[order.status] ?? order.status) },
    { key: "time", label: "时间", render: (order) => <span className="text-xs font-bold text-[var(--muted)]">{order.createdAt}</span> },
    { key: "action", label: "操作", align: "right", render: (order) => <span onClick={(e) => e.stopPropagation()}>{rowPrimaryAction(order)}</span> },
  ];

  const drawerOrder = drawerId ? allOrders.find((o) => o.id === drawerId) : undefined;

  // ---- 按站点分组（原站点工作台「今日待取」并入总部视角）：已到站待取订单逐站点列出 ----
  const stationGroups = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const groups = new Map<string, MarketplaceOrder[]>();
    for (const order of allOrders) {
      if (order.status !== "arrived") continue;
      if (q && ![order.productName ?? "", order.riderName ?? "", order.station ?? "", order.pickupStoreName ?? "", order.id].some((text) => text.toLowerCase().includes(q))) continue;
      const station = order.pickupStoreName ?? order.station ?? "未指定站点";
      const list = groups.get(station) ?? [];
      list.push(order);
      groups.set(station, list);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [allOrders, orderSearch]);

  return (
    <div className="space-y-3">
      {/* ---- 待办卡：点击即预筛 ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TodoCard label="高价值待审" value={n(reviewPendingCount)} tone={reviewPendingCount > 0 ? "warn" : "neutral"} hint="人工放行后才继续履约" active={reviewOnly} onClick={() => applyQuickFilter({ review: true })} />
        <TodoCard label="在途" value={n(inTransitCount)} tone={inTransitCount > 0 ? "info" : "neutral"} hint="等待供货到站，可批量到站" active={orderFilter === "created" && !reviewOnly && !orderDateFrom} onClick={() => applyQuickFilter({ status: "created" })} />
        <TodoCard label="已到站待取" value={n(arrivedCount)} tone={arrivedCount > 0 ? "warn" : "neutral"} hint="已推送骑手，等待到店取货" active={orderFilter === "arrived" && !reviewOnly && !orderDateFrom} onClick={() => applyQuickFilter({ status: "arrived" })} />
        <TodoCard label="今日兑换" value={n(todayCount)} tone={todayCount > 0 ? "success" : "neutral"} hint="今天新创建的兑换订单" active={orderDateFrom === today && orderDateTo === today && !orderFilter && !reviewOnly} onClick={() => applyQuickFilter({ today: true })} />
      </div>

      {/* ---- 搜索 + 状态 + 日期范围 + 导出 + 分页 ---- */}
      <Toolbar right={<Pager page={safeOrderPage} pages={orderPages} total={filteredOrders.length} onPage={setOrderPage} />}>
        <SearchInput value={orderSearch} onChange={(value) => { setOrderSearch(value); setOrderPage(1); }} placeholder="搜索商品 / 骑手 / 站点 / 订单号…" />
        {["", "created", "arrived", "fulfilled", "cancelled"].map((status) => (
          <Chip key={status || "all"} active={orderFilter === status && !reviewOnly && !groupByStation} onClick={() => { setOrderFilter(status); setGroupByStation(false); setOrderPage(1); }}>
            {status === "" ? "全部" : orderStatusLabel[status]}
          </Chip>
        ))}
        <Chip active={groupByStation} onClick={() => setGroupByStation((prev) => !prev)}>按站点分组</Chip>
        {reviewOnly && (
          <button type="button" onClick={() => { setReviewOnly(false); setOrderPage(1); }} className="rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--accent)]">
            仅看高价值待审 ✕
          </button>
        )}
        <label className="text-[11px] font-bold text-[var(--muted)]">从
          <input type="date" value={orderDateFrom} onChange={(e) => { setOrderDateFrom(e.target.value); setOrderPage(1); }} className="ml-1.5 h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="text-[11px] font-bold text-[var(--muted)]">至
          <input type="date" value={orderDateTo} onChange={(e) => { setOrderDateTo(e.target.value); setOrderPage(1); }} className="ml-1.5 h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </label>
        <button type="button" onClick={() => downloadCsv("pontomall-orders.csv", ["订单", "商品", "骑手", "站点", "积分", "现金", "支付", "状态", "创建时间"], filteredOrders.map((order) => [order.id, order.productName ?? "", order.riderName ?? "", order.station ?? "", String(order.pointsSpent), order.cashDue ? order.cashDue.toFixed(2) : "", order.paymentStatus ?? "", orderStatusLabel[order.status] ?? order.status, order.createdAt]))} className="h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV（当前筛选）</button>
      </Toolbar>

      {/* ---- 批量操作条：唯一的黄色主按钮 ---- */}
      {selectedEligible.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-2 border-[var(--accent)] p-3">
          <span className="text-sm font-bold">已选 <b className="font-black">{selectedEligible.length}</b> 个在途订单</span>
          <button type="button" disabled={batchBusy} onClick={() => void runBatchArrived()} className="h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">
            {batchBusy ? "处理中…" : `批量到站（${selectedEligible.length}）`}
          </button>
          <span className="text-[11px] font-bold text-[var(--muted)]">逐单审计留痕 · 推送骑手取货通知</span>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto h-9 px-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]">取消选择</button>
        </div>
      )}

      {/* ---- 订单表格 / 按站点分组待取视图：点行（卡）开抽屉；首载显示骨架条 ---- */}
      {booting ? (
        <Skeleton rows={8} />
      ) : groupByStation ? (
        <div className="space-y-3">
          {stationGroups.map(([station, orders]) => (
            <div key={station} className="panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-black">{station}</span>
                <span className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11px] font-black text-[var(--warn)]">待取 {orders.length}</span>
              </div>
              <div className="space-y-1.5">
                {orders.map((order) => (
                  <div key={order.id} onClick={() => setDrawerId(order.id)} className="flex cursor-pointer flex-wrap items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-bold transition-colors hover:border-[var(--accent)]">
                    <span className="min-w-0 max-w-[220px] truncate font-black">{order.productName ?? "—"}</span>
                    <span className="text-[var(--muted)]">{order.riderName ?? "—"}</span>
                    <span>{order.pointsSpent.toLocaleString()} 分{order.cashDue ? ` + R$${order.cashDue.toFixed(2)}` : ""}</span>
                    <span className="text-[var(--muted)]">{order.arrivedAt ?? order.createdAt}</span>
                    <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => actDeliver(order)} className={ROW_BTN}>交付</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {stationGroups.length === 0 && <div className="panel py-8 text-center text-sm font-bold text-[var(--muted)]">当前没有已到站待取的订单。</div>}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={pagedOrders}
          rowKey={(order) => order.id}
          onRowClick={(order) => setDrawerId(order.id)}
          minWidth={920}
          empty={allOrders.length === 0 ? "暂无订单。" : "没有匹配的订单——调整关键字、状态或日期范围。"}
        />
      )}

      {/* ---- 订单详情抽屉：时间线 + 支付 + 取货门店 + 全部操作 ---- */}
      {drawerOrder && (
        <OrderDrawer
          order={drawerOrder}
          onClose={() => setDrawerId("")}
          onApprove={actApprove}
          onReject={(order) => void actReject(order)}
          onArrive={actArrive}
          onDeliver={actDeliver}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer internals
// ---------------------------------------------------------------------------

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right font-bold">{children}</span>
    </div>
  );
}

type TimelineState = "done" | "todo" | "danger";

function TimelineStep({ label, time, note, state, last }: { label: string; time?: string; note?: string; state: TimelineState; last?: boolean }) {
  const color = state === "done" ? "var(--success)" : state === "danger" ? "var(--danger)" : "var(--line-strong)";
  return (
    <li className="relative pb-4 pl-5 last:pb-0">
      {!last && <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-12px)] w-px bg-[var(--line)]" />}
      <span aria-hidden className="absolute left-0 top-1 h-[11px] w-[11px] rounded-full border-2" style={{ borderColor: color, background: state === "todo" ? "transparent" : color }} />
      <div className="text-sm font-black" style={{ color: state === "todo" ? "var(--muted)" : state === "danger" ? "var(--danger)" : "var(--text)" }}>{label}</div>
      {time && <div className="text-[11px] font-bold text-[var(--muted)]">{time}</div>}
      {note && <div className="text-[11px] font-bold text-[var(--warn)]">{note}</div>}
    </li>
  );
}

function OrderDrawer({ order, onClose, onApprove, onReject, onArrive, onDeliver }: {
  order: MarketplaceOrder;
  onClose: () => void;
  onApprove: (order: MarketplaceOrder) => void;
  onReject: (order: MarketplaceOrder) => void;
  onArrive: (order: MarketplaceOrder) => void;
  onDeliver: (order: MarketplaceOrder) => void;
}) {
  const cancelled = order.status === "cancelled";
  const arrivedDone = Boolean(order.arrivedAt) || order.status === "arrived" || order.status === "fulfilled";
  const pickedDone = Boolean(order.pickedUpAt) || order.status === "fulfilled";

  // 状态时间线：创建 → 到站(arrivedAt) → 取货(pickedUpAt)；取消/审核态标注。
  const steps: Array<{ label: string; time?: string; note?: string; state: TimelineState }> = [
    {
      label: "创建",
      time: order.createdAt,
      state: "done",
      note: order.reviewStatus === "pending" ? "高价值订单 · 等待人工审核放行" : order.reviewStatus === "rejected" ? "高价值审核已拒绝" : undefined,
    },
  ];
  if (cancelled) {
    steps.push({ label: "已取消", time: order.reviewStatus === "rejected" ? "审核拒绝 · 积分已退还" : undefined, state: "danger" });
  } else if (order.voucherCode) {
    steps.push({ label: "发放兑换码", time: pickedDone ? order.pickedUpAt ?? "即时发放" : "即时发放", state: "done" });
  } else {
    steps.push({ label: "到站", time: order.arrivedAt ?? (order.etaDate ? `预计 ${order.etaDate}` : undefined), state: arrivedDone ? "done" : "todo" });
    steps.push({ label: "取货", time: order.pickedUpAt, state: pickedDone ? "done" : "todo" });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="订单详情"
      title={
        <div className="min-w-0">
          <div className="truncate text-sm font-black">{order.productName ?? "订单详情"}</div>
          <div className="truncate font-mono text-[11px] font-bold text-[var(--muted)]">{order.id}</div>
        </div>
      }
    >
      {/* 当前状态徽章 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {statusBadge(order.status, orderStatusLabel[order.status] ?? order.status)}
        {order.reviewStatus === "pending" && statusBadge("pending", "待审核·高价值")}
        {order.reviewStatus === "rejected" && statusBadge("rejected", "审核拒绝")}
        {order.accountType === "partner" && statusBadge("partner", "合作方直送")}
      </div>

      {/* 状态时间线 */}
      <div className="mb-4">
        <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">状态时间线</div>
        <ol>
          {steps.map((step, i) => (
            <TimelineStep key={step.label} label={step.label} time={step.time} note={step.note} state={step.state} last={i === steps.length - 1} />
          ))}
        </ol>
      </div>

      {/* 支付信息 */}
      <div className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 text-[11px] font-black uppercase text-[var(--muted)]">支付信息</div>
        <InfoRow label="积分">{order.pointsSpent.toLocaleString()} 分</InfoRow>
        {order.couponDiscount ? <InfoRow label="优惠券抵扣">-{order.couponDiscount.toLocaleString()} 分</InfoRow> : null}
        <InfoRow label="现金差价">{order.cashDue ? `R$ ${order.cashDue.toFixed(2)}` : "无（纯积分）"}</InfoRow>
        <InfoRow label="支付状态">{order.paymentStatus ? statusBadge(order.paymentStatus, paymentStatusChip[order.paymentStatus] ?? order.paymentStatus) : <span className="text-xs text-[var(--muted)]">—</span>}</InfoRow>
        {order.voucherCode && <InfoRow label="兑换码"><span className="font-mono text-xs">{order.voucherCode}</span></InfoRow>}
      </div>

      {/* 取货门店 */}
      <div className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 text-[11px] font-black uppercase text-[var(--muted)]">取货门店</div>
        <InfoRow label="门店">{order.pickupStoreName ?? order.station ?? "—"}</InfoRow>
        <InfoRow label="骑手">{order.riderName ?? "—"}</InfoRow>
        {order.franchise && <InfoRow label="加盟商">{order.franchise}</InfoRow>}
      </div>

      {/* 操作区：抽屉内集中全部操作 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
        {order.reviewStatus === "pending" ? (
          <>
            <button type="button" onClick={() => onApprove(order)} className={PRIMARY_BTN}>批准放行</button>
            <button type="button" onClick={() => onReject(order)} className={DANGER_BTN}>拒绝并退分</button>
          </>
        ) : order.accountType === "partner" ? (
          <span className="text-xs font-bold text-[var(--muted)]">{order.status === "fulfilled" ? "合作方已确认收货，无需操作。" : "直送门店 · 等待合作方扫码确认，无需总部操作。"}</span>
        ) : order.status === "created" && !order.voucherCode ? (
          <button type="button" onClick={() => onArrive(order)} className={PRIMARY_BTN}>标记到站并推送骑手</button>
        ) : order.status === "arrived" ? (
          <button type="button" onClick={() => onDeliver(order)} className={PRIMARY_BTN}>确认交付</button>
        ) : (
          <span className="text-xs font-bold text-[var(--muted)]">{cancelled ? "订单已取消，无需操作。" : "订单已完成，无需操作。"}</span>
        )}
      </div>
    </Drawer>
  );
}
