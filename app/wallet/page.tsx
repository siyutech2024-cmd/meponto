"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, Building2, ChevronDown, Info, RefreshCcw, Store, Wallet } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { DataTable, Drawer, SectionCard, Stat, StatusBadge, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
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

// Shared button vocabulary (mirrors mall back-office supply.tsx): at most one
// solid accent button per view; row-level actions stay outline/ghost.
const btnPrimary = "h-9 rounded-[8px] bg-[var(--accent)] px-3.5 text-xs font-black text-[var(--accent-ink)]";
const btnOutline = "h-8 rounded-[8px] border border-[var(--accent)]/60 px-2.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10";
const btnGhost = "h-8 rounded-[8px] border border-[var(--line)] px-2.5 text-[11px] font-bold text-[var(--muted)] hover:border-[var(--accent)]";
const btnDanger = "h-8 rounded-[8px] border border-[var(--danger)]/40 px-2.5 text-[11px] font-bold text-[var(--danger)]";

// green = normal flow / done, amber = waiting on someone, red = dispute, grey = terminal.
const STMT_TONE: Record<"draft" | "confirmed" | "paid" | "disputed", BadgeTone> = {
  draft: "warn",
  confirmed: "warn",
  paid: "success",
  disputed: "danger",
};

function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-sm font-bold last:border-b-0">
      <span className="text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

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
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  // Payment modal state.
  const [pay, setPay] = useState<{ target: "franchise" | "rider"; refName: string; franchise: string; suggested: number } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payPeriod, setPayPeriod] = useState<"weekly" | "daily">("weekly");
  const [payNote, setPayNote] = useState("");
  type RevStatement = { id: string; franchise: string; month: string; status: "draft" | "confirmed" | "paid" | "disputed"; total: number; orders: number; stationShareTotal: number; franchiseNetTotal: number; disputeNote?: string };
  type RevEntry = { id: string; orderId: string; productName: string; pickupStoreName: string; franchise: string; month: string; franchiseNetBRL: number; stationShareBRL: number };
  const [revStatements, setRevStatements] = useState<RevStatement[]>([]);
  const [revEntries, setRevEntries] = useState<RevEntry[]>([]);
  const [stationShare, setStationShare] = useState("");
  // Drawers hold references, not snapshots, so a reload refreshes their content.
  const [stmtDrawerId, setStmtDrawerId] = useState("");
  const [riderRef, setRiderRef] = useState<{ franchise: string; rider99Id: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

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
    setRiderRef(null);
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

  async function confirmStmt(s: RevStatement) {
    const res = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify({ action: "confirmRevShareStatement", statementId: s.id }) });
    if (res.ok) { setMessage({ tone: "ok", text: t("wlStmtConfirmed") }); void loadRevShare(); }
  }

  async function disputeStmt(s: RevStatement) {
    const note = await dialog.prompt(t("wlDisputeTitle"), { message: t("wlDisputeMsg") });
    if (note === null || !note.trim()) return;
    const res = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify({ action: "disputeRevShareStatement", statementId: s.id, note: note.trim() }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage({ tone: "err", text: payload.error ?? t("wlOpFailed", { s: res.status }) }); return; }
    setMessage({ tone: "ok", text: t("wlDisputeSent") });
    void loadRevShare();
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
  const groups = weekly?.franchises ?? [];
  const paidTotal = groups.reduce((a, g) => a + g.franchisePaid, 0);
  const pendingTotal = groups.reduce((a, g) => a + Math.max(0, g.settle - g.franchisePaid), 0);
  const overpaidTotal = groups.reduce((a, g) => a + Math.max(0, g.franchisePaid - g.settle), 0);
  const revDraftCount = revStatements.filter((s) => s.status === "draft").length;
  const riderPending = (r: WeeklyRider) => Math.max(0, Math.round((r.settle - r.paid) * 100) / 100);

  const drawerStmt = stmtDrawerId ? revStatements.find((s) => s.id === stmtDrawerId) : undefined;
  const drawerGroup = riderRef ? groups.find((g) => g.franchise === riderRef.franchise) : undefined;
  const drawerRider = riderRef ? drawerGroup?.riders.find((r) => r.rider99Id === riderRef.rider99Id) : undefined;
  const drawerRiderPending = drawerRider ? riderPending(drawerRider) : 0;

  const stmtBadge = (status: RevStatement["status"]) => (
    <StatusBadge tone={STMT_TONE[status]} label={{ draft: t("wlRsDraft"), confirmed: t("wlRsConfirmed"), paid: t("wlRsPaid"), disputed: t("wlRsDisputed") }[status] ?? status} />
  );

  const stmtActions = (s: RevStatement) => (
    <span className="inline-flex gap-1.5">
      {s.status === "draft" && (
        <button type="button" className={btnOutline} onClick={(e) => { e.stopPropagation(); void confirmStmt(s); }}>{t("wlConfirmStmt")}</button>
      )}
      {(s.status === "draft" || s.status === "confirmed") && (
        <button type="button" className={btnDanger} onClick={(e) => { e.stopPropagation(); void disputeStmt(s); }}>{t("wlDisputeBtn")}</button>
      )}
    </span>
  );

  const stmtColumns: Array<DataColumn<RevStatement>> = [
    { key: "month", label: t("wlColMonth"), render: (s) => <span className="font-black">{s.month}</span> },
    {
      key: "status", label: t("wlColStatus"), render: (s) => (
        <span>
          {stmtBadge(s.status)}
          {s.status === "disputed" && s.disputeNote && <span className="mt-0.5 block text-[11px] font-bold text-[var(--warn)]">{t("wlDisputeNote", { x: s.disputeNote })}</span>}
        </span>
      ),
    },
    { key: "orders", label: t("wlColOrders"), align: "right", render: (s) => s.orders },
    { key: "net", label: t("wlColFrNet"), align: "right", render: (s) => money(s.franchiseNetTotal) },
    { key: "station", label: t("wlColStShare"), align: "right", render: (s) => money(s.stationShareTotal) },
    { key: "total", label: t("wlColTotal"), align: "right", render: (s) => <b>{money(s.total)}</b> },
    { key: "ops", label: t("wlColAction"), align: "right", render: (s) => stmtActions(s) },
  ];

  const riderColumns = (g: WeeklyGroup): Array<DataColumn<WeeklyRider>> => [
    { key: "name", label: t("wlColRider"), render: (r) => <span className="font-black">{r.name}</span> },
    { key: "station", label: t("wlColStation"), render: (r) => <StatusBadge tone="neutral" label={r.station} /> },
    { key: "orders", label: t("wlColOrders"), align: "right", render: (r) => r.orders },
    { key: "days", label: t("wlColDays"), align: "right", render: (r) => r.days },
    { key: "settle", label: t("wlColSettle"), align: "right", render: (r) => <b>{money(r.settle)}</b> },
    { key: "paid", label: <span title={t("wlPaidRiderTitle")}>{t("wlColPaidRider")}</span>, align: "right", render: (r) => <span className="text-[var(--success)]">{money(r.paid)}</span> },
    {
      key: "status", label: t("wlColStatus"), render: (r) => {
        const p = riderPending(r);
        return p > 0 ? <StatusBadge tone="warn" label={`${t("wlPending")} ${money(p)}`} /> : <StatusBadge tone="success" label={t("wlSettled")} />;
      },
    },
    {
      key: "ops", label: t("wlColAction"), align: "right", render: (r) => (
        <button type="button" className={btnOutline} onClick={(e) => { e.stopPropagation(); openPay("rider", r.name, g.franchise, riderPending(r)); }}>{t("wlMarkPaid")}</button>
      ),
    },
  ];

  const withdrawColumns: Array<DataColumn<RiderWithdrawal>> = [
    { key: "rider", label: t("wlColRider"), render: (w) => <span className="font-black">{w.riderName}</span> },
    { key: "amount", label: t("wlColAmount"), align: "right", render: (w) => <b>{money(w.amount)}</b> },
    { key: "pix", label: "PIX", render: (w) => <span className="text-xs text-[var(--muted)]">{w.pix}</span> },
    { key: "station", label: t("wlColStation"), render: (w) => <span className="text-xs">{w.station}（{w.franchise}）</span> },
    { key: "time", label: t("wlColTime"), render: (w) => <span className="text-xs text-[var(--muted)]">{w.requestedAt}</span> },
    {
      key: "ops", label: t("wlColAction"), align: "right", render: (w) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnOutline} onClick={() => void act("confirmPayment", w.id)}>{t("wlPaidBtn")}</button>
          <button type="button" className={btnDanger} onClick={() => void act("rejectWithdrawal", w.id)}>{t("wlRejectBtn")}</button>
        </span>
      ),
    },
  ];

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

      {/* Stat row */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("wlStatPayable")} value={weekly ? money(weekly.grandTotal) : loading ? "…" : "—"} hint={weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)} · ${t("wlNatWeek")}` : t("wlNatWeek")} />
        <Stat label={t("wlStatPaid")} value={weekly ? money(paidTotal) : "—"} hint={t("wlPaidHqFrTitle")} />
        <Stat label={t("wlPending")} value={weekly ? money(pendingTotal) : "—"} hint={overpaidTotal > 0 ? `${t("wlOverpaid")} +${money(overpaidTotal)}` : undefined} />
        {scopeFranchise
          ? <Stat label={t("wlStatRevDraft")} value={String(revDraftCount)} hint={t("wlRsDraft")} />
          : <Stat label={t("wlStatWithdraw")} value={String(pendingWithdrawals.length)} hint="PIX" />}
      </div>

      {/* Week switcher — compact toolbar; settlement-scope explainer folds away. */}
      <div className="mb-4">
        <Toolbar
          right={
            <button type="button" onClick={() => setExplainOpen((v) => !v)} className={`${btnGhost} inline-flex items-center gap-1 ${explainOpen ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`} aria-expanded={explainOpen}>
              <Info size={13} /> {t("wlExplainToggle")}
            </button>
          }
        >
          <button type="button" className={btnGhost} onClick={() => shiftWeek(-7)}>{t("wlPrevWeek")}</button>
          <span className="px-1 text-sm font-black" data-i18n-skip>{weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)}` : loading ? "…" : "—"}</span>
          <button type="button" className={btnGhost} onClick={() => shiftWeek(7)}>{t("wlNextWeek")}</button>
          <span className="text-[11px] font-bold text-[var(--muted)]">{t("wlNatWeek")}</span>
          <span className="text-sm font-black text-[var(--accent)]">{t("wlWeekTotal", { money: weekly ? money(weekly.grandTotal) : loading ? "…" : "—" })}</span>
        </Toolbar>
        {explainOpen && <div className="panel mt-2 p-3 text-xs font-bold leading-relaxed text-[var(--muted)]">{t("wlExplain")}</div>}
      </div>

      {/* Revenue-share statements (franchise scope) */}
      {scopeFranchise && (
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Store size={13} className="text-[var(--accent)]" /> {t("wlRevShare", { f: scopeFranchise })}</span>}
          className="!p-4 mb-4"
          right={
            <>
              <input value={stationShare} onChange={(e) => setStationShare(e.target.value.replace(/[^\d.]/g, ""))} placeholder={t("wlStationSharePh")} className="h-9 w-32 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]" />
              <button type="button" onClick={async () => { const res = await fetch("/api/mall/ops", { method: "POST", headers, body: JSON.stringify({ action: "setStationShare", stationShareBRL: Number(stationShare) || 0 }) }); setMessage(res.ok ? { tone: "ok", text: t("wlStationShareSet", { x: Number(stationShare) || 0 }) } : { tone: "err", text: t("wlSetFailed") }); }} className={`${btnOutline} !h-9`}>{t("wlSetStationShare")}</button>
            </>
          }
        >
          <DataTable columns={stmtColumns} rows={revStatements} rowKey={(s) => s.id} onRowClick={(s) => setStmtDrawerId(s.id)} minWidth={760} empty={t("wlNoRevStmt")} />
        </SectionCard>
      )}

      {/* Weekly settlement — one compact rider table per franchise; row → drawer. */}
      <div className="space-y-4">
        {groups.length === 0 && <div className="panel p-6 text-center text-sm font-bold text-[var(--muted)]">{loading ? "…" : t("wlNoWeekData")}</div>}
        {groups.map((g) => {
          const net = Math.round((g.settle - g.franchisePaid) * 100) / 100;
          const pendingAmt = Math.max(0, net);
          const overpaid = net < 0 ? -net : 0;
          // Collapsible: summary always visible in the header; the 50+ rider
          // detail table only renders when expanded. Single group starts open.
          const expanded = expandedGroups[g.franchise] ?? groups.length === 1;
          return (
            <SectionCard
              key={g.franchise}
              className="!p-4"
              title={
                <button
                  type="button"
                  onClick={() => setExpandedGroups((prev) => ({ ...prev, [g.franchise]: !expanded }))}
                  className="inline-flex items-center gap-1.5 text-left"
                  aria-expanded={expanded}
                >
                  <ChevronDown size={14} className={`shrink-0 text-[var(--muted)] transition-transform ${expanded ? "" : "-rotate-90"}`} />
                  <Building2 size={13} className="text-[var(--accent)]" /> {g.franchise} <span className="font-bold normal-case text-[var(--muted)]">· {t("wlRidersCount", { n: g.riders.length })}</span>
                </button>
              }
              desc={
                <span data-i18n-skip>
                  {t("wlSettle")} <b className="text-[var(--text)]">{money(g.settle)}</b>
                  {" · "}
                  <span title={t("wlPaidHqFrTitle")}>{t("wlPaidHqFr")} <b className="text-[var(--success)]">{money(g.franchisePaid)}</b></span>
                  {" · "}
                  {overpaid > 0
                    ? <>{t("wlOverpaid")} <b className="text-[var(--danger)]">+{money(overpaid)}</b></>
                    : <>{t("wlPending")} <b className={pendingAmt > 0 ? "text-[var(--warn)]" : "text-[var(--muted)]"}>{money(pendingAmt)}</b></>}
                </span>
              }
              right={
                <>
                  {!scopeFranchise && <button type="button" className={`${btnOutline} !h-9`} onClick={() => openPay("franchise", g.franchise, g.franchise, pendingAmt)}>{t("wlPayFranchiseBtn")}</button>}
                  <button type="button" className={`${btnGhost} !h-9`} onClick={() => void exportCsv(g.franchise)}>CSV</button>
                  <button type="button" className={`${btnGhost} !h-9`} onClick={() => void exportPdf(g.franchise)}>PDF</button>
                </>
              }
            >
              {expanded && (
                <DataTable columns={riderColumns(g)} rows={g.riders} rowKey={(r) => r.rider99Id} onRowClick={(r) => setRiderRef({ franchise: g.franchise, rider99Id: r.rider99Id })} minWidth={760} empty={t("wlNoWeekData")} />
              )}
            </SectionCard>
          );
        })}
      </div>

      {/* Rider PIX withdrawals queue */}
      {pendingWithdrawals.length > 0 && (
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Banknote size={13} className="text-[var(--accent)]" /> {t("wlWithdrawQueue", { n: pendingWithdrawals.length })}</span>}
          className="!p-4 mt-4"
        >
          <DataTable columns={withdrawColumns} rows={pendingWithdrawals} rowKey={(w) => w.id} minWidth={720} />
        </SectionCard>
      )}

      {/* Rider settlement drawer */}
      <Drawer
        open={Boolean(drawerRider)}
        onClose={() => setRiderRef(null)}
        width={400}
        ariaLabel={t("wlRiderDetail")}
        title={drawerRider ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerRider.name}</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">{t("wlRiderDetail")} · {riderRef?.franchise}</div>
          </div>
        ) : null}
      >
        {drawerRider && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {drawerRiderPending > 0
                ? <StatusBadge tone="warn" label={`${t("wlPending")} ${money(drawerRiderPending)}`} />
                : <StatusBadge tone="success" label={t("wlSettled")} />}
              <span className="text-xs font-bold text-[var(--muted)]" data-i18n-skip>{weekly ? `${md(weekly.week.from)} – ${md(weekly.week.to)}` : ""}</span>
            </div>
            <div className="rounded-[10px] border border-[var(--line)] px-3">
              <DetailRow label={t("wlColStation")} value={drawerRider.station} />
              <DetailRow label="99ID" value={drawerRider.rider99Id || "—"} />
              <DetailRow label={t("wlColOrders")} value={drawerRider.orders} />
              <DetailRow label={t("wlColDays")} value={drawerRider.days} />
              <DetailRow label={t("wlColSettle")} value={<b>{money(drawerRider.settle)}</b>} />
              <DetailRow label={<span title={t("wlPaidRiderTitle")}>{t("wlColPaidRider")}</span>} value={<span className="text-[var(--success)]">{money(drawerRider.paid)}</span>} />
              <DetailRow label={t("wlPending")} value={<b className={drawerRiderPending > 0 ? "text-[var(--warn)]" : ""}>{money(drawerRiderPending)}</b>} />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              <button type="button" className={btnPrimary} onClick={() => openPay("rider", drawerRider.name, riderRef?.franchise ?? "", drawerRiderPending)}>{t("wlMarkPaid")}</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Revenue-share statement detail drawer */}
      <Drawer
        open={Boolean(drawerStmt)}
        onClose={() => setStmtDrawerId("")}
        width={480}
        ariaLabel={t("wlStmtDetail")}
        title={drawerStmt ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{drawerStmt.month} · {t("wlStmtDetail")}</div>
            <div className="text-[11px] font-bold text-[var(--muted)]">{drawerStmt.franchise}</div>
          </div>
        ) : null}
      >
        {drawerStmt && (
          <div className="space-y-5">
            <div className="rounded-[10px] border border-[var(--line)] px-3">
              <DetailRow label={t("wlColStatus")} value={stmtBadge(drawerStmt.status)} />
              <DetailRow label={t("wlColOrders")} value={drawerStmt.orders} />
              <DetailRow label={t("wlColFrNet")} value={money(drawerStmt.franchiseNetTotal)} />
              <DetailRow label={t("wlColStShare")} value={money(drawerStmt.stationShareTotal)} />
              <DetailRow label={t("wlColTotal")} value={<b>{money(drawerStmt.total)}</b>} />
            </div>
            {drawerStmt.status === "disputed" && drawerStmt.disputeNote && (
              <div className="rounded-[10px] border border-[var(--warn)]/50 bg-[var(--warn-bg)] px-3 py-2 text-xs font-bold text-[var(--warn)]">{t("wlDisputeNote", { x: drawerStmt.disputeNote })}</div>
            )}
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[11px] font-black uppercase text-[var(--muted)]">{t("wlDetailLines", { n: entriesOf(drawerStmt).length })}</span>
                <button type="button" className={`ml-auto ${btnGhost}`} onClick={() => exportRevDetailCsv(drawerStmt)}>CSV</button>
              </div>
              <div className="max-h-72 overflow-auto rounded-[10px] border border-[var(--line)]">
                {entriesOf(drawerStmt).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-xs font-bold last:border-b-0">
                    <span className="text-[var(--muted)]">{e.orderId}</span>
                    <span className="min-w-0 flex-1 truncate">{e.productName}</span>
                    <span className="truncate text-[var(--muted)]">{e.pickupStoreName}</span>
                    <span className="w-16 shrink-0 text-right font-black">{money(e.franchiseNetBRL)}</span>
                    <span className="w-14 shrink-0 text-right text-[var(--muted)]">{money(e.stationShareBRL)}</span>
                  </div>
                ))}
                {entriesOf(drawerStmt).length === 0 && <div className="px-3 py-4 text-center text-xs font-bold text-[var(--muted)]">{t("wlDetailEmpty")}</div>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {drawerStmt.status === "draft" && (
                <button type="button" className={btnPrimary} onClick={() => void confirmStmt(drawerStmt)}>{t("wlConfirmStmt")}</button>
              )}
              {(drawerStmt.status === "draft" || drawerStmt.status === "confirmed") && (
                <button type="button" className={btnDanger} onClick={() => void disputeStmt(drawerStmt)}>{t("wlDisputeBtn")}</button>
              )}
            </div>
          </div>
        )}
      </Drawer>

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
// Copy is hardcoded Chinese by design (internal HQ workspace, same as kit).
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
  const pendingTopUps = (data?.topUps ?? []).filter((row) => row.status === "submitted");
  const supplierPayable = supplierStmts.filter((s) => s.status === "confirmed").reduce((a, b) => a + b.total, 0);
  const revPayable = revStmts.filter((s) => s.status === "confirmed").reduce((a, b) => a + b.total, 0);

  const hqStmtBadge = (status: "draft" | "confirmed" | "paid" | "disputed", who: string) => (
    <StatusBadge tone={STMT_TONE[status]} label={stmtStatusLabel(status, who, t)} />
  );

  const revColumns: Array<DataColumn<RevShareStmt>> = [
    { key: "franchise", label: "加盟商", render: (s) => <span className="font-black">{s.franchise}</span> },
    { key: "month", label: "月份", render: (s) => s.month },
    {
      key: "status", label: "状态", render: (s) => (
        <span>
          {hqStmtBadge(s.status, t("dynWhoFranchise"))}
          {s.status === "disputed" && s.disputeNote && <span className="mt-0.5 block text-[11px] font-bold text-[var(--warn)]">异议：{s.disputeNote} · 在商城后台「供应链」处理</span>}
        </span>
      ),
    },
    { key: "orders", label: "单数", align: "right", render: (s) => s.orders },
    { key: "net", label: "加盟商净", align: "right", render: (s) => money(s.franchiseNetTotal) },
    { key: "station", label: "站点分成", align: "right", render: (s) => money(s.stationShareTotal) },
    { key: "total", label: "合计", align: "right", render: (s) => <b>{money(s.total)}</b> },
    {
      key: "ops", label: "操作", align: "right", render: (s) => (
        s.status === "confirmed"
          ? <button type="button" className={btnOutline} onClick={() => void post({ action: "payRevShareStatement", statementId: s.id }, "已标记付款")}>标记已付款</button>
          : s.status === "paid"
            ? <span className="text-[11px] font-bold text-[var(--success)]">已付 {s.paidAt ?? ""}</span>
            : <span className="text-[11px] font-bold text-[var(--muted)]">—</span>
      ),
    },
  ];

  const supplierColumns: Array<DataColumn<SupplierStmt>> = [
    { key: "supplier", label: "供应商", render: (s) => <span className="font-black">{s.supplierName}</span> },
    { key: "month", label: "月份", render: (s) => s.month },
    {
      key: "status", label: "状态", render: (s) => (
        <span>
          {hqStmtBadge(s.status, t("dynWhoSupplier"))}
          {s.status === "disputed" && s.disputeNote && <span className="mt-0.5 block text-[11px] font-bold text-[var(--warn)]">异议：{s.disputeNote} · 在商城后台「供应链」处理</span>}
        </span>
      ),
    },
    { key: "total", label: "应付", align: "right", render: (s) => <b>{money(s.total)}</b> },
    {
      key: "ops", label: "操作", align: "right", render: (s) => (
        s.status === "confirmed"
          ? <button type="button" className={btnOutline} onClick={() => void post({ action: "payStatement", statementId: s.id }, "已标记付款")}>标记已付款</button>
          : s.status === "paid"
            ? <span className="text-[11px] font-bold text-[var(--success)]">已付 {s.paidAt ?? ""}</span>
            : <span className="text-[11px] font-bold text-[var(--muted)]">—</span>
      ),
    },
  ];

  const paymentColumns: Array<DataColumn<HybridPayment>> = [
    { key: "rider", label: "骑手", render: (p) => <span className="font-black">{p.riderName}</span> },
    { key: "product", label: "商品", render: (p) => p.productName },
    { key: "amount", label: "金额", align: "right", render: (p) => <b>{money(p.amountBRL)}</b> },
    { key: "ref", label: "凭证", render: (p) => <span className="text-xs text-[var(--muted)]">{p.reference ?? "—"}</span> },
    { key: "time", label: "时间", render: (p) => <span className="text-xs text-[var(--muted)]">{p.createdAt ?? ""}</span> },
    {
      key: "ops", label: "操作", align: "right", render: (p) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnOutline} onClick={() => void post({ action: "confirmPayment", paymentId: p.id }, "已核销该付款")}>确认</button>
          <button type="button" className={btnDanger} onClick={() => void post({ action: "rejectPayment", paymentId: p.id }, "已驳回该付款")}>驳回</button>
        </span>
      ),
    },
  ];

  const topUpColumns: Array<DataColumn<TopUpRow>> = [
    { key: "rider", label: "骑手", render: (row) => <span className="font-black">{row.riderName}</span> },
    { key: "amount", label: "金额", align: "right", render: (row) => <b>{money(row.amountBRL)}</b> },
    { key: "ref", label: "凭证", render: (row) => <span className="text-xs text-[var(--muted)]">{row.reference ?? "—"}</span> },
    { key: "time", label: "时间", render: (row) => <span className="text-xs text-[var(--muted)]">{row.createdAt}</span> },
    {
      key: "ops", label: "操作", align: "right", render: (row) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnOutline} onClick={() => void post({ action: "confirmTopUp", topUpId: row.id }, "已确认到账,余额已入账")}>确认到账</button>
          <button type="button" className={btnDanger} onClick={() => void post({ action: "rejectTopUp", topUpId: row.id }, "已驳回")}>驳回</button>
        </span>
      ),
    },
  ];

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
      <div className="mb-4">
        <Toolbar right={<span className="text-[11px] font-bold text-[var(--muted)]">对账单按月生成；加盟商 / 供应商在各自后台确认后,这里标记付款。</span>}>
          <span className="text-xs font-black uppercase text-[var(--muted)]">对账月份</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none" />
        </Toolbar>
      </div>

      {/* Sales revenue-share statements (加盟商) */}
      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Store size={13} className="text-[var(--accent)]" /> 销售分成 · 月度对账（加盟商 / 站点）</span>}
        className="!p-4 mb-4"
        right={<button type="button" onClick={() => void post({ action: "generateRevShareStatement", month }, t("dynShareStatementGen", { m: month }))} className={btnPrimary}>生成分成对账单</button>}
      >
        <DataTable columns={revColumns} rows={revStmts} rowKey={(s) => s.id} minWidth={860} empty="暂无分成对账单。选择月份后点「生成分成对账单」:按「已取货订单 × 产品加盟商分成」自动汇总。" />
      </SectionCard>

      {/* Supplier monthly statements */}
      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Building2 size={13} className="text-[var(--accent)]" /> 供应商 · 月度对账</span>}
        className="!p-4 mb-4"
        right={<button type="button" onClick={() => void post({ action: "generateStatement", month }, t("dynSupplierStatementGen", { m: month }))} className={`${btnOutline} !h-9`}>生成对账单</button>}
      >
        <DataTable columns={supplierColumns} rows={supplierStmts} rowKey={(s) => s.id} minWidth={720} empty="暂无供应商对账单。按「履约订单 × 供货价」自动汇总每个供应商。" />
      </SectionCard>

      {/* Hybrid-payment review queue */}
      {pendingPayments.length > 0 && (
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Banknote size={13} className="text-[var(--accent)]" /> 混合付款待核销（{pendingPayments.length}）</span>}
          className="!p-4 mb-4"
        >
          <DataTable columns={paymentColumns} rows={pendingPayments} rowKey={(p) => p.id} minWidth={760} />
        </SectionCard>
      )}

      {/* Cash top-up review queue */}
      {pendingTopUps.length > 0 && (
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Wallet size={13} className="text-[var(--accent)]" /> 余额充值待核销（{pendingTopUps.length}）</span>}
          className="!p-4 mb-4"
        >
          <DataTable columns={topUpColumns} rows={pendingTopUps} rowKey={(row) => row.id} minWidth={680} />
        </SectionCard>
      )}
    </AppShell>
  );
}

export default function WalletPage() {
  const session = useMemo(() => readSession(), []);
  const isMallOffice = !!session && session.portal === "pontomall" && mallHubPortals.includes(session.portal);
  return isMallOffice ? <MallFinanceWallet /> : <RiderPayrollWallet />;
}
