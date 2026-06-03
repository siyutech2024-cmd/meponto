"use client";

import { useMemo, useState } from "react";
import { AppShell, Badge, DataTable, Field, GuardedButton, PageTitle } from "../components/ui";
import { useVentoStore } from "../lib/store";

export default function FinancePage() {
  const ledgerEntries = useVentoStore((state) => state.ledgerEntries);
  const updateLedgerStatus = useVentoStore((state) => state.updateLedgerStatus);
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [typeFilter, setTypeFilter] = useState("All Types");

  const visibleLedger = useMemo(
    () =>
      ledgerEntries.filter((entry) => {
        const matchesStatus = statusFilter === "All Status" || entry.status === statusFilter;
        const matchesType = typeFilter === "All Types" || entry.ledgerType === typeFilter;
        return matchesStatus && matchesType;
      }),
    [ledgerEntries, statusFilter, typeFilter],
  );

  const pendingTotal = ledgerEntries.filter((entry) => entry.status === "Pending").reduce((sum, entry) => sum + entry.amount, 0);
  const approvedTotal = ledgerEntries.filter((entry) => entry.status === "Approved").reduce((sum, entry) => sum + entry.amount, 0);
  const paidTotal = ledgerEntries.filter((entry) => entry.status === "Paid").reduce((sum, entry) => sum + entry.amount, 0);
  const rejectedTotal = ledgerEntries.filter((entry) => entry.status === "Rejected").reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <AppShell>
      <PageTitle title="Financial Ledger" eyebrow="PIX, rewards, subsidy control" />
      <section className="grid gap-3 md:grid-cols-5">
        <Field label="Pending" value={`R$ ${pendingTotal}`} />
        <Field label="Approved" value={`R$ ${approvedTotal}`} />
        <Field label="Paid" value={`R$ ${paidTotal}`} />
        <Field label="Rejected" value={`R$ ${rejectedTotal}`} />
        <div className="panel industrial-shadow p-3.5 relative overflow-hidden group border-[var(--accent)]/30 bg-[var(--accent)]/5">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[var(--accent)] to-[var(--cyan)] opacity-100 transition-all duration-300" />
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">测算模型</div>
          <div className="mt-1 font-bold text-sm text-[var(--text)]">站点周财务核算</div>
          <a href="/finance/model" className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-xs font-bold text-[var(--accent-ink)] shadow-lg shadow-[var(--accent-glow)] transition-all hover:brightness-110">
            打开模型
          </a>
        </div>
      </section>
      <div className="panel my-4 grid gap-3 p-3 md:grid-cols-[180px_220px_1fr]">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          <option>All Status</option>
          <option>Pending</option>
          <option>Approved</option>
          <option>Paid</option>
          <option>Rejected</option>
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          <option>All Types</option>
          <option>Reward</option>
          <option>Leader Commission</option>
          <option>PIX</option>
          <option>Subsidy</option>
        </select>
        <div className="flex items-center text-sm font-bold text-[var(--muted)]">{visibleLedger.length} ledger records</div>
      </div>
      <DataTable
        headers={["Created At", "Recipient", "Recipient Type", "Ledger Type", "Amount", "Status", "Notes", "Actions"]}
        rows={visibleLedger.map((entry) => [
          entry.createdAt,
          entry.recipient,
          entry.recipientType,
          entry.ledgerType,
          `R$ ${entry.amount}`,
          <Badge key="status" value={entry.status} />,
          entry.notes,
          <div key="actions" className="flex flex-wrap gap-2">
            <GuardedButton permission="view_finance" onClick={() => updateLedgerStatus(entry.id, "Approved")}>Approve</GuardedButton>
            <GuardedButton permission="view_finance" onClick={() => updateLedgerStatus(entry.id, "Paid")}>Paid</GuardedButton>
            <GuardedButton permission="view_finance" onClick={() => updateLedgerStatus(entry.id, "Rejected")}>Reject</GuardedButton>
          </div>,
        ])}
      />
    </AppShell>
  );
}
