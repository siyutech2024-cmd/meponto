"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import type { PointsLedgerEntry, PointsRuleSummary } from "../lib/points";

type PointsAccount = {
  riderId: string;
  accountId: string;
  available: number;
  pending: number;
};

type PartnerPointsAccount = {
  partnerId: string;
  accountId: string;
  available: number;
};

type PointsPayload = {
  data: {
    accounts: PointsAccount[];
    partnerAccounts: PartnerPointsAccount[];
    ledger: PointsLedgerEntry[];
    partnerLedger: Array<{ id: string; partnerId: string; type: string; points: number; status: string; sourceType: string; reasonCode: string; balanceAfter: number; createdAt: string }>;
    rules: PointsRuleSummary;
    standard: string;
  };
};

export default function PointsEconomyPage() {
  const [payload, setPayload] = useState<PointsPayload["data"] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/points", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: PointsPayload) => {
        if (active) setPayload(data.data);
      });
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    const accounts = payload?.accounts ?? [];
    return {
      available: accounts.reduce((sum, account) => sum + account.available, 0),
      pending: accounts.reduce((sum, account) => sum + account.pending, 0),
      partnerAvailable: (payload?.partnerAccounts ?? []).reduce((sum, account) => sum + account.available, 0),
      accounts: accounts.length,
      ledger: (payload?.ledger.length ?? 0) + (payload?.partnerLedger.length ?? 0),
    };
  }, [payload]);

  return (
    <AppShell>
      <PageTitle title="Points Economy" eyebrow="System-wide points standard" />
      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Available Points" value={totals.available.toLocaleString("pt-BR")} />
        <Field label="Partner Points" value={totals.partnerAvailable.toLocaleString("pt-BR")} />
        <Field label="Pending Points" value={totals.pending.toLocaleString("pt-BR")} />
        <Field label="Ledger Records" value={String(totals.ledger)} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <DataTable
          headers={["Created", "Rider", "Type", "Points", "Status", "Source", "Reason", "Balance After"]}
          rows={(payload?.ledger ?? []).map((entry) => [
            entry.createdAt,
            entry.riderId,
            entry.type,
            entry.points.toLocaleString("pt-BR"),
            <Badge key="status" value={entry.status} />,
            entry.sourceType,
            entry.reasonCode,
            entry.balanceAfter.toLocaleString("pt-BR"),
          ])}
        />
        <div className="panel p-4">
          <h2 className="text-lg font-black">Global Limits</h2>
          <p className="mt-1 text-sm text-[#8b8ba3]">All rider, partner, marketplace, and analytics modules follow the same points standard.</p>
          <div className="mt-4 grid gap-3">
            <Field label="Partner transaction cap" value={`${payload?.rules.transactionPartnerCap ?? 0} pts`} />
            <Field label="Rider/partner daily cap" value={`${payload?.rules.riderPartnerDailyCap ?? 0} pts`} />
            <Field label="All partners daily cap" value={`${payload?.rules.riderAllPartnersDailyCap ?? 0} pts`} />
            <Field label="Monthly partner cap" value={`${payload?.rules.riderPartnerMonthlyCap ?? 0} pts`} />
            <Field label="Expiry" value={`${payload?.rules.expiryMonths ?? 0} months`} />
          </div>
        </div>
      </section>
      <section className="mt-4">
        <h2 className="mb-3 text-lg font-black">Partner Accounts</h2>
        <DataTable
          headers={["Partner", "Account", "Available"]}
          rows={(payload?.partnerAccounts ?? []).map((account) => [account.partnerId, account.accountId, account.available.toLocaleString("pt-BR")])}
        />
      </section>
    </AppShell>
  );
}
