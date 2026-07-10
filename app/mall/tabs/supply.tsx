"use client";

import { useState, type ReactNode } from "react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import { poStatusLabel, statementStatusLabel, type PriceChangeRequest, type PurchaseOrder, type SupplierStatement } from "../../lib/mall-ops";
import { DataTable, Drawer, SectionCard, type DataColumn } from "../kit";
import { extraPoLabel, extraStatementLabel, statusBadge, useMallAdmin, type OpsPayload } from "./context";

/** 供应链 — 调价审批 / 补货单 / 供应商对账 / 分成对账,四段纵排工作台。 */

type RevShareStatement = {
  id: string;
  franchise: string;
  month: string;
  status: "draft" | "confirmed" | "paid" | "disputed";
  total: number;
  orders: number;
  stationShareTotal: number;
  franchiseNetTotal: number;
  paidAt?: string;
  disputeNote?: string;
};

const REV_SHARE_STATUS_LABEL: Record<string, string> = { draft: "待加盟商确认", confirmed: "待付款", paid: "已付款", disputed: "有异议" };

const btnPrimary = "h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]";
const btnOutline = "h-7 rounded-[8px] border border-[var(--accent)]/60 px-2.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10";
const btnGhost = "h-7 rounded-[8px] border border-[var(--line)] px-2.5 text-[11px] font-bold text-[var(--muted)] hover:border-[var(--accent)]";
const btnWarn = "h-7 rounded-[8px] border border-[var(--warn)]/50 px-2.5 text-[11px] font-bold text-[var(--warn)]";
const btnDanger = "h-7 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-[11px] font-bold text-[var(--danger)]";

