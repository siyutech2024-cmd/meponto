"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import type { CashLedgerEntry, CashTopUp, MallPayment } from "../../lib/mall-ops";
import { paymentStatusLabel, topUpStatusLabel } from "../../lib/mall-ops";
import { DataTable, Drawer, Stat, StatusBadge, TodoCard, type BadgeTone, type DataColumn } from "../kit";
import { useMallAdmin } from "./context";

/** 充值与收款 — Stat/TodoCard + DataTable + Drawer 工作台。
 *  充值核销点行开抽屉看详情并在抽屉内确认/驳回；行内保留「确认」主操作；
 *  现金台账走 StatusBadge；历史按单收款存档默认收起。 */

const TOPUP_TONE: Record<CashTopUp["status"], BadgeTone> = { pending: "warn", submitted: "warn", confirmed: "success", rejected: "danger" };
const PAYMENT_TONE: Record<MallPayment["status"], BadgeTone> = { pending: "warn", submitted: "warn", confirmed: "success", rejected: "danger" };
const LEDGER_TYPE: Record<CashLedgerEntry["type"], { label: string; tone: BadgeTone }> = {
  topup: { label: "充值", tone: "success" },
  spend: { label: "消费", tone: "danger" },
  refund: { label: "退款", tone: "info" },
  adjust: { label: "调整", tone: "neutral" },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right font-bold">{children}</span>
    </div>
  );
}

