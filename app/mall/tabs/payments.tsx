"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useDialog } from "../../components/dialog";
import { downloadCsv } from "../../lib/csv";
import { Badge } from "../../components/ui";
import { paymentStatusLabel, topUpStatusLabel } from "../../lib/mall-ops";
import { useMallAdmin } from "./context";

/** 充值与收款 — mechanical move from app/mall/page.tsx (wave 1). */

export default function PaymentsTab() {
  const { ops, setOps, optimisticPost, patchTopUp } = useMallAdmin();
  const dialog = useDialog();

  return (
    <div className="space-y-5">
      <div className="panel p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">PIX 充值核销 · 确认到账后入余额（操作留痕）</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">骑手</th><th>金额</th><th>凭证号</th><th>状态</th><th>申请时间</th><th>处理</th><th className="text-right">操作</th></tr></thead>
            <tbody>
              {(ops?.topUps ?? []).map((topUp) => (
                <tr key={topUp.id} className="border-t border-[var(--line)] font-bold">
                  <td className="py-2.5">{topUp.riderName}</td>
                  <td>R$ {topUp.amountBRL.toFixed(2)}</td>
                  <td className="font-mono text-xs">{topUp.reference ?? "—"}</td>
                  <td><Badge value={topUpStatusLabel[topUp.status]} /></td>
                  <td className="text-xs text-[var(--muted)]">{topUp.createdAt}</td>
                  <td className="text-xs text-[var(--muted)]">{topUp.decidedAt ? `${topUp.decidedAt} · ${topUp.decidedBy}` : "—"}</td>
                  <td className="text-right">
                    {topUp.status === "submitted" && (
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => { const prev = ops; void optimisticPost("/api/mall/ops", { action: "confirmTopUp", topUpId: topUp.id }, "已确认到账，余额已入账", () => patchTopUp(topUp.id, { status: "confirmed" }), () => setOps(prev)); }} className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-bold text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 确认到账</button>
                        <button type="button" onClick={async () => { const note = await dialog.prompt("驳回充值", { message: `驳回 ${topUp.riderName} 的 R$ ${topUp.amountBRL.toFixed(2)} 充值申请。`, placeholder: "驳回原因（可空）" }); if (note === null) return; const prev = ops; void optimisticPost("/api/mall/ops", { action: "rejectTopUp", topUpId: topUp.id, note }, "已驳回", () => patchTopUp(topUp.id, { status: "rejected" }), () => setOps(prev)); }} className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-xs font-bold text-[var(--danger)]"><XCircle size={13} /> 驳回</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(ops?.topUps ?? []).length === 0 && <tr><td colSpan={7} className="py-8 text-center font-bold text-[var(--muted)]">暂无充值申请。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-black uppercase text-[var(--muted)]">现金余额台账（不可篡改记录）</span>
          <button type="button" onClick={() => downloadCsv("cash-ledger.csv", ["时间", "骑手", "类型", "金额", "余额", "来源", "备注", "操作人"], (ops?.cashLedger ?? []).map((entry) => [entry.createdAt, entry.riderName, entry.type, entry.amountBRL.toFixed(2), entry.balanceAfter.toFixed(2), entry.sourceId, entry.note ?? "", entry.createdBy]))} className="ml-auto h-9 rounded-[8px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)]">导出 CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">时间</th><th>骑手</th><th>类型</th><th>金额</th><th>余额</th><th>来源</th><th>操作人</th></tr></thead>
            <tbody>
              {(ops?.cashLedger ?? []).map((entry) => (
                <tr key={entry.id} className="border-t border-[var(--line)] font-bold">
                  <td className="py-2.5 text-xs text-[var(--muted)]">{entry.createdAt}</td>
                  <td>{entry.riderName}</td>
                  <td>{entry.type === "topup" ? "充值" : entry.type === "spend" ? "消费" : entry.type === "refund" ? "退款" : "调整"}</td>
                  <td style={{ color: entry.type === "spend" ? "var(--danger)" : "var(--success)" }}>{entry.type === "spend" ? "-" : "+"}R$ {Math.abs(entry.amountBRL).toFixed(2)}</td>
                  <td>R$ {entry.balanceAfter.toFixed(2)}</td>
                  <td className="font-mono text-xs">{entry.sourceId}{entry.note ? ` · ${entry.note}` : ""}</td>
                  <td className="text-xs text-[var(--muted)]">{entry.createdBy}</td>
                </tr>
              ))}
              {(ops?.cashLedger ?? []).length === 0 && <tr><td colSpan={7} className="py-8 text-center font-bold text-[var(--muted)]">暂无余额流水。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(ops?.payments ?? []).length > 0 && (
        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">历史按单收款记录（旧流程存档）</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead><tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]"><th className="py-2">骑手</th><th>商品</th><th>金额</th><th>凭证号</th><th>状态</th></tr></thead>
              <tbody>
                {(ops?.payments ?? []).map((payment) => (
                  <tr key={payment.id} className="border-t border-[var(--line)] font-bold">
                    <td className="py-2.5">{payment.riderName}</td>
                    <td>{payment.productName}</td>
                    <td>R$ {payment.amountBRL.toFixed(2)}</td>
                    <td className="font-mono text-xs">{payment.reference ?? "—"}</td>
                    <td><Badge value={paymentStatusLabel[payment.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
