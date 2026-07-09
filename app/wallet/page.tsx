"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CheckCircle2, ChevronRight, RefreshCcw, Store, Wallet, XCircle } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { downloadCsv } from "../lib/csv";
import { readSession } from "../lib/session";
import { mallHubPortals } from "../lib/portals";
import { useDialog } from "../components/dialog";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import type { RiderWithdrawal } from "../lib/finance";

type WeeklyRider = { name: string; rider99Id: string; station: string; settle: number; orders: number; days: number; paid: number };
type WeeklyGroup = { franchise: string; settle: number; franchisePaid: number; riders: WeeklyRider[] };
type Weekly = { week: { from: string; to: string }; franchises: WeeklyGroup[]; grandTotal: number; scoped: boolean };

const money = (v: number) => `R$ ${v.toFixed(2)}`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

function RiderPayrollWallet() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const scopeFranchise = session?.portal === "franchise" ? session.franchise || session.organization : "";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);

  const [anchor, setAnchor] = useState(""); // "" → backend picks the latest week with data
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<RiderWithdrawal[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Payment modal state.
  const [pay, setPay] = useState<{ target: "franchise" | "rider"; refName: string; franchise: string; suggested: number } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payPeriod, setPayPeriod] = useState<"weekly" | "daily">("weekly");
  const [payNote, setPayNote] = useState("");
  type RevStatement = { id: string; franchise: string; month: string; status: "draft" | "confirmed" | "paid" | "disputed"; total: number; orders: number; stationShareTotal: number; franchiseNetTotal: number; disputeNote?: string };
  type RevEntry = { id: string; orderId: string; productName: string; pickupStoreName: string; franchise: string; month: string; franchiseNetBRL: number; stationShareBRL: number };
  const [revStatements, setRevStatements] = useState<RevStatement[]>([]);
  const [revEntries, setRevEntries] = useState<RevEntry[]>([]);
  const [openStmt, setOpenStmt] = useState<Set<string>>(new Set());
  const [stationShare, setStationShare] = useState("");

  const loadRevShare = useCallback(async () => {
    if (!scopeFranchise) return;
    const r = await fetch("/api/mall/ops", { headers, cache: "no-store" }).catch(() => null);
    if (r && r.ok) {
      const data = (await r.json()).data ?? {};
      setRevStatements((data.revShareStatements ?? []) as RevStatement[]);
      setRevEntries((data.revShareEntries ?? []) as RevEntry[]);
    }
  }, [headers, scopeFranchise]);
  useEffect(() => { void loadRevShare(); }, [loadRevShare]);

  // Order-level entries backing one monthly statement (so the franchise can
  // inspect what it is confirming instead of blind-signing).
  const entriesOf = (s: RevStatement) => revEntries.filter((e) => e.month === s.month && e.franchise === s.franchise);
  const toggleStmt = (id: string) => setOpenStmt((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  function exportRevDetailCsv(s: RevStatement) {
    const rows = entriesOf(s);
    const header = [t("wlColOrderId"), t("wlColProduct"), t("wlColPickupStore"), t("wlColFrNet"), t("wlColStShare")];
    const body = rows.map((e) => [e.orderId, e.productName, e.pickupStoreName, e.franchiseNetBRL.toFixed(2), e.stationShareBRL.toFixed(2)]);
    body.push([t("wlCsvTotal"), "", "", rows.reduce((a, e) => a + e.franchiseNetBRL, 0).toFixed(2), rows.reduce((a, e) => a + e.stationShareBRL, 0).toFixed(2)]);
    downloadCsv(`revshare-detail-${s.franchise}-${s.month}`, header, body);
    setMessage({ tone: "ok", text: t("wlDetailExported", { n: rows.length, m: s.month }) });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [weeklyResponse, listResponse] = await Promise.all([
        fetch(`/api/wallet?view=weekly${anchor ? `&week=${anchor}` : ""}`, { headers, cache: "no-store" }),
        fetch(`/api/wallet?${scopeFranchise ? `franchise=${encodeURIComponent(scopeFranchise)}` : ""}`, { headers, cache: "no-store" }),
      ]);
      if (weeklyResponse.ok) {
        const w = (await weeklyResponse.json()).data as Weekly;
        setWeekly(w);
        // Lock the picker to the data week the backend chose (so navigation works).
        if (!anchor && w?.week?.from) setAnchor(w.week.from);
      }
      if (listResponse.ok) setWithdrawals((await listResponse.json()).data.withdrawals ?? []);
    } finally {
      setLoading(false);
    }
  }, [headers, anchor, scopeFranchise]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftWeek = (deltaDays: number) => {
    const base = anchor || weekly?.week.from || new Date().toISOString().slice(0, 10);
    const d = new Date(`${base}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    // Clear stale numbers immediately so the prior week's totals don't linger
    // on screen while the new week loads.
    setWeekly(null);
    setLoading(true);
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
      setMessage({ tone: "err", text: t("wlInvalidAmount") });
      return;
    }
    const response = await fetch("/api/wallet", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "recordPayment", target: pay.target, refName: pay.refName, franchise: pay.franchise, amount, period: payPeriod, weekFrom: weekly.week.from, weekTo: weekly.week.to, note: payNote }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("wlPayFailed", { s: response.status }) });
      return;
    }
    setMessage({ tone: "ok", text: t("wlPayRecorded", { who: pay.target === "franchise" ? t("wlWho_franchise") : t("wlWho_rider"), name: pay.refName, money: money(amount), period: payPeriod === "weekly" ? t("wlPeriodWeekly") : t("wlPeriodDaily") }) });
    setPay(null);
    void load();
  }

  async function act(action: "confirmPayment" | "rejectWithdrawal", withdrawalId: string) {
    const note = action === "rejectWithdrawal" ? (await dialog.prompt(t("wlRejectTitle"), { message: t("wlRejectMsg") })) ?? "" : "";
    const response = await fetch("/api/wallet", { method: "POST", headers, body: JSON.stringify({ action, withdrawalId, note }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("wlOpFailed", { s: response.status }) });
      return;
    }
    setMessage({ tone: "ok", text: action === "confirmPayment" ? t("wlConfirmedPay") : t("wlRejected") });
    void load();
  }

  // Fetch enriched statement rows for the current week (full rider fields).
  async function fetchStatement(franchise: string) {
    if (!weekly) return null;
    const r = await fetch(`/api/wallet?statement=${encodeURIComponent(franchise)}&from=${weekly.week.from}&to=${weekly.week.to}`, { headers, cache: "no-store" });
    if (!r.ok) {
      setMessage({ tone: "err", text: t("wlStmtFailed") });
      return null;
    }
    return (await r.json()).data as { from: string; to: string; total: number; rows: StatementRow[] };
  }

  type StatementRow = { date: string; riderName: string; rider99Id: string; cpf: string; pix: string; franchise: string; station: string; orders: number; onlineHours: number | null; ar: number | null; tripIncome: number; bonus: number; tips: number; cashDebt: number; mealDeduction: number; other: number; settleAmount: number };

  async function exportCsv(franchise: string) {
    const data = await fetchStatement(franchise);
    if (!data) return;
    const headerRow = [t("wlCsvDate"), t("wlColRider"), "99ID", "CPF", "PIX", t("rdColFranchise"), t("wlColStation"), t("wlColOrders"), t("wlCsvOnlineH"), "AR%", t("wlCsvTripInc"), t("wlCsvBonus"), t("wlCsvTips"), t("wlCsvCashDebt"), t("wlCsvMeal"), t("wlCsvOther"), t("wlCsvSettle")];
    const rows = data.rows.map((r) => [r.date, r.riderName, r.rider99Id, r.cpf, r.pix, r.franchise, r.station, String(r.orders), r.onlineHours ?? "", r.ar ?? "", r.tripIncome.toFixed(2), r.bonus.toFixed(2), r.tips.toFixed(2), r.cashDebt.toFixed(2), r.mealDeduction.toFixed(2), r.other.toFixed(2), r.settleAmount.toFixed(2)]);
    rows.push([t("wlCsvTotal"), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", Number(data.total).toFixed(2)]);
    downloadCsv(`statement-${franchise}-${data.from}_${data.to}`, headerRow, rows);
    setMessage({ tone: "ok", text: t("wlExported", { f: franchise, from: md(data.from), to: md(data.to), n: data.rows.length, money: money(Number(data.total)) }) });
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
    if (!win) { setMessage({ tone: "err", text: t("wlPopupBlocked") }); return; }
    win.document.write(html);
    win.document.close();
  }

  const pendingWithdrawals = withdrawals.filter((w) => w.status === "requested");
  const toggle = (name: string) => setOpen((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; });

  return (
    <AppShell>
      <PageTitle
        title={t("wlTitle")}
        eyebrow={scopeFranchise ? t("wlEyebrowFr", { f: scopeFranchise }) : t("wlEyebrowHq")}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("wlRefresh")}</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Week selector */}
      <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3" data-i18n-skip>
        <button type="button" className="tag" onClick={() => shiftWeek(-7)}>{t("wlPrevWeek")}</button>
        <div className="text-sm font-black">
          {weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)}` : loading ? "加载中…" : "—"}
          <span className="ml-2 text-[11px] font-bold text-[var(--muted)]">{t("wlNatWeek")}</span>
        </div>
        <button type="button" className="tag" onClick={() => shiftWeek(7)}>{t("wlNextWeek")}</button>
        <div className="ml-auto text-sm font-black text-[var(--accent)]">{t("wlWeekTotal", { money: weekly ? money(weekly.grandTotal) : loading ? "…" : "—" })}</div>
      </div>

      <p className="mb-4 -mt-2 px-1 text-[11px] font-bold text-[var(--muted)]">{t("wlExplain")}</p>

      {scopeFranchise && (
        <div className="panel mb-4 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase text-[var(--muted)]">{t("wlRevShare", { f: scopeFranchise })}</span>
            <input value={stationShare} onChange={(e) => setStationShare(e.target.value.replace(/[^\d.]/g, ""))} placeholder={t("wlStationSharePh")} className="ml-auto h-9 w-32 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
            <button type="button" onClick={async () => { const res = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify({ action: "setStationShare", stationShareBRL: Number(stationShare) || 0 }) }); setMessage(res.ok ? { tone: "ok", text: t("wlStationShareSet", { x: Number(stationShare) || 0 }) } : { tone: "err", text: t("wlSetFailed") }); }} className="h-9 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">{t("wlSetStationShare")}</button>
          </div>
          <div className="space-y-2">
            {revStatements.map((s) => {
              const expanded = openStmt.has(s.id);
              const details = expanded ? entriesOf(s) : [];
              return (
                <div key={s.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">{s.month}</span>
                    <Badge value={{ draft: t("wlRsDraft"), confirmed: t("wlRsConfirmed"), paid: t("wlRsPaid"), disputed: t("wlRsDisputed") }[s.status] ?? s.status} />
                    <span className="text-xs font-bold text-[var(--muted)]">{t("wlRsLine", { orders: s.orders, net: `R$ ${s.franchiseNetTotal.toFixed(2)}`, station: `R$ ${s.stationShareTotal.toFixed(2)}`, total: `R$ ${s.total.toFixed(2)}` })}</span>
                    <button type="button" className="tag ml-auto" onClick={() => toggleStmt(s.id)}>{expanded ? t("wlHideDetail") : t("wlViewDetail")}</button>
                    {s.status === "draft" && (
                      <button type="button" onClick={async () => { const res = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify({ action: "confirmRevShareStatement", statementId: s.id }) }); if (res.ok) { setMessage({ tone: "ok", text: t("wlStmtConfirmed") }); void loadRevShare(); } }} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">{t("wlConfirmStmt")}</button>
                    )}
                    {(s.status === "draft" || s.status === "confirmed") && (
                      <button
                        type="button"
                        onClick={async () => {
                          const note = await dialog.prompt(t("wlDisputeTitle"), { message: t("wlDisputeMsg") });
                          if (note === null || !note.trim()) return;
                          const res = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify({ action: "disputeRevShareStatement", statementId: s.id, note: note.trim() }) });
                          const payload = await res.json().catch(() => ({}));
                          if (!res.ok) { setMessage({ tone: "err", text: payload.error ?? t("wlOpFailed", { s: res.status }) }); return; }
                          setMessage({ tone: "ok", text: t("wlDisputeSent") });
                          void loadRevShare();
                        }}
                        className="h-8 rounded-[8px] border border-[var(--danger)]/40 px-3 text-xs font-black text-[var(--danger-ink)]"
                      >{t("wlDisputeBtn")}</button>
                    )}
                  </div>
                  {s.status === "disputed" && s.disputeNote && <div className="mt-1 text-xs font-bold text-[var(--warning-ink)]">{t("wlDisputeNote", { x: s.disputeNote })}</div>}
                  {expanded && (
                    <div className="mt-2 border-t border-[var(--line)] pt-2">
                      {details.length === 0 ? (
                        <div className="py-2 text-center text-xs font-bold text-[var(--muted)]">{t("wlDetailEmpty")}</div>
                      ) : (
                        <>
                          <div className="max-h-64 overflow-auto pr-1">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                                  <th className="pb-1.5">{t("wlColOrderId")}</th>
                                  <th className="pb-1.5">{t("wlColProduct")}</th>
                                  <th className="pb-1.5">{t("wlColPickupStore")}</th>
                                  <th className="pb-1.5 text-right">{t("wlColFrNet")}</th>
                                  <th className="pb-1.5 text-right">{t("wlColStShare")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {details.map((e) => (
                                  <tr key={e.id} className="border-t border-[var(--line)]">
                                    <td className="py-1.5 font-bold">{e.orderId}</td>
                                    <td className="py-1.5">{e.productName}</td>
                                    <td className="py-1.5">{e.pickupStoreName}</td>
                                    <td className="py-1.5 text-right font-black">{money(e.franchiseNetBRL)}</td>
                                    <td className="py-1.5 text-right">{money(e.stationShareBRL)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-2 flex justify-end">
                            <button type="button" className="tag" onClick={() => exportRevDetailCsv(s)}>CSV</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {revStatements.length === 0 && <div className="py-2 text-center text-xs font-bold text-[var(--muted)]">{t("wlNoRevStmt")}</div>}
          </div>
        </div>
      )}

      {/* Franchise → rider fold */}
      <div className="space-y-2">
        {(weekly?.franchises ?? []).length === 0 && <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">{t("wlNoWeekData")}</div>}
        {weekly?.franchises.map((g) => {
          const net = Math.round((g.settle - g.franchisePaid) * 100) / 100;
          const pendingAmt = Math.max(0, net);
          const overpaid = net < 0 ? -net : 0;
          const expanded = open.has(g.franchise);
          return (
            <div key={g.franchise} className="panel overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button type="button" onClick={() => toggle(g.franchise)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <ChevronRight size={16} className={`shrink-0 text-[var(--muted)] transition-transform ${expanded ? "rotate-90" : ""}`} />
                  <Building2 size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="truncate text-sm font-black">{g.franchise}</span>
                  <span className="text-[11px] font-bold text-[var(--muted)]">{t("wlRidersCount", { n: g.riders.length })}</span>
                </button>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right"><div className="text-[10px] font-black uppercase text-[var(--muted)]">{t("wlSettle")}</div><div className="font-black">{money(g.settle)}</div></div>
                  <div className="text-right"><div className="text-[10px] font-black uppercase text-[var(--muted)]" title={t("wlPaidHqFrTitle")}>{t("wlPaidHqFr")}</div><div className="font-black text-[var(--ok-ink)]">{money(g.franchisePaid)}</div></div>
                  <div className="text-right"><div className="text-[10px] font-black uppercase text-[var(--muted)]">{overpaid > 0 ? t("wlOverpaid") : t("wlPending")}</div><div className={`font-black ${overpaid > 0 ? "text-[var(--danger-ink)]" : pendingAmt > 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>{overpaid > 0 ? `+${money(overpaid)}` : money(pendingAmt)}</div></div>
                </div>
                <div className="flex gap-1.5">
                  {!scopeFranchise && <button type="button" className="inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]" onClick={() => openPay("franchise", g.franchise, g.franchise, pendingAmt)}>{t("wlPayFranchiseBtn")}</button>}
                  <button type="button" className="tag" onClick={() => void exportCsv(g.franchise)}>CSV</button>
                  <button type="button" className="tag" onClick={() => void exportPdf(g.franchise)}>PDF</button>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                        <th className="pb-2">{t("wlColRider")}</th><th className="pb-2">{t("wlColStation")}</th><th className="pb-2 text-right">{t("wlColOrders")}</th><th className="pb-2 text-right">{t("wlColDays")}</th><th className="pb-2 text-right">{t("wlColSettle")}</th><th className="pb-2 text-right" title={t("wlPaidRiderTitle")}>{t("wlColPaidRider")}</th><th className="pb-2 text-right">{t("wlColAction")}</th>
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
                              <button type="button" className="tag" onClick={() => openPay("rider", r.name, g.franchise, ridPending)}>{t("wlMarkPaid")}</button>
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
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Banknote size={14} /> {t("wlWithdrawQueue", { n: pendingWithdrawals.length })}</div>
          <div className="space-y-2">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div>
                  <div className="text-sm font-black">{w.riderName} · {money(w.amount)}</div>
                  <div className="text-[11px] font-bold text-[var(--muted)]">PIX {w.pix} ｜ {w.station}（{w.franchise}）｜ {w.requestedAt}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void act("confirmPayment", w.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><CheckCircle2 size={13} /> {t("wlPaidBtn")}</button>
                  <button type="button" onClick={() => void act("rejectWithdrawal", w.id)} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--danger-ink)]"><XCircle size={13} /> {t("wlRejectBtn")}</button>
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
            <h2 className="text-lg font-black">{t("wlPayModalTitle", { who: pay.target === "franchise" ? t("wlWho_franchise") : t("wlWho_rider"), name: pay.refName })}</h2>
            <p className="mt-1 text-xs font-bold text-[var(--muted)]">{t("wlSuggested", { week: weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)}` : "", money: money(pay.suggested) })}</p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("wlAmount")}</span>
              <input autoFocus inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <div className="mt-3">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("wlPayType")}</span>
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
                    {payPeriod === p ? "✓ " : ""}{p === "weekly" ? t("wlWeekly") : t("wlDaily")}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] font-black uppercase text-[var(--muted)]">{t("wlNote")}</span>
              <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPay(null)} className="h-10 rounded-[8px] border border-[var(--line)] px-4 text-sm font-black text-[var(--muted-strong)]">{t("wlCancel")}</button>
              <button type="button" onClick={() => void submitPay()} className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]">{t("wlConfirmPay")}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Mall back-office finance view (商城财务). Shown on the PontoMall hub instead
// of the rider-payroll settlement above — mall scope only: GMV/收款, sales
// revenue-share statements, supplier statements, hybrid-payment & top-up
// review. No rider payroll here (that lives in the HQ/franchise portals).
// ---------------------------------------------------------------------------

type FinanceSummary = { orders: number; pointsGmv: number; cashGmv: number; gmvBRL: number; pointsToBrlRate: number; pendingPayments: number };
type SupplierStmt = { id: string; supplierName: string; month: string; total: number; status: "draft" | "confirmed" | "paid" | "disputed"; paidAt?: string; disputeNote?: string };
type RevShareStmt = { id: string; franchise: string; month: string; status: "draft" | "confirmed" | "paid" | "disputed"; total: number; orders: number; stationShareTotal: number; franchiseNetTotal: number; paidAt?: string; disputeNote?: string };
type HybridPayment = { id: string; orderId: string; riderName: string; productName: string; amountBRL: number; status: string; reference?: string; createdAt?: string };
type TopUpRow = { id: string; riderName: string; amountBRL: number; reference?: string; status: string; createdAt: string };
type OfficeFinance = { summary?: FinanceSummary; statements?: SupplierStmt[]; revShareStatements?: RevShareStmt[]; payments?: HybridPayment[]; topUps?: TopUpRow[] };

const stmtStatusLabel = (s: "draft" | "confirmed" | "paid" | "disputed", who: string, t: (k: TranslationKey, vars?: Record<string, string | number | undefined>) => string) =>
  ({ draft: t("dynAwaitConfirm", { who }), confirmed: t("dynPayPending"), paid: t("dynPaid"), disputed: t("wlRsDisputed") }[s]);

function MallFinanceWallet() {
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Mall Operator" }), [session]);
  const [data, setData] = useState<OfficeFinance | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    const r = await fetch("/api/mall/ops", { headers, cache: "no-store" }).catch(() => null);
    if (r && r.ok) setData(((await r.json()).data ?? {}) as OfficeFinance);
  }, [headers]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    const r = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify(body) }).catch(() => null);
    const payload = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setMessage({ tone: "err", text: payload.error ?? "操作失败" }); return; }
    setMessage({ tone: "ok", text: ok });
    void load();
  }

  const sum = data?.summary;
  const supplierStmts = data?.statements ?? [];
  const revStmts = data?.revShareStatements ?? [];
  const pendingPayments = (data?.payments ?? []).filter((p) => p.status === "submitted");
  const pendingTopUps = (data?.topUps ?? []).filter((t) => t.status === "submitted");
  const supplierPayable = supplierStmts.filter((s) => s.status === "confirmed").reduce((a, b) => a + b.total, 0);
  const revPayable = revStmts.filter((s) => s.status === "confirmed").reduce((a, b) => a + b.total, 0);

  const Stat = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
    <div className="panel p-4">
      <div className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{hint}</div>
    </div>
  );

  return (
    <AppShell>
      <PageTitle
        title="结算与提现"
        eyebrow="商城财务 · 收款 / 销售分成对账 / 供应商对账 / 付款核销"
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="综合 GMV" value={money(sum?.gmvBRL ?? 0)} hint={t("dynPointsRate", { r: sum?.pointsToBrlRate ?? 10 })} />
        <Stat label="现金收款" value={money(sum?.cashGmv ?? 0)} hint="已收 PIX / 混合付款" />
        <Stat label="积分 GMV" value={`${(sum?.pointsGmv ?? 0).toLocaleString()} pts`} hint={t("dynRedeemCount", { n: sum?.orders ?? 0 })} />
        <Stat label="待付合计" value={money(supplierPayable + revPayable)} hint={t("dynSupplierShare", { a: money(supplierPayable), b: money(revPayable) })} />
      </div>

      {/* Month picker (shared by both generate actions) */}
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs font-black uppercase text-[var(--muted)]">对账月份</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
        <span className="ml-auto text-[11px] font-bold text-[var(--muted)]">对账单按月生成；加盟商 / 供应商在各自后台确认后,这里标记付款。</span>
      </div>

      {/* Sales revenue-share statements (加盟商) */}
      <div className="panel mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Store size={14} className="text-[var(--accent)]" />
          <span className="text-xs font-black uppercase text-[var(--muted)]">销售分成 · 月度对账（加盟商 / 站点)</span>
          <button type="button" onClick={() => void post({ action: "generateRevShareStatement", month }, t("dynShareStatementGen", { m: month }))} className="ml-auto h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-black text-[var(--accent-ink)]">生成分成对账单</button>
        </div>
        <div className="space-y-2">
          {revStmts.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
              <span className="font-black">{s.franchise}</span>
              <span className="text-[11px] font-bold text-[var(--muted)]">{s.month}</span>
              <Badge value={stmtStatusLabel(s.status, t("dynWhoFranchise"), t)} />
              <span className="text-xs font-bold text-[var(--muted)]">{s.orders} 单 · 净 {money(s.franchiseNetTotal)} · 站点 {money(s.stationShareTotal)} · 合计 <b>{money(s.total)}</b></span>
              {s.status === "confirmed" && (
                <button type="button" onClick={() => void post({ action: "payRevShareStatement", statementId: s.id }, "已标记付款")} className="ml-auto h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">标记已付款</button>
              )}
              {s.status === "paid" && <span className="ml-auto text-[11px] font-bold text-[var(--ok-ink)]">已付 {s.paidAt ?? ""}</span>}
              {s.status === "disputed" && s.disputeNote && <span className="ml-auto text-[11px] font-bold text-[var(--warning-ink)]">异议：{s.disputeNote} · 在商城后台「供应链」处理</span>}
            </div>
          ))}
          {revStmts.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无分成对账单。选择月份后点「生成分成对账单」:按「已取货订单 × 产品加盟商分成」自动汇总。</div>}
        </div>
      </div>

      {/* Supplier monthly statements */}
      <div className="panel mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Building2 size={14} className="text-[var(--accent)]" />
          <span className="text-xs font-black uppercase text-[var(--muted)]">供应商 · 月度对账</span>
          <button type="button" onClick={() => void post({ action: "generateStatement", month }, t("dynSupplierStatementGen", { m: month }))} className="ml-auto h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-black text-[var(--accent-ink)]">生成对账单</button>
        </div>
        <div className="space-y-2">
          {supplierStmts.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
              <span className="font-black">{s.supplierName}</span>
              <span className="text-[11px] font-bold text-[var(--muted)]">{s.month}</span>
              <Badge value={stmtStatusLabel(s.status, t("dynWhoSupplier"), t)} />
              <span className="text-xs font-bold text-[var(--muted)]">应付 <b>{money(s.total)}</b></span>
              {s.status === "confirmed" && (
                <button type="button" onClick={() => void post({ action: "payStatement", statementId: s.id }, "已标记付款")} className="ml-auto h-8 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black text-[var(--accent-ink)]">标记已付款</button>
              )}
              {s.status === "paid" && <span className="ml-auto text-[11px] font-bold text-[var(--ok-ink)]">已付 {s.paidAt ?? ""}</span>}
              {s.status === "disputed" && s.disputeNote && <span className="ml-auto text-[11px] font-bold text-[var(--warning-ink)]">异议：{s.disputeNote} · 在商城后台「供应链」处理</span>}
            </div>
          ))}
          {supplierStmts.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无供应商对账单。按「履约订单 × 供货价」自动汇总每个供应商。</div>}
        </div>
      </div>

      {/* Hybrid-payment review queue */}
      {pendingPayments.length > 0 && (
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Banknote size={14} /> 混合付款待核销（{pendingPayments.length}）</div>
          <div className="space-y-2">
            {pendingPayments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div>
                  <div className="text-sm font-black">{p.riderName} · {p.productName} · {money(p.amountBRL)}</div>
                  <div className="text-[11px] font-bold text-[var(--muted)]">凭证 {p.reference ?? "—"} ｜ {p.createdAt ?? ""}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void post({ action: "confirmPayment", paymentId: p.id }, "已核销该付款")} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 确认</button>
                  <button type="button" onClick={() => void post({ action: "rejectPayment", paymentId: p.id }, "已驳回该付款")} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--danger-ink)]"><XCircle size={13} /> 驳回</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash top-up review queue */}
      {pendingTopUps.length > 0 && (
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Wallet size={14} /> 余额充值待核销（{pendingTopUps.length}）</div>
          <div className="space-y-2">
            {pendingTopUps.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div>
                  <div className="text-sm font-black">{t.riderName} · {money(t.amountBRL)}</div>
                  <div className="text-[11px] font-bold text-[var(--muted)]">凭证 {t.reference ?? "—"} ｜ {t.createdAt}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void post({ action: "confirmTopUp", topUpId: t.id }, "已确认到账,余额已入账")} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 text-xs font-black uppercase text-[var(--accent-ink)]"><CheckCircle2 size={13} /> 确认到账</button>
                  <button type="button" onClick={() => void post({ action: "rejectTopUp", topUpId: t.id }, "已驳回")} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--danger-ink)]"><XCircle size={13} /> 驳回</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function WalletPage() {
  const session = useMemo(() => readSession(), []);
  const isMallOffice = !!session && session.portal === "pontomall" && mallHubPortals.includes(session.portal);
  return isMallOffice ? <MallFinanceWallet /> : <RiderPayrollWallet />;
}
