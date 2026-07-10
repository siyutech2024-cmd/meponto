"use client";

import { useState } from "react";
import { Boxes, CircleDollarSign } from "lucide-react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import { poStatusLabel, statementStatusLabel, type SupplierStatement } from "../../lib/mall-ops";
import { extraPoLabel, extraStatementLabel, statusBadge, useMallAdmin, type OpsPayload } from "./context";

/** 补货与对账（供应链）— mechanical move from app/mall/page.tsx (wave 1). */

export default function SupplyTab() {
  const { ops, products, suppliers, post, setMessage, t } = useMallAdmin();
  const dialog = useDialog();

  const [poSupplier, setPoSupplier] = useState("");
  const [poItems, setPoItems] = useState<Record<string, string>>({});
  const [statementMonth, setStatementMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });

  return (
    <div className="space-y-5">
      <div className="panel p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">供货价调整审批</div>
        <div className="space-y-2">
          {(ops?.priceChanges ?? []).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black">{row.productName} <span className="text-[var(--muted)]">· {row.supplierName}</span></div>
                <div className="text-xs font-bold text-[var(--muted)]">R$ {row.oldPrice.toFixed(2)} → <b style={{ color: row.newPrice > row.oldPrice ? "var(--danger)" : "var(--success)" }}>R$ {row.newPrice.toFixed(2)}</b>{row.note ? ` · ${row.note}` : ""} · {row.createdAt}</div>
              </div>
              {row.status === "pending" ? (
                <span className="flex gap-1.5">
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: true }, "已批准，供货价已更新")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">批准</button>
                  <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: false }, "已拒绝")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)]">拒绝</button>
                </span>
              ) : (
                statusBadge(row.status, row.status === "approved" ? "已批准" : "已拒绝")
              )}
            </div>
          ))}
          {(ops?.priceChanges ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无调价申请。</div>}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-1 text-xs font-black uppercase text-[var(--muted)]">补货单（PO）· 代销备货流转</div>
        <p className="mb-3 text-[11px] font-bold text-[var(--muted)]">代销模式:补货单仅用于备货/调拨与入库流转,<b>不产生应付账款</b>。供应商货款一律以月度对账(履约订单 × 供货价)结算,补货金额仅为备货参考成本。</p>
        <div className="mb-4 rounded-[10px] border border-dashed border-[var(--line)] p-3.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <select value={poSupplier} onChange={(e) => { setPoSupplier(e.target.value); setPoItems({}); }} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none">
              <option value="">选择供应商下补货单…</option>
              {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
            </select>
            {poSupplier && (
              <button
                type="button"
                onClick={() => {
                  const items = Object.entries(poItems).filter(([, qty]) => Number(qty) > 0).map(([productId, qty]) => ({ productId, qty: Number(qty) }));
                  if (items.length === 0) { setMessage({ tone: "err", text: "请填写至少一个商品数量" }); return; }
                  void post("/api/mall/ops", { action: "createPO", supplierName: poSupplier, items }, "补货单已下达，等待供应商确认").then(() => { setPoSupplier(""); setPoItems({}); });
                }}
                className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)]"
              >下达补货单</button>
            )}
          </div>
          {poSupplier && (
            <div className="grid gap-1.5 md:grid-cols-2">
              {products.filter((product) => product.supplierName === poSupplier).map((product) => (
                <label key={product.id} className="flex items-center gap-2 text-sm font-bold">
                  <input value={poItems[product.id] ?? ""} onChange={(e) => setPoItems((prev) => ({ ...prev, [product.id]: e.target.value }))} placeholder="0" className="h-9 w-16 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-center text-sm font-bold outline-none focus:border-[var(--accent)]" />
                  <span className="truncate">{product.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">R$ {(product.supplyPrice ?? 0).toFixed(2)} · 现库存 {product.stock}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {(ops?.purchaseOrders ?? []).map((po) => (
            <div key={po.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Boxes size={15} className="text-[var(--muted)]" />
                <span className="text-sm font-black">{po.supplierName}</span>
                {statusBadge(po.status, (poStatusLabel as Record<string, string>)[po.status] ?? extraPoLabel[po.status] ?? po.status)}
                <span className="text-xs font-bold text-[var(--muted)]">{po.items.reduce((sum, item) => sum + item.qty, 0)} 件 · 备货参考成本 R$ {po.totalCost.toFixed(2)} · {po.createdAt}</span>
                <span className="ml-auto flex gap-1.5">
                  {(po.status as string) === "draft" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "confirmDraftPO", poId: po.id }, "补货单已下达，等待供应商确认")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">确认下达</button>}
                  {po.status === "shipped" && <button type="button" onClick={() => void post("/api/mall/ops", { action: "receivePO", poId: po.id }, "已入库，库存已增加")} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">确认入库</button>}
                  {((po.status as string) === "draft" || po.status === "ordered" || po.status === "confirmed") && <button type="button" onClick={() => void post("/api/mall/ops", { action: "cancelPO", poId: po.id }, "已取消")} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)]">取消</button>}
                </span>
              </div>
              <div className="mt-1 text-xs font-bold text-[var(--muted)]">{po.items.map((item) => `${item.name}×${item.qty}`).join("、")}{po.shipNote ? t("dynLogistics", { x: po.shipNote }) : ""}</div>
            </div>
          ))}
          {(ops?.purchaseOrders ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无补货单。</div>}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase text-[var(--muted)]">月度对账单</span>
          <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
          <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateStatement", month: statementMonth }, t("dynStatementGen", { m: statementMonth }))} className="h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]">生成对账单</button>
        </div>
        <div className="space-y-2">
          {(ops?.statements ?? []).map((statement) => (
            <div key={statement.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <CircleDollarSign size={15} className="text-[var(--muted)]" />
                <span className="text-sm font-black">{statement.supplierName} · {statement.month}</span>
                {statusBadge(statement.status, (statementStatusLabel as Record<string, string>)[statement.status] ?? extraStatementLabel[statement.status] ?? statement.status)}
                <span className="text-xs font-bold text-[var(--muted)]">{statement.lines.length} 笔 · <b>R$ {statement.total.toFixed(2)}</b>{statement.pixKey ? ` · PIX ${statement.pixKey}` : ""}</span>
                <span className="ml-auto flex gap-1.5">
                  {statement.status === "confirmed" && (
                    <button type="button" onClick={async () => { if (!(await dialog.confirm("标记付款", { message: `确认向供应商「${statement.supplierName}」标记已付款 R$ ${statement.total.toFixed(2)}（${statement.month} 月对账单，${statement.lines.length} 笔）？` }))) return; const note = await dialog.prompt("付款凭证备注", { message: "转账ID等，可空。", placeholder: "如 PIX E2E ID" }); if (note === null) return; void post("/api/mall/ops", { action: "payStatement", statementId: statement.id, receiptNote: note }, "已标记付款"); }} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">标记已付款</button>
                  )}
                  {(statement.status as string) === "disputed" && (
                    <button type="button" onClick={async () => { if (!(await dialog.confirm("重新打开对账单", { message: `将「${statement.supplierName} · ${statement.month}」重置为待确认，供应商可重新核对。` }))) return; void post("/api/mall/ops", { action: "reopenStatement", statementId: statement.id }, "已重新打开，等待供应商确认"); }} className="h-8 rounded-[8px] border border-[var(--warn)]/50 px-3 text-xs font-bold text-[var(--warn)]">重新打开</button>
                  )}
                  <button type="button" onClick={() => downloadCsv(`statement-${statement.supplierName}-${statement.month}.csv`, ["日期", "订单", "商品", "供货价"], statement.lines.map((line) => [line.date, line.orderId, line.productName, line.supplyPrice.toFixed(2)]))} className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)]">明细 CSV</button>
                </span>
              </div>
              {(statement.status as string) === "disputed" && (statement as SupplierStatement & { disputeNote?: string }).disputeNote && (
                <div className="mt-1 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{(statement as SupplierStatement & { disputeNote?: string }).disputeNote}</div>
              )}
              {statement.paidAt && <div className="mt-1 text-xs font-bold text-[var(--muted)]">{t("dynPaidOn", { d: statement.paidAt })}{statement.receiptNote ? ` · ${statement.receiptNote}` : ""}</div>}
            </div>
          ))}
          {(ops?.statements ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">选择月份生成对账单：按「履约订单 × 供货价」自动汇总每个供应商。</div>}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase text-[var(--muted)]">销售分成 · 月度对账（加盟商）</span>
          <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
          <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateRevShareStatement", month: statementMonth }, t("dynShareStatementGen", { m: statementMonth }))} className="h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]">生成分成对账单</button>
        </div>
        <div className="space-y-2">
          {(((ops as (OpsPayload & { revShareStatements?: Array<{ id: string; franchise: string; month: string; status: "draft" | "confirmed" | "paid" | "disputed"; total: number; orders: number; stationShareTotal: number; franchiseNetTotal: number; paidAt?: string; disputeNote?: string }> }) | null)?.revShareStatements) ?? []).map((s) => (
            <div key={s.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <CircleDollarSign size={15} className="text-[var(--muted)]" />
                <span className="text-sm font-black">{s.franchise} · {s.month}</span>
                {statusBadge(s.status, ({ draft: "待加盟商确认", confirmed: "待付款", paid: "已付款", disputed: "有异议" } as Record<string, string>)[s.status] ?? s.status)}
                <span className="text-xs font-bold text-[var(--muted)]">{s.orders} 单 · 加盟商净 R$ {s.franchiseNetTotal.toFixed(2)} · 站点 R$ {s.stationShareTotal.toFixed(2)} · 合计 <b>R$ {s.total.toFixed(2)}</b></span>
                {s.status === "confirmed" && (
                  <button type="button" onClick={async () => { if (!(await dialog.confirm("标记付款", { message: `确认向加盟商「${s.franchise}」标记已付款 R$ ${s.total.toFixed(2)}（${s.month} 月分成对账单，${s.orders} 单）？` }))) return; const note = await dialog.prompt("付款凭证备注", { message: "转账ID等，可空。", placeholder: "如 PIX E2E ID" }); if (note === null) return; void post("/api/mall/ops", { action: "payRevShareStatement", statementId: s.id, note }, "已标记付款"); }} className="ml-auto h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]">标记已付款</button>
                )}
                {s.status === "disputed" && (
                  <button type="button" onClick={async () => { if (!(await dialog.confirm("重新打开分成对账单", { message: `将「${s.franchise} · ${s.month}」重置为待确认，加盟商可重新核对。` }))) return; void post("/api/mall/ops", { action: "reopenRevShareStatement", statementId: s.id }, "已重新打开，等待加盟商确认"); }} className="ml-auto h-8 rounded-[8px] border border-[var(--warn)]/50 px-3 text-xs font-bold text-[var(--warn)]">重新打开</button>
                )}
              </div>
              {s.status === "disputed" && s.disputeNote && <div className="mt-1 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{s.disputeNote}</div>}
              {s.paidAt && <div className="mt-1 text-xs font-bold text-[var(--muted)]">{t("dynPaidOn", { d: s.paidAt })}</div>}
            </div>
          ))}
          {(((ops as (OpsPayload & { revShareStatements?: unknown[] }) | null)?.revShareStatements) ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">按「已取货订单 × 产品加盟商分成」自动汇总。加盟商在自己后台确认后，这里可标记付款。</div>}
        </div>
      </div>
    </div>
  );
}
