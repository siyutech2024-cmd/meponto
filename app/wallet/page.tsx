"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CheckCircle2, ChevronRight, RefreshCcw, XCircle } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import { readSession } from "../lib/session";
import { useDialog } from "../components/dialog";
import type { RiderWithdrawal } from "../lib/finance";

type WeeklyRider = { name: string; rider99Id: string; station: string; settle: number; orders: number; days: number; paid: number };
type WeeklyGroup = { franchise: string; settle: number; franchisePaid: number; riders: WeeklyRider[] };
type Weekly = { week: { from: string; to: string }; franchises: WeeklyGroup[]; grandTotal: number; scoped: boolean };

const money = (v: number) => `R$ ${v.toFixed(2)}`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function WalletAdminPage() {
  const dialog = useDialog();
  const session = useMemo(() => readSession(), []);
  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [withdrawals, setWithdrawals] = useState<RiderWithdrawal[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Payment modal state.
  const [pay, setPay] = useState<{ target: "franchise" | "rider"; refName: string; franchise: string; suggested: number } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payPeriod, setPayPeriod] = useState<"weekly" | "daily">("weekly");
  const [payNote, setPayNote] = useState("");

  const load = useCallback(async () => {
    const [weeklyResponse, listResponse] = await Promise.all([
      fetch(`/api/wallet?view=weekly&week=${anchor}`, { headers, cache: "no-store" }),
      fetch(`/api/wallet?${scopeFranchise ? `franchise=${encodeURIComponent(scopeFranchise)}` : ""}`, { headers, cache: "no-store" }),
    ]);
    if (weeklyResponse.ok) setWeekly((await weeklyResponse.json()).data);
    if (listResponse.ok) setWithdrawals((await listResponse.json()).data.withdrawals ?? []);
  }, [headers, anchor, scopeFranchise]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftWeek = (deltaDays: number) => {
    const d = new Date(`${anchor}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    setAnchor(d.toISOString().slice(0, 10));
  };

  function openPay(target: "franchise" | "rider", refName: string, franchise: string, suggested: number) {
    setPay({ target, refName, franchise, suggested });
    setPayAmount(suggested > 0 ? suggested.toFixed(2) : "");
    setPayPeriod("weekly");
    setPayNote("");
  }

  async function submitPay() {
    if (!pay || !weekly) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({ tone: "err", text: "请输入有效金额" });
      return;
    }
    const response = await fetch("/api/wallet", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "recordPayment", target: pay.target, refName: pay.refName, franchise: pay.franchise, amount, period: payPeriod, weekFrom: weekly.week.from, weekTo: weekly.week.to, note: payNote }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `付款失败 (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: `已记录付款：${pay.target === "franchise" ? "加盟商" : "骑手"} ${pay.refName} ${money(amount)}（${payPeriod === "weekly" ? "周付" : "日付"}）。` });
    setPay(null);
    void load();
  }

  async function act(action: "confirmPayment" | "rejectWithdrawal", withdrawalId: string) {
    const note = action === "rejectWithdrawal" ? (await dialog.prompt("拒绝提现", { message: "拒绝原因（会显示给骑手）" })) ?? "" : "";
    const response = await fetch("/api/wallet", { method: "POST", headers, body: JSON.stringify({ action, withdrawalId, note }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `操作失败 (${response.status})` });
      return;
    }
    setMessage({ tone: "ok", text: action === "confirmPayment" ? "已确认付款，骑手余额已扣减并留痕。" : "已拒绝该提现，冻结金额已释放。" });
    void load();
  }

  // Fetch enriched statement rows for the current week (full rider fields).
  async function fetchStatement(franchise: string) {
    if (!weekly) return null;
    const r = await fetch(`/api/wallet?statement=${encodeURIComponent(franchise)}&from=${weekly.week.from}&to=${weekly.week.to}`, { headers, cache: "no-store" });
    if (!r.ok) {
      setMessage({ tone: "err", text: "账单生成失败" });
      return null;
    }
    return (await r.json()).data as { from: string; to: string; total: number; rows: StatementRow[] };
  }

  type StatementRow = { date: string; riderName: string; rider99Id: string; cpf: string; pix: string; franchise: string; station: string; orders: number; onlineHours: number | null; ar: number | null; tripIncome: number; bonus: number; tips: number; cashDebt: number; mealDeduction: number; other: number; settleAmount: number };

  async function exportCsv(franchise: string) {
    const data = await fetchStatement(franchise);
    if (!data) return;
    const headerRow = ["日期", "骑手", "99ID", "CPF", "PIX", "加盟商", "站点", "完单", "在线时长", "AR%", "行程收入", "奖励", "小费", "现金欠款", "餐损", "其他", "结算金额"];
    const rows = data.rows.map((r) => [r.date, r.riderName, r.rider99Id, r.cpf, r.pix, r.franchise, r.station, String(r.orders), r.onlineHours ?? "", r.ar ?? "", r.tripIncome.toFixed(2), r.bonus.toFixed(2), r.tips.toFixed(2), r.cashDebt.toFixed(2), r.mealDeduction.toFixed(2), r.other.toFixed(2), r.settleAmount.toFixed(2)]);
    rows.push(["合计", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", Number(data.total).toFixed(2)]);
    downloadCsv(`statement-${franchise}-${data.from}_${data.to}`, headerRow, rows);
    setMessage({ tone: "ok", text: `已导出「${franchise}」${md(data.from)}–${md(data.to)} 明细（${data.rows.length} 行，合计 ${money(Number(data.total))}）。` });
  }

  async function exportPdf(franchise: string) {
    const data = await fetchStatement(franchise);
    if (!data) return;
    const esc = (v: string) => String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
    const body = data.rows
      .map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.riderName)}</td><td>${esc(r.station)}</td><td style="text-align:right">${r.orders}</td><td style="text-align:right">${r.ar ?? "—"}</td><td style="text-align:right">R$ ${r.settleAmount.toFixed(2)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Extrato ${esc(franchise)} ${data.from}_${data.to}</title>
      <style>body{font-family:Inter,Arial,sans-serif;color:#111;padding:32px}h1{font-size:20px;margin:0}.sub{color:#666;font-size:12px;margin:4px 0 18px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}
      th{background:#faf7e6;font-size:10px;text-transform:uppercase}tfoot td{font-weight:800;border-top:2px solid #111}.brand{font-weight:800;margin-bottom:12px}</style></head>
      <body><div class="brand">MePonto · Extrato de repasse</div><h1>${esc(franchise)}</h1>
      <div class="sub">Semana ${data.from} a ${data.to} · gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <table><thead><tr><th>Data</th><th>Entregador</th><th>Ponto</th><th style="text-align:right">Pedidos</th><th style="text-align:right">AR</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="5">Total</td><td style="text-align:right">R$ ${Number(data.total).toFixed(2)}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const win = window.open("", "_blank");
    if (!win) { setMessage({ tone: "err", text: "请允许弹出窗口后重试。" }); return; }
    win.document.write(html);
    win.document.close();
  }

  const pendingWithdrawals = withdrawals.filter((w) => w.status === "requested");
  const toggle = (name: string) => setOpen((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; });

  return (
    <AppShell>
      <PageTitle
        title="结算与提现"
        eyebrow={scopeFranchise ? `加盟商财务 · ${scopeFranchise}` : "自然周结算 · 加盟商 → 骑手"}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Week selector */}
      <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3" data-i18n-skip>
        <button type="button" className="tag" onClick={() => shiftWeek(-7)}>← 上一周</button>
        <div className="text-sm font-black">
          {weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)}` : "—"}
          <span className="ml-2 text-[11px] font-bold text-[var(--muted)]">自然周（周一至周日）</span>
        </div>
        <button type="button" className="tag" onClick={() => shiftWeek(7)}>下一周 →</button>
        <div className="ml-auto text-sm font-black text-[var(--accent)]">本周应结 {weekly ? money(weekly.grandTotal) : "—"}</div>
      </div>

      {/* Franchise → rider fold */}
      <div className="space-y-2">
        {(weekly?.franchises ?? []).length === 0 && <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">本周暂无结算数据。</div>}
        {weekly?.franchises.map((g) => {
          const pendingAmt = Math.max(0, Math.round((g.settle - g.franchisePaid) * 100) / 100);
          const expanded = open.has(g.franchise);
          return (
            <div key={g.franchise} className="panel overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button type="button" onClick={() => toggle(g.franchise)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <ChevronRight size={16} className={`shrink-0 text-[var(--muted)] transition-transform ${expanded ? "rotate-90" : ""}`} />
                  <Building2 size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="truncate text-sm font-black">{g.franchise}</span>
                  <span className="text-[11px] font-bold text-[var(--muted)]">{g.riders.length} 骑手</span>
                </button>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right"><div className="text-[10px] font-black uppercase text-[var(--muted)]">应结</div><div className="font-black">{money(g.settle)}</div></div>
                  <div className="text-right"><div className="text-[10px] font-black uppercase text-[var(--muted)]">已付</div><div className="font-black text-[var(--ok-ink)]">{money(g.franchisePaid)}</div></div>
                  <div className="text-right"><div className="text-[10px] font-black uppercase text-[var(--muted)]">待付</div><div className={`font-black ${pendingAmt > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{money(pendingAmt)}</div></div>
                </div>
                <div className="flex gap-1.5">
                  {!scopeFranchise && <button type="button" className="inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]" onClick={() => openPay("franchise", g.franchise, g.franchise, pendingAmt)}>标记付加盟商</button>}
                  <button type="button" className="tag" onClick={() => void exportCsv(g.franchise)}>CSV</button>
                  <button type="button" className="tag" onClick={() => void exportPdf(g.franchise)}>PDF</button>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                        <th className="pb-2">骑手</th><th className="pb-2">站点</th><th className="pb-2 text-right">完单</th><th className="pb-2 text-right">天数</th><th className="pb-2 text-right">应结</th><th className="pb-2 text-right">已付</th><th className="pb-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.riders.map((r) => {
                        const ridPending = Math.max(0, Math.round((r.settle - r.paid) * 100) / 100);
                        return (
                          <tr key={r.rider99Id} className="border-t border-[var(--line)]">
                            <td className="py-2 font-black">{r.name}</td>
                            <td className="py-2"><span className="tag">{r.station}</span></td>
                            <td className="py-2 text-right">{r.orders}</td>
                            <td className="py-2 text-right">{r.days}</td>
                            <td className="py-2 text-right font-black">{money(r.settle)}</td>
                            <td className="py-2 text-right text-[var(--ok-ink)]">{money(r.paid)}</td>
                            <td className="py-2 text-right">
                              <button type="button" className="tag" onClick={() => openPay("rider", r.name, g.franchise, ridPending)}>标记已付</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rider PIX withdrawals queue */}
      {pendingWithdrawals.length > 0 && (
        <div className="panel mt-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Banknote size={14} /> 待付款提现申请（{pendingWithdrawals.length}）</div>
          <div className="space-y-2">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div>
                  <div className="text-sm font-black">{w.riderName} · {money(w.amount)}</div>
                  <div className="text-[11px] font-bold text-[var(--muted)]">PIX {w.pix} ｜ {w.station}（{w.franchise}）｜ {w.requestedAt}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void act("confirmPayment", w.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 已付款</button>
                  <button type="button" onClick={() => void act("rejectWithdrawal", w.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--danger-ink)]"><XCircle size={13} /> 拒绝</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment modal */}
      {pay && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--overlay)] p-4 backdrop-blur-sm" onMouseDown={() => setPay(null)}>
          <div className="panel w-full max-w-md p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">标记付款 · {pay.target === "franchise" ? "加盟商" : "骑手"}「{pay.refName}」</h2>
            <p className="mt-1 text-xs font-bold text-[var(--muted)]">{weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)}` : ""} ｜ 建议金额 {money(pay.suggested)}</p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">金额（R$）</span>
              <input autoFocus inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <div className="mt-3">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">付款类型</span>
              <div className="flex gap-2">
                {(["weekly", "daily"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPayPeriod(p)}
                    className={`h-10 rounded-[8px] border px-4 text-sm font-black transition-colors ${
                      payPeriod === p
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted-strong)] hover:border-[var(--muted)]"
                    }`}
                  >
                    {payPeriod === p ? "✓ " : ""}{p === "weekly" ? "周付款" : "日付款"}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">备注（选填）</span>
              <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPay(null)} className="h-10 rounded-[8px] border border-[var(--line)] px-4 text-sm font-black text-[var(--muted-strong)]">取消</button>
              <button type="button" onClick={() => void submitPay()} className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]">确认付款</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