export default function PaymentsTab() {
  const { ops, setOps, optimisticPost, patchTopUp } = useMallAdmin();
  const dialog = useDialog();

  const [drawerId, setDrawerId] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const topUps = useMemo(() => ops?.topUps ?? [], [ops]);
  const ledger = useMemo(() => ops?.cashLedger ?? [], [ops]);
  const payments = useMemo(() => ops?.payments ?? [], [ops]);

  // ---- 顶部指标（客户端计算） ----
  const today = todayStr();
  const pendingVouchers = useMemo(() => topUps.filter((t) => t.status === "submitted").length, [topUps]);
  const todayCredited = useMemo(
    () => ledger.filter((e) => e.type === "topup" && (e.createdAt ?? "").slice(0, 10) === today).reduce((sum, e) => sum + Math.abs(e.amountBRL), 0),
    [ledger, today],
  );
  // 现金余额总池：每位骑手取最新一条流水的 balanceAfter 后求和。
  const balancePool = useMemo(() => {
    const latest = new Map<string, CashLedgerEntry>();
    for (const entry of ledger) {
      const current = latest.get(entry.riderId);
      if (!current || entry.createdAt > current.createdAt) latest.set(entry.riderId, entry);
    }
    let sum = 0;
    for (const entry of latest.values()) sum += entry.balanceAfter;
    return sum;
  }, [ledger]);

  // ---- 核销操作（行内与抽屉共用；沿用既有 action + optimisticPost + dialog） ----
  function confirmTopUp(topUp: CashTopUp) {
    const prev = ops;
    void optimisticPost("/api/mall/ops", { action: "confirmTopUp", topUpId: topUp.id }, "已确认到账，余额已入账", () => patchTopUp(topUp.id, { status: "confirmed" }), () => setOps(prev));
  }
  async function rejectTopUp(topUp: CashTopUp) {
    const note = await dialog.prompt("驳回充值", { message: `驳回 ${topUp.riderName} 的 R$ ${topUp.amountBRL.toFixed(2)} 充值申请。`, placeholder: "驳回原因（可空）" });
    if (note === null) return;
    const prev = ops;
    void optimisticPost("/api/mall/ops", { action: "rejectTopUp", topUpId: topUp.id, note }, "已驳回", () => patchTopUp(topUp.id, { status: "rejected" }), () => setOps(prev));
  }

  // ---- 充值核销表 ----
  const topUpColumns: Array<DataColumn<CashTopUp>> = [
    { key: "rider", label: "骑手", render: (t) => t.riderName },
    { key: "amount", label: "金额", render: (t) => `R$ ${t.amountBRL.toFixed(2)}` },
    { key: "reference", label: "凭证号", render: (t) => <span className="font-mono text-xs">{t.reference ?? "—"}</span> },
    { key: "status", label: "状态", render: (t) => <StatusBadge tone={TOPUP_TONE[t.status]} label={topUpStatusLabel[t.status] ?? t.status} /> },
    { key: "created", label: "申请时间", render: (t) => <span className="text-xs font-bold text-[var(--muted)]">{t.createdAt}</span> },
    { key: "decided", label: "处理", render: (t) => <span className="text-xs font-bold text-[var(--muted)]">{t.decidedAt ? `${t.decidedAt} · ${t.decidedBy}` : "—"}</span> },
    {
      key: "action",
      label: "操作",
      align: "right",
      render: (t) => t.status === "submitted" ? (
        <span onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => confirmTopUp(t)} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--accent)]/40 px-2.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10">
            <CheckCircle2 size={13} /> 确认
          </button>
        </span>
      ) : <span className="text-xs font-bold text-[var(--muted)]">—</span>,
    },
  ];

  // ---- 现金台账表 ----
  const ledgerColumns: Array<DataColumn<CashLedgerEntry>> = [
    { key: "time", label: "时间", render: (e) => <span className="text-xs font-bold text-[var(--muted)]">{e.createdAt}</span> },
    { key: "rider", label: "骑手", render: (e) => e.riderName },
    { key: "type", label: "类型", render: (e) => <StatusBadge tone={LEDGER_TYPE[e.type].tone} label={LEDGER_TYPE[e.type].label} /> },
    { key: "amount", label: "金额", render: (e) => <span style={{ color: e.type === "spend" ? "var(--danger)" : "var(--success)" }}>{e.type === "spend" ? "-" : "+"}R$ {Math.abs(e.amountBRL).toFixed(2)}</span> },
    { key: "balance", label: "余额", render: (e) => `R$ ${e.balanceAfter.toFixed(2)}` },
    { key: "source", label: "来源", render: (e) => <span className="font-mono text-xs">{e.sourceId}{e.note ? ` · ${e.note}` : ""}</span> },
    { key: "operator", label: "操作人", render: (e) => <span className="text-xs font-bold text-[var(--muted)]">{e.createdBy}</span> },
  ];

  // ---- 历史按单收款（旧流程存档，默认收起） ----
  const paymentColumns: Array<DataColumn<MallPayment>> = [
    { key: "rider", label: "骑手", render: (p) => p.riderName },
    { key: "product", label: "商品", render: (p) => p.productName },
    { key: "amount", label: "金额", render: (p) => `R$ ${p.amountBRL.toFixed(2)}` },
    { key: "reference", label: "凭证号", render: (p) => <span className="font-mono text-xs">{p.reference ?? "—"}</span> },
    { key: "status", label: "状态", render: (p) => <StatusBadge tone={PAYMENT_TONE[p.status]} label={paymentStatusLabel[p.status] ?? p.status} /> },
  ];

  const drawerTopUp = drawerId ? topUps.find((t) => t.id === drawerId) : undefined;

  return (
    <div className="space-y-3">
      {/* ---- 顶部指标 ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TodoCard label="待核销凭证" value={pendingVouchers} tone={pendingVouchers > 0 ? "warn" : "neutral"} hint="骑手已提交 PIX 凭证，等待人工确认到账" />
        <Stat label="今日已入账" value={`R$ ${todayCredited.toFixed(2)}`} hint="今天确认到账的充值总额" />
        <Stat label="现金余额总池" value={`R$ ${balancePool.toFixed(2)}`} hint="全体骑手当前现金余额合计（按台账估算）" />
      </div>

      {/* ---- PIX 充值核销 ---- */}
      <div>
        <div className="mb-2 px-1 text-xs font-black uppercase text-[var(--muted)]">PIX 充值核销 · 确认到账后入余额（操作留痕）——点行查看详情</div>
        <DataTable
          columns={topUpColumns}
          rows={topUps}
          rowKey={(t) => t.id}
          onRowClick={(t) => setDrawerId(t.id)}
          minWidth={760}
          empty="暂无充值申请。"
        />
      </div>

      {/* ---- 现金余额台账 ---- */}
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-xs font-black uppercase text-[var(--muted)]">现金余额台账（不可篡改记录）</span>
          <button type="button" onClick={() => downloadCsv("cash-ledger.csv", ["时间", "骑手", "类型", "金额", "余额", "来源", "备注", "操作人"], ledger.map((entry) => [entry.createdAt, entry.riderName, LEDGER_TYPE[entry.type].label, entry.amountBRL.toFixed(2), entry.balanceAfter.toFixed(2), entry.sourceId, entry.note ?? "", entry.createdBy]))} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV</button>
        </div>
        <DataTable columns={ledgerColumns} rows={ledger} rowKey={(e) => e.id} minWidth={760} empty="暂无余额流水。" />
      </div>

      {/* ---- 历史按单收款存档（默认收起） ---- */}
      {payments.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-xs font-black uppercase text-[var(--muted)]">历史按单收款记录（旧流程存档 · 共 {payments.length} 条）</span>
            <button type="button" onClick={() => setArchiveOpen((v) => !v)} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">
              {archiveOpen ? "收起" : "展开"}
            </button>
          </div>
          {archiveOpen && <DataTable columns={paymentColumns} rows={payments} rowKey={(p) => p.id} minWidth={680} empty="暂无历史收款记录。" />}
        </div>
      )}

      {/* ---- 充值详情抽屉：详情 + 确认/驳回 ---- */}
      {drawerTopUp && (
        <Drawer
          open
          onClose={() => setDrawerId("")}
          ariaLabel="充值申请详情"
          title={
            <div className="min-w-0">
              <div className="truncate text-sm font-black">{drawerTopUp.riderName} · R$ {drawerTopUp.amountBRL.toFixed(2)}</div>
              <div className="truncate font-mono text-[11px] font-bold text-[var(--muted)]">{drawerTopUp.id}</div>
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={TOPUP_TONE[drawerTopUp.status]} label={topUpStatusLabel[drawerTopUp.status] ?? drawerTopUp.status} />
          </div>

          <div className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
            <div className="mb-1 text-[11px] font-black uppercase text-[var(--muted)]">凭证信息</div>
            <InfoRow label="金额">R$ {drawerTopUp.amountBRL.toFixed(2)}</InfoRow>
            <InfoRow label="凭证号"><span className="font-mono text-xs">{drawerTopUp.reference ?? "—"}</span></InfoRow>
            <InfoRow label="收款 PIX"><span className="font-mono text-xs">{drawerTopUp.pixKey || "—"}</span></InfoRow>
          </div>

          <div className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
            <div className="mb-1 text-[11px] font-black uppercase text-[var(--muted)]">处理轨迹</div>
            <InfoRow label="申请时间">{drawerTopUp.createdAt}</InfoRow>
            {drawerTopUp.submittedAt && <InfoRow label="提交凭证">{drawerTopUp.submittedAt}</InfoRow>}
            <InfoRow label="处理结果">{drawerTopUp.decidedAt ? `${drawerTopUp.decidedAt} · ${drawerTopUp.decidedBy}` : "待处理"}</InfoRow>
            {drawerTopUp.note && <InfoRow label="备注">{drawerTopUp.note}</InfoRow>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
            {drawerTopUp.status === "submitted" ? (
              <>
                <button type="button" onClick={() => confirmTopUp(drawerTopUp)} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)]">
                  <CheckCircle2 size={13} /> 确认到账
                </button>
                <button type="button" onClick={() => void rejectTopUp(drawerTopUp)} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--danger)]/40 px-3.5 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-bg)]">
                  <XCircle size={13} /> 驳回
                </button>
              </>
            ) : (
              <span className="text-xs font-bold text-[var(--muted)]">{drawerTopUp.status === "confirmed" ? "已确认到账并入余额，无需操作。" : drawerTopUp.status === "rejected" ? "申请已驳回，无需操作。" : "等待骑手提交转账凭证。"}</span>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}
