"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import { readSession } from "../lib/session";
import type { RiderWithdrawal } from "../lib/finance";

type BalanceRow = { riderId: string; name: string; rider99Id: string; pix: string; franchise: string; station: string; settled: number; held: number; paid: number; available: number };
type FranchiseRow = { franchise: string; settled: number; paidOut: number; pendingRequests: number; payable: number };

const money = (v: number) => `R$ ${v.toFixed(2)}`;

export default function WalletAdminPage() {
  const session = useMemo(() => readSession(), []);
  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<RiderWithdrawal[]>([]);
  const [franchises, setFranchises] = useState<FranchiseRow[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (scopeFranchise) params.set("franchise", scopeFranchise);
    const response = await fetch(`/api/wallet?${params}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setBalances(payload.data.balances);
      setWithdrawals(payload.data.withdrawals);
      setFranchises(payload.data.franchises);
    }
  }, [headers, scopeFranchise]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "confirmPayment" | "rejectWithdrawal", withdrawalId: string) {
    const note = action === "rejectWithdrawal" ? window.prompt("拒绝原因（会显示给骑手）：") ?? "" : "";
    const response = await fetch("/api/wallet", { method: "POST", headers, body: JSON.stringify({ action, withdrawalId, note }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `操作失败 (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: action === "confirmPayment" ? "已确认付款，骑手余额已扣减并留痕。" : "已拒绝该提现，冻结金额已释放。" });
    void load();
  }

  const pending = withdrawals.filter((w) => w.status === "requested");
  const history = withdrawals.filter((w) => w.status !== "requested").slice(0, 30);

  // Weekly billing statement: per-rider daily settle rows, last 7 days.
  async function exportStatement(franchise: string) {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const response = await fetch(`/api/wallet?statement=${encodeURIComponent(franchise)}&from=${from}&to=${to}`, { headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? "账单导出失败" });
      return;
    }
    const rows = payload.data.rows.map((r: { date: string; riderName: string; rider99Id: string; station: string; settleAmount: number }) => [r.date, r.riderName, r.rider99Id, r.station, r.settleAmount.toFixed(2)]);
    rows.push(["合计", "", "", "", Number(payload.data.total).toFixed(2)]);
    downloadCsv(`statement-${franchise}-${from}_${to}`, ["日期", "骑手", "99ID", "站点", "结算金额"], rows);
    setMessage({ tone: "ok", text: `已导出「${franchise}」${from} ~ ${to} 周期账单（${rows.length - 1} 行，合计 R$ ${Number(payload.data.total).toFixed(2)}）。` });
  }

  return (
    <AppShell>
      <PageTitle
        title="结算与提现"
        eyebrow={scopeFranchise ? `加盟商财务 · ${scopeFranchise}` : "总部财务 · 总部只与加盟商结算"}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="tag"
              onClick={() => downloadCsv(`balances-${new Date().toISOString().slice(0, 10)}`, ["骑手", "99ID", "PIX", "加盟商", "站点", "累计结算", "已提走", "在途", "可提余额"], balances.map((b) => [b.name, b.rider99Id, b.pix, b.franchise, b.station, b.settled.toFixed(2), b.paid.toFixed(2), b.held.toFixed(2), b.available.toFixed(2)]))}
            >
              导出台账
            </button>
            <button
              type="button"
              className="tag"
              onClick={() => downloadCsv(`withdrawals-${new Date().toISOString().slice(0, 10)}`, ["骑手", "PIX", "加盟商", "站点", "金额", "状态", "申请时间", "付款时间", "操作人", "备注"], withdrawals.map((w) => [w.riderName, w.pix, w.franchise, w.station, w.amount.toFixed(2), w.status, w.requestedAt, w.paidAt ?? "", w.paidBy ?? "", w.note ?? ""]))}
            >
              导出流水
            </button>
            {scopeFranchise && (
              <button type="button" className="tag" onClick={() => void exportStatement(scopeFranchise)}>导出周账单</button>
            )}
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {!scopeFranchise && (
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Building2 size={14} /> 加盟商应结对账（总部 → 加盟商）</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">加盟商</th><th className="pb-2 text-right">骑手累计结算</th><th className="pb-2 text-right">已付骑手</th><th className="pb-2 text-right">提现在途</th><th className="pb-2 text-right">应结余额</th><th className="pb-2 text-right">账单</th>
              </tr>
            </thead>
            <tbody>
              {franchises.map((f) => (
                <tr key={f.franchise} className="border-t border-[var(--line)]">
                  <td className="py-2 font-black">{f.franchise}</td>
                  <td className="py-2 text-right">{money(f.settled)}</td>
                  <td className="py-2 text-right text-[var(--ok-ink)]">{money(f.paidOut)}</td>
                  <td className="py-2 text-right text-[var(--warning-ink)]">{money(f.pendingRequests)}</td>
                  <td className="py-2 text-right font-black text-[var(--accent)]">{money(f.payable)}</td>
                  <td className="py-2 text-right"><button type="button" className="tag" onClick={() => void exportStatement(f.franchise)}>周账单</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Banknote size={14} /> 待付款提现（{pending.length}）</div>
            {pending.length > 1 && (
              <button
                type="button"
                className="tag"
                onClick={async () => {
                  if (!window.confirm(`批量确认全部 ${pending.length} 笔提现已付款？`)) return;
                  for (const w of pending) {
                    await fetch("/api/wallet", { method: "POST", headers, body: JSON.stringify({ action: "confirmPayment", withdrawalId: w.id, note: "批量确认" }) });
                  }
                  setMessage({ tone: "ok", text: `已批量确认 ${pending.length} 笔付款。` });
                  void load();
                }}
              >
                全部已付款
              </button>
            )}
          </div>
          {pending.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">暂无待处理提现。</div>
          ) : (
            <div className="space-y-2">
              {pending.map((w) => (
                <div key={w.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-black">{w.riderName} · {money(w.amount)}</div>
                      <div className="text-[11px] font-bold text-[var(--muted)]">PIX {w.pix} ｜ {w.station}（{w.franchise}）｜ {w.requestedAt}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void act("confirmPayment", w.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 已付款确认</button>
                      <button type="button" onClick={() => void act("rejectWithdrawal", w.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--danger-ink)]"><XCircle size={13} /> 拒绝</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-[10px] font-black uppercase text-[var(--muted)]">最近记录</div>
              <div className="max-h-56 space-y-1 overflow-auto pr-1 text-sm font-bold">
                {history.map((w) => (
                  <div key={w.id} className="flex items-center justify-between border-t border-[var(--line)] py-1.5">
                    <span>{w.riderName} · {money(w.amount)} <span className="text-[11px] text-[var(--muted)]">PIX {w.pix}</span></span>
                    <Badge value={w.status === "paid" ? `已付款 ${w.paidAt}` : "已拒绝"} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="panel overflow-x-auto p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">骑手余额台账（{balances.length}）</div>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">骑手</th><th className="pb-2">站点</th><th className="pb-2 text-right">累计结算</th><th className="pb-2 text-right">已提走</th><th className="pb-2 text-right">在途</th><th className="pb-2 text-right">可提余额</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.riderId} className="border-t border-[var(--line)]">
                  <td className="py-2 font-black">{b.name}</td>
                  <td className="py-2"><span className="tag">{b.station}</span></td>
                  <td className="py-2 text-right">{money(b.settled)}</td>
                  <td className="py-2 text-right text-[var(--ok-ink)]">{money(b.paid)}</td>
                  <td className="py-2 text-right text-[var(--warning-ink)]">{money(b.held)}</td>
                  <td className="py-2 text-right font-black text-[var(--accent)]">{money(b.available)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
