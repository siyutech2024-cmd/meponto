"use client";

import { useEffect, useMemo, useState } from "react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import { Chip, Pager, SearchInput } from "../kit";
import { orderStatusLabel, paymentStatusChip, statusBadge, useMallAdmin } from "./context";

/** 订单履约 — mechanical move from app/mall/page.tsx (wave 1). Only addition:
 *  the overview "高价值待审" card lands here with a review-only quick filter. */

const ORDER_PAGE_SIZE = 50;

export default function OrdersTab() {
  const { mall, setMall, optimisticPost, patchOrder, preset, clearPreset } = useMallAdmin();
  const dialog = useDialog();

  const [orderFilter, setOrderFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [reviewOnly, setReviewOnly] = useState(false);

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

  return (
    <div className="panel p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {["", "created", "arrived", "fulfilled", "cancelled"].map((status) => (
          <Chip key={status || "all"} active={orderFilter === status && !reviewOnly} onClick={() => { setOrderFilter(status); setOrderPage(1); }}>
            {status === "" ? "全部" : orderStatusLabel[status]}
          </Chip>
        ))}
        {reviewOnly && (
          <button type="button" onClick={() => { setReviewOnly(false); setOrderPage(1); }} className="rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--accent)]">
            仅看高价值待审 ✕
          </button>
        )}
        <button type="button" onClick={() => downloadCsv("pontomall-orders.csv", ["订单", "商品", "骑手", "站点", "积分", "现金", "支付", "状态", "创建时间"], filteredOrders.map((order) => [order.id, order.productName ?? "", order.riderName ?? "", order.station ?? "", String(order.pointsSpent), order.cashDue ? order.cashDue.toFixed(2) : "", order.paymentStatus ?? "", orderStatusLabel[order.status] ?? order.status, order.createdAt]))} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV（当前筛选）</button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={orderSearch} onChange={(value) => { setOrderSearch(value); setOrderPage(1); }} placeholder="搜索商品 / 骑手 / 站点 / 订单号…" />
        <label className="text-[11px] font-bold text-[var(--muted)]">从
          <input type="date" value={orderDateFrom} onChange={(e) => { setOrderDateFrom(e.target.value); setOrderPage(1); }} className="ml-1.5 h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="text-[11px] font-bold text-[var(--muted)]">至
          <input type="date" value={orderDateTo} onChange={(e) => { setOrderDateTo(e.target.value); setOrderPage(1); }} className="ml-1.5 h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </label>
        <div className="ml-auto">
          <Pager page={safeOrderPage} pages={orderPages} total={filteredOrders.length} onPage={setOrderPage} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">商品</th><th>骑手</th><th>站点</th><th>金额</th><th>支付</th><th>状态</th><th>时间</th><th className="text-right">操作</th></tr></thead>
          <tbody>
            {pagedOrders.map((order) => (
              <tr key={order.id} className="border-t border-[var(--line)] font-bold">
                <td className="py-2.5">{order.productName}</td>
                <td>{order.riderName}</td>
                <td>{order.station}</td>
                <td>{order.pointsSpent} 分{order.cashDue ? ` + R$${order.cashDue.toFixed(2)}` : ""}</td>
                <td>{order.paymentStatus ? statusBadge(order.paymentStatus, paymentStatusChip[order.paymentStatus] ?? order.paymentStatus) : "—"}</td>
                <td>{order.reviewStatus === "pending" ? statusBadge("pending", "待审核·高价值") : statusBadge(order.status, orderStatusLabel[order.status] ?? order.status)}</td>
                <td className="text-xs text-[var(--muted)]">{order.createdAt}</td>
                <td className="text-right">
                  {order.reviewStatus === "pending" ? (
                    <>
                      <button type="button" onClick={() => { const prev = mall; void optimisticPost("/api/mall", { action: "reviewOrder", orderId: order.id, decision: "approve" }, "已批准，资格放行", () => patchOrder(order.id, { reviewStatus: "approved" }), () => setMall(prev)); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-bold text-[var(--accent-ink)]">批准</button>
                      <button type="button" onClick={async () => { if (!(await dialog.confirm("拒绝高价值兑换", { message: `拒绝并退还 ${order.pointsSpent} 分给 ${order.riderName}？`, confirmText: "拒绝并退分", tone: "danger" }))) return; const prev = mall; void optimisticPost("/api/mall", { action: "reviewOrder", orderId: order.id, decision: "reject" }, "已拒绝并退分", () => patchOrder(order.id, { reviewStatus: "rejected", status: "cancelled" }), () => setMall(prev)); }} className="ml-1.5 h-8 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-xs font-bold text-[var(--danger)]">拒绝</button>
                    </>
                  ) : order.accountType === "partner" ? (
                    <span className="text-xs text-[var(--muted)]">{order.status === "fulfilled" ? "合作方已确认收货" : "直送门店·待合作方确认"}</span>
                  ) : (
                    <>
                      {order.status === "created" && !order.voucherCode && <button type="button" onClick={() => { const prev = mall; void optimisticPost("/api/mall", { action: "markArrived", orderId: order.id }, "已标记到站并推送骑手", () => patchOrder(order.id, { status: "arrived" }), () => setMall(prev)); }} className="h-8 rounded-[8px] border border-[var(--line)] px-2.5 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">到站</button>}
                      {order.status === "arrived" && <button type="button" onClick={() => { const prev = mall; void optimisticPost("/api/mall", { action: "markPickedUp", orderId: order.id }, "已交付", () => patchOrder(order.id, { status: "fulfilled" }), () => setMall(prev)); }} className="ml-1.5 h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-bold text-[var(--accent-ink)]">交付</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filteredOrders.length === 0 && <tr><td colSpan={8} className="py-8 text-center font-bold text-[var(--muted)]">{allOrders.length === 0 ? "暂无订单。" : "没有匹配的订单——调整关键字、状态或日期范围。"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