function Timeline({ steps }: { steps: Array<{ label: string; at?: string; note?: string }> }) {
  const visible = steps.filter((step) => step.at);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {visible.map((step) => (
        <div key={`${step.label}-${step.at}`} className="flex items-baseline gap-2 text-xs font-bold">
          <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-[var(--accent)]" />
          <span>{step.label}</span>
          <span className="ml-auto text-[11px] text-[var(--muted)]">{step.at}</span>
          {step.note && <span className="text-[11px] text-[var(--muted)]">{step.note}</span>}
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-sm font-bold last:border-b-0">
      <span className="text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default function SupplyTab() {
  const { ops, products, suppliers, post, setMessage, t } = useMallAdmin();
  const dialog = useDialog();

  const [poFormOpen, setPoFormOpen] = useState(false);
  const [poSupplier, setPoSupplier] = useState("");
  const [poItems, setPoItems] = useState<Record<string, string>>({});
  const [statementMonth, setStatementMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [poDrawerId, setPoDrawerId] = useState("");
  const [stDrawerId, setStDrawerId] = useState("");
  const [rsDrawerId, setRsDrawerId] = useState("");

  const priceChanges = ops?.priceChanges ?? [];
  const purchaseOrders = ops?.purchaseOrders ?? [];
  const statements = ops?.statements ?? [];
  const revShares = ((ops as (OpsPayload & { revShareStatements?: RevShareStatement[] }) | null)?.revShareStatements) ?? [];

  const drawerPo = poDrawerId ? purchaseOrders.find((po) => po.id === poDrawerId) : undefined;
  const drawerSt = stDrawerId ? statements.find((s) => s.id === stDrawerId) : undefined;
  const drawerRs = rsDrawerId ? revShares.find((s) => s.id === rsDrawerId) : undefined;

  // ---- 补货单动作(行内与抽屉共用) ----
  function poActions(po: PurchaseOrder) {
    const actions: Array<{ label: string; cls: string; run: () => void }> = [];
    if (po.status === "draft") actions.push({ label: "确认下达", cls: btnOutline, run: () => void post("/api/mall/ops", { action: "confirmDraftPO", poId: po.id }, "补货单已下达，等待供应商确认") });
    if (po.status === "shipped") actions.push({ label: "确认入库", cls: btnOutline, run: () => void post("/api/mall/ops", { action: "receivePO", poId: po.id }, "已入库，库存已增加") });
    if (po.status === "draft" || po.status === "ordered" || po.status === "confirmed") actions.push({ label: "取消", cls: btnGhost, run: () => void post("/api/mall/ops", { action: "cancelPO", poId: po.id }, "已取消") });
    return actions;
  }

  async function payStatement(statement: SupplierStatement) {
    if (!(await dialog.confirm("标记付款", { message: `确认向供应商「${statement.supplierName}」标记已付款 R$ ${statement.total.toFixed(2)}（${statement.month} 月对账单，${statement.lines.length} 笔）？` }))) return;
    const note = await dialog.prompt("付款凭证备注", { message: "转账ID等，可空。", placeholder: "如 PIX E2E ID" });
    if (note === null) return;
    void post("/api/mall/ops", { action: "payStatement", statementId: statement.id, receiptNote: note }, "已标记付款");
  }

  async function reopenStatement(statement: SupplierStatement) {
    if (!(await dialog.confirm("重新打开对账单", { message: `将「${statement.supplierName} · ${statement.month}」重置为待确认，供应商可重新核对。` }))) return;
    void post("/api/mall/ops", { action: "reopenStatement", statementId: statement.id }, "已重新打开，等待供应商确认");
  }

  function exportStatementCsv(statement: SupplierStatement) {
    downloadCsv(`statement-${statement.supplierName}-${statement.month}.csv`, ["日期", "订单", "商品", "供货价"], statement.lines.map((line) => [line.date, line.orderId, line.productName, line.supplyPrice.toFixed(2)]));
  }

  async function payRevShare(s: RevShareStatement) {
    if (!(await dialog.confirm("标记付款", { message: `确认向加盟商「${s.franchise}」标记已付款 R$ ${s.total.toFixed(2)}（${s.month} 月分成对账单，${s.orders} 单）？` }))) return;
    const note = await dialog.prompt("付款凭证备注", { message: "转账ID等，可空。", placeholder: "如 PIX E2E ID" });
    if (note === null) return;
    void post("/api/mall/ops", { action: "payRevShareStatement", statementId: s.id, note }, "已标记付款");
  }

  async function reopenRevShare(s: RevShareStatement) {
    if (!(await dialog.confirm("重新打开分成对账单", { message: `将「${s.franchise} · ${s.month}」重置为待确认，加盟商可重新核对。` }))) return;
    void post("/api/mall/ops", { action: "reopenRevShareStatement", statementId: s.id }, "已重新打开，等待加盟商确认");
  }

  // ---- 列定义 ----
  const priceColumns: Array<DataColumn<PriceChangeRequest>> = [
    { key: "product", label: "商品", render: (row) => <span className="font-black">{row.productName}</span> },
    { key: "supplier", label: "供应商", render: (row) => row.supplierName },
    {
      key: "price", label: "供货价变动", render: (row) => (
        <span className="whitespace-nowrap">
          R$ {row.oldPrice.toFixed(2)} → <b style={{ color: row.newPrice > row.oldPrice ? "var(--danger)" : "var(--success)" }}>R$ {row.newPrice.toFixed(2)}</b>
        </span>
      ),
    },
    { key: "note", label: "备注", render: (row) => <span className="text-xs text-[var(--muted)]">{row.note || "—"}</span> },
    { key: "time", label: "时间", render: (row) => <span className="text-xs text-[var(--muted)]">{row.createdAt}</span> },
    {
      key: "ops", label: "状态 / 操作", align: "right", render: (row) => row.status === "pending" ? (
        <span className="inline-flex gap-1.5">
          <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: true }, "已批准，供货价已更新")} className={btnOutline}>批准</button>
          <button type="button" onClick={() => void post("/api/mall/ops", { action: "decidePriceChange", requestId: row.id, approve: false }, "已拒绝")} className={btnDanger}>拒绝</button>
        </span>
      ) : statusBadge(row.status, row.status === "approved" ? "已批准" : "已拒绝"),
    },
  ];

  const poColumns: Array<DataColumn<PurchaseOrder>> = [
    { key: "supplier", label: "供应商", render: (po) => <span className="font-black">{po.supplierName}</span> },
    { key: "qty", label: "件数", align: "right", render: (po) => po.items.reduce((sum, item) => sum + item.qty, 0) },
    { key: "cost", label: "参考成本", align: "right", render: (po) => `R$ ${po.totalCost.toFixed(2)}` },
    { key: "status", label: "状态", render: (po) => statusBadge(po.status, (poStatusLabel as Record<string, string>)[po.status] ?? extraPoLabel[po.status] ?? po.status) },
    { key: "time", label: "时间", render: (po) => <span className="text-xs text-[var(--muted)]">{po.createdAt}</span> },
    {
      key: "ops", label: "操作", align: "right", render: (po) => (
        <span className="inline-flex gap-1.5">
          {poActions(po).map((action) => (
            <button key={action.label} type="button" onClick={(e) => { e.stopPropagation(); action.run(); }} className={action.cls}>{action.label}</button>
          ))}
        </span>
      ),
    },
  ];

  const statementColumns: Array<DataColumn<SupplierStatement>> = [
    { key: "supplier", label: "供应商", render: (s) => <span className="font-black">{s.supplierName}</span> },
    { key: "month", label: "月份", render: (s) => s.month },
    { key: "lines", label: "笔数", align: "right", render: (s) => s.lines.length },
    { key: "total", label: "金额", align: "right", render: (s) => <b>R$ {s.total.toFixed(2)}</b> },
    {
      key: "status", label: "状态", render: (s) => (
        <span>
          {statusBadge(s.status, (statementStatusLabel as Record<string, string>)[s.status] ?? extraStatementLabel[s.status] ?? s.status)}
          {s.status === "disputed" && s.disputeNote && <span className="mt-0.5 block text-[11px] font-bold" style={{ color: "var(--warn)" }}>异议原因：{s.disputeNote}</span>}
        </span>
      ),
    },
    {
      key: "ops", label: "操作", align: "right", render: (s) => (
        <span className="inline-flex gap-1.5">
          {s.status === "confirmed" && <button type="button" onClick={(e) => { e.stopPropagation(); void payStatement(s); }} className={btnOutline}>标记已付款</button>}
          {s.status === "disputed" && <button type="button" onClick={(e) => { e.stopPropagation(); void reopenStatement(s); }} className={btnWarn}>重新打开</button>}
          <button type="button" onClick={(e) => { e.stopPropagation(); exportStatementCsv(s); }} className={btnGhost}>明细 CSV</button>
        </span>
      ),
    },
  ];

  const revShareColumns: Array<DataColumn<RevShareStatement>> = [
    { key: "franchise", label: "加盟商", render: (s) => <span className="font-black">{s.franchise}</span> },
    { key: "month", label: "月份", render: (s) => s.month },
    { key: "orders", label: "单数", align: "right", render: (s) => s.orders },
    { key: "net", label: "加盟商净", align: "right", render: (s) => `R$ ${s.franchiseNetTotal.toFixed(2)}` },
    { key: "station", label: "站点分成", align: "right", render: (s) => `R$ ${s.stationShareTotal.toFixed(2)}` },
    { key: "total", label: "合计", align: "right", render: (s) => <b>R$ {s.total.toFixed(2)}</b> },
    {
      key: "status", label: "状态", render: (s) => (
        <span>
          {statusBadge(s.status, REV_SHARE_STATUS_LABEL[s.status] ?? s.status)}
          {s.status === "disputed" && s.disputeNote && <span className="mt-0.5 block text-[11px] font-bold" style={{ color: "var(--warn)" }}>异议原因：{s.disputeNote}</span>}
        </span>
      ),
    },
    {
      key: "ops", label: "操作", align: "right", render: (s) => (
        <span className="inline-flex gap-1.5">
          {s.status === "confirmed" && <button type="button" onClick={(e) => { e.stopPropagation(); void payRevShare(s); }} className={btnOutline}>标记已付款</button>}
          {s.status === "disputed" && <button type="button" onClick={(e) => { e.stopPropagation(); void reopenRevShare(s); }} className={btnWarn}>重新打开</button>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* 1) 供货价调整审批 */}
      <SectionCard title={`供货价调整审批（待处理 ${priceChanges.filter((row) => row.status === "pending").length}）`} desc="供应商发起的供货价调整,批准后立即生效并回写商品供货价。" className="!p-4">
        <DataTable columns={priceColumns} rows={priceChanges} rowKey={(row) => row.id} minWidth={760} empty="暂无调价申请。" />
      </SectionCard>

      {/* 2) 补货单（PO） */}
      <SectionCard
        title="补货单（PO）· 代销备货流转"
        desc={<>代销模式:补货单仅用于备货/调拨与入库流转,<b>不产生应付账款</b>。供应商货款一律以月度对账(履约订单 × 供货价)结算,补货金额仅为备货参考成本。</>}
        className="!p-4"
        right={
          poFormOpen
            ? <button type="button" onClick={() => { setPoFormOpen(false); setPoSupplier(""); setPoItems({}); }} className="h-9 rounded-[8px] border border-[var(--line)] px-3.5 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">收起</button>
            : <button type="button" onClick={() => setPoFormOpen(true)} className={btnPrimary}>下补货单</button>
        }
      >
        {poFormOpen && (
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
                    void post("/api/mall/ops", { action: "createPO", supplierName: poSupplier, items }, "补货单已下达，等待供应商确认").then(() => { setPoSupplier(""); setPoItems({}); setPoFormOpen(false); });
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
        )}
        <DataTable columns={poColumns} rows={purchaseOrders} rowKey={(po) => po.id} onRowClick={(po) => setPoDrawerId(po.id)} minWidth={760} empty="暂无补货单。" />
      </SectionCard>

      {/* 3) 供应商月度对账单 */}
      <SectionCard
        title="供应商月度对账单"
        desc="按「履约订单 × 供货价」自动汇总每个供应商;供应商确认后在此标记付款。"
        className="!p-4"
        right={
          <>
            <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
            <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateStatement", month: statementMonth }, t("dynStatementGen", { m: statementMonth }))} className={btnPrimary}>生成对账单</button>
          </>
        }
      >
        <DataTable columns={statementColumns} rows={statements} rowKey={(s) => s.id} onRowClick={(s) => setStDrawerId(s.id)} minWidth={820} empty="选择月份生成对账单：按「履约订单 × 供货价」自动汇总每个供应商。" />
      </SectionCard>

      {/* 4) 销售分成对账单（加盟商） */}
      <SectionCard
        title="销售分成 · 月度对账（加盟商）"
        desc="按「已取货订单 × 产品加盟商分成」自动汇总。加盟商在自己后台确认后,这里可标记付款。"
        className="!p-4"
        right={
          <>
            <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
            <button type="button" onClick={() => void post("/api/mall/ops", { action: "generateRevShareStatement", month: statementMonth }, t("dynShareStatementGen", { m: statementMonth }))} className={btnPrimary}>生成分成对账单</button>
          </>
        }
      >
        <DataTable columns={revShareColumns} rows={revShares} rowKey={(s) => s.id} onRowClick={(s) => setRsDrawerId(s.id)} minWidth={860} empty="按「已取货订单 × 产品加盟商分成」自动汇总。加盟商在自己后台确认后，这里可标记付款。" />
      </SectionCard>

      {/* 补货单明细抽屉 */}
      <Drawer
        open={Boolean(drawerPo)}
        onClose={() => setPoDrawerId("")}
        ariaLabel="补货单明细"
        title={drawerPo ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerPo.supplierName} · 补货单</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">{drawerPo.id}</div>
          </div>
        ) : null}
      >
        {drawerPo && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(drawerPo.status, (poStatusLabel as Record<string, string>)[drawerPo.status] ?? extraPoLabel[drawerPo.status] ?? drawerPo.status)}
              <span className="text-xs font-bold text-[var(--muted)]">{drawerPo.items.reduce((sum, item) => sum + item.qty, 0)} 件 · 备货参考成本 R$ {drawerPo.totalCost.toFixed(2)}</span>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-black uppercase text-[var(--muted)]">商品明细</div>
              <div className="rounded-[10px] border border-[var(--line)]">
                {drawerPo.items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-sm font-bold last:border-b-0">
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-[var(--muted)]">R$ {item.supplyPrice.toFixed(2)}</span>
                    <span className="w-12 text-right font-black">×{item.qty}</span>
                  </div>
                ))}
              </div>
            </div>
            {drawerPo.shipNote && (
              <div>
                <div className="mb-1.5 text-[11px] font-black uppercase text-[var(--muted)]">物流备注</div>
                <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-bold">{drawerPo.shipNote}</div>
              </div>
            )}
            <div>
              <div className="mb-1.5 text-[11px] font-black uppercase text-[var(--muted)]">时间线</div>
              <Timeline steps={[
                { label: "创建", at: drawerPo.createdAt, note: drawerPo.createdBy },
                { label: "供应商确认", at: drawerPo.confirmedAt },
                { label: "发货", at: drawerPo.shippedAt },
                { label: "入库", at: drawerPo.receivedAt, note: drawerPo.receivedBy },
              ]} />
            </div>
            {poActions(drawerPo).length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                {poActions(drawerPo).map((action) => (
                  <button key={action.label} type="button" onClick={action.run} className={action.cls}>{action.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* 供应商对账单明细抽屉 */}
      <Drawer
        open={Boolean(drawerSt)}
        onClose={() => setStDrawerId("")}
        width={480}
        ariaLabel="对账单明细"
        title={drawerSt ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerSt.supplierName} · {drawerSt.month} 对账单</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">{drawerSt.id}</div>
          </div>
        ) : null}
      >
        {drawerSt && (
          <div className="space-y-5">
            <div className="rounded-[10px] border border-[var(--line)] px-3">
              <DetailRow label="状态" value={statusBadge(drawerSt.status, (statementStatusLabel as Record<string, string>)[drawerSt.status] ?? extraStatementLabel[drawerSt.status] ?? drawerSt.status)} />
              <DetailRow label="金额" value={<b>R$ {drawerSt.total.toFixed(2)}</b>} />
              <DetailRow label="笔数" value={drawerSt.lines.length} />
              {drawerSt.pixKey && <DetailRow label="PIX" value={drawerSt.pixKey} />}
              {drawerSt.paidAt && <DetailRow label="付款" value={<span className="text-xs">{t("dynPaidOn", { d: drawerSt.paidAt })}{drawerSt.receiptNote ? ` · ${drawerSt.receiptNote}` : ""}</span>} />}
            </div>
            {drawerSt.status === "disputed" && drawerSt.disputeNote && (
              <div className="rounded-[10px] border border-[var(--warn)]/50 bg-[var(--warn-bg)] px-3 py-2 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{drawerSt.disputeNote}</div>
            )}
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[11px] font-black uppercase text-[var(--muted)]">明细行（{drawerSt.lines.length}）</span>
                <button type="button" onClick={() => exportStatementCsv(drawerSt)} className={`ml-auto ${btnGhost}`}>导出 CSV</button>
              </div>
              <div className="rounded-[10px] border border-[var(--line)]">
                {drawerSt.lines.map((line, index) => (
                  <div key={`${line.orderId}-${index}`} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-xs font-bold last:border-b-0">
                    <span className="text-[var(--muted)]">{line.date}</span>
                    <span className="min-w-0 flex-1 truncate">{line.productName}</span>
                    <span className="text-[var(--muted)]">{line.orderId}</span>
                    <span className="w-16 text-right">R$ {line.supplyPrice.toFixed(2)}</span>
                  </div>
                ))}
                {drawerSt.lines.length === 0 && <div className="px-3 py-4 text-center text-xs font-bold text-[var(--muted)]">本月无明细行。</div>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {drawerSt.status === "confirmed" && <button type="button" onClick={() => void payStatement(drawerSt)} className={btnOutline}>标记已付款</button>}
              {drawerSt.status === "disputed" && <button type="button" onClick={() => void reopenStatement(drawerSt)} className={btnWarn}>重新打开</button>}
            </div>
          </div>
        )}
      </Drawer>

      {/* 分成对账单明细抽屉 */}
      <Drawer
        open={Boolean(drawerRs)}
        onClose={() => setRsDrawerId("")}
        ariaLabel="分成对账单明细"
        title={drawerRs ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerRs.franchise} · {drawerRs.month} 分成对账单</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">{drawerRs.id}</div>
          </div>
        ) : null}
      >
        {drawerRs && (
          <div className="space-y-5">
            <div className="rounded-[10px] border border-[var(--line)] px-3">
              <DetailRow label="状态" value={statusBadge(drawerRs.status, REV_SHARE_STATUS_LABEL[drawerRs.status] ?? drawerRs.status)} />
              <DetailRow label="订单数" value={`${drawerRs.orders} 单`} />
              <DetailRow label="加盟商净额" value={`R$ ${drawerRs.franchiseNetTotal.toFixed(2)}`} />
              <DetailRow label="站点分成" value={`R$ ${drawerRs.stationShareTotal.toFixed(2)}`} />
              <DetailRow label="合计" value={<b>R$ {drawerRs.total.toFixed(2)}</b>} />
              {drawerRs.paidAt && <DetailRow label="付款" value={<span className="text-xs">{t("dynPaidOn", { d: drawerRs.paidAt })}</span>} />}
            </div>
            {drawerRs.status === "disputed" && drawerRs.disputeNote && (
              <div className="rounded-[10px] border border-[var(--warn)]/50 bg-[var(--warn-bg)] px-3 py-2 text-xs font-bold" style={{ color: "var(--warn)" }}>异议原因：{drawerRs.disputeNote}</div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {drawerRs.status === "confirmed" && <button type="button" onClick={() => void payRevShare(drawerRs)} className={btnOutline}>标记已付款</button>}
              {drawerRs.status === "disputed" && <button type="button" onClick={() => void reopenRevShare(drawerRs)} className={btnWarn}>重新打开</button>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
