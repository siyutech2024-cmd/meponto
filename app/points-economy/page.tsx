"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import type {
  AcquisitionPointRule,
  PendingReleaseRule,
  PointsLedgerEntry,
  PointsRuleSetVersion,
  PointsRuleSummary,
  RedemptionLimitRule,
  RiderPerformancePointRule,
} from "../lib/points";

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
    ruleSetVersions: PointsRuleSetVersion[];
    riderPerformanceRules: RiderPerformancePointRule[];
    acquisitionRules: AcquisitionPointRule[];
    pendingReleaseRules: PendingReleaseRule[];
    redemptionLimitRules: RedemptionLimitRule[];
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

      <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Rule Set Versions</h2>
              <p className="mt-1 text-sm text-[#8b8ba3]">Rule changes are versioned so old ledger records never get recalculated.</p>
            </div>
            <Badge value={(payload?.ruleSetVersions ?? []).find((rule) => rule.status === "active")?.id ?? "No active version" } />
          </div>
          <div className="mt-4 overflow-x-auto">
            <DataTable
              headers={["Version", "Status", "Effective", "Owner", "Approval"]}
              rows={(payload?.ruleSetVersions ?? []).map((rule) => [
                rule.id,
                <Badge key="status" value={rule.status} />,
                rule.effectiveTo ? `${rule.effectiveFrom} - ${rule.effectiveTo}` : rule.effectiveFrom,
                rule.owner,
                rule.approval,
              ])}
            />
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black">Pending Release Rules</h2>
          <p className="mt-1 text-sm text-[#8b8ba3]">Pending points release automatically only when the rule allows it and no risk trigger appears.</p>
          <div className="mt-4 overflow-x-auto">
            <DataTable
              headers={["Flow", "Pending", "Auto", "Review at", "Reviewer", "Reject trigger"]}
              rows={(payload?.pendingReleaseRules ?? []).map((rule) => [
                rule.label,
                `${rule.defaultPendingDays}d`,
                rule.autoRelease ? "Yes" : "Manual",
                `${rule.reviewThresholdPoints} pts`,
                rule.reviewerScope,
                rule.rejectTriggers,
              ])}
            />
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Acquisition Points Config</h2>
              <p className="mt-1 text-sm text-[#8b8ba3]">Registration welcome points and referral rewards are configurable with pending release controls.</p>
            </div>
            <Badge value="Welcome 20 pts" />
          </div>
          <div className="mt-4 overflow-x-auto">
            <DataTable
              headers={["Rule", "Audience", "Points", "Trigger", "Pending", "Monthly cap"]}
              rows={(payload?.acquisitionRules ?? []).map((rule) => [
                rule.label,
                rule.audience,
                rule.points,
                rule.trigger,
                `${rule.pendingDays}d`,
                rule.monthlyCap,
              ])}
            />
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black">Acquisition Guardrails</h2>
          <p className="mt-1 text-sm text-[#8b8ba3]">Registration rewards stay low-value and pending to prevent fake-account farming.</p>
          <div className="mt-4 grid gap-2">
            {(payload?.acquisitionRules ?? []).map((rule) => (
              <div key={rule.key} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <div className="text-sm font-black text-white">{rule.label}</div>
                <div className="mt-1 text-xs font-bold leading-5 text-[#8b8ba3]">{rule.riskGuard}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">PontoMall Redemption Limits</h2>
              <p className="mt-1 text-sm text-[#8b8ba3]">Controls for daily, monthly, new-account, high-value, and product-level redemption.</p>
            </div>
            <Badge value="Redemption guarded" />
          </div>
          <div className="mt-4 overflow-x-auto">
            <DataTable
              headers={["Limit", "Value", "Unit", "Scope"]}
              rows={(payload?.redemptionLimitRules ?? []).map((rule) => [
                rule.label,
                rule.value.toLocaleString("pt-BR"),
                rule.unit,
                rule.scope,
              ])}
            />
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black">Redemption Guardrails</h2>
          <p className="mt-1 text-sm text-[#8b8ba3]">PontoMall limits protect inventory, account security, and points liability.</p>
          <div className="mt-4 grid gap-2">
            {(payload?.redemptionLimitRules ?? []).map((rule) => (
              <div key={rule.key} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <div className="text-sm font-black text-white">{rule.label}</div>
                <div className="mt-1 text-xs font-bold leading-5 text-[#8b8ba3]">{rule.riskGuard}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Rider Earning Rule Config</h2>
              <p className="mt-1 text-sm text-[#8b8ba3]">Configurable v1 parameters for orders, TSH, AR, and CAA order incentives.</p>
            </div>
            <Badge value="Version v1 beta" />
          </div>
          <div className="mt-4 overflow-x-auto">
            <DataTable
              headers={["Metric", "Unit", "Pts/unit", "Daily cap", "Eligibility", "Pending", "Tier weight"]}
              rows={(payload?.riderPerformanceRules ?? []).map((rule) => [
                rule.label,
                rule.unit,
                rule.pointsPerUnit,
                `${rule.dailyCap} pts`,
                rule.key === "ar" ? `${rule.minimumEligibleValue}%+` : `${rule.minimumEligibleValue}+ ${rule.unit}`,
                `${rule.pendingDays}d`,
                `${Math.round(rule.weight * 100)}%`,
              ])}
            />
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black">Rule Guardrails</h2>
          <p className="mt-1 text-sm text-[#8b8ba3]">These limits keep configurable points from becoming uncontrolled incentives.</p>
          <div className="mt-4 grid gap-2">
            {(payload?.riderPerformanceRules ?? []).map((rule) => (
              <div key={rule.key} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <div className="text-sm font-black text-white">{rule.label}</div>
                <div className="mt-1 text-xs font-bold leading-5 text-[#8b8ba3]">{rule.riskGuard}</div>
              </div>
            ))}
          </div>
        </div>
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
          <p className="mt-1 text-sm text-[#8b8ba3]">All PontoSys rider, partner, PontoMall, and analytics modules follow the same points standard.</p>
          <div className="mt-4 grid gap-3">
            <Field label="Value reference" value={`R$1 = ${payload?.rules.pointsPerBrlReference ?? 0} pts`} />
            <Field label="Minimum discount tier" value={`${payload?.rules.minimumDiscountTier ?? 0} estrelas`} />
            <Field label="Rider service cap" value={`${payload?.rules.riderSameServiceDailyCap ?? 0}/day`} />
            <Field label="Partner pending" value={`${payload?.rules.partnerPointsPendingDays ?? 0} days`} />
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
