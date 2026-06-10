"use client";

import { AlertTriangle, CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, ShieldQuestion } from "lucide-react";
import { AppShell, Badge, DataTable, PageTitle } from "../components/ui";
import { getSecurityPosture, type ReadinessItem, type SecurityStatus } from "../lib/security";

const posture = getSecurityPosture();

function StatusIcon({ status }: { status: SecurityStatus }) {
  if (status === "Ready") {
    return <CheckCircle2 className="text-[#06d6a0]" size={18} />;
  }

  if (status === "Monitor") {
    return <ShieldQuestion className="text-[#fb923c]" size={18} />;
  }

  return <AlertTriangle className="text-[#f43f5e]" size={18} />;
}

function ReadinessPanel({ title, icon, items }: { title: string; icon: React.ReactNode; items: ReadinessItem[] }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-black">{title}</h2>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black">{item.title}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">{item.detail}</div>
              </div>
              <StatusIcon status={item.status} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs uppercase text-[var(--muted)]">
              <span>{item.owner}</span>
              <Badge value={item.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SecurityPage() {
  return (
    <AppShell>
      <PageTitle title="Security Posture" eyebrow="Authentication and access readiness" />

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="panel industrial-shadow p-4 xl:col-span-2">
          <div className="text-sm font-bold uppercase text-[var(--muted)]">Posture Score</div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="text-5xl font-black">{posture.postureScore}</div>
            <Badge value={posture.postureScore >= 85 ? "Ready" : "Monitor"} />
          </div>
          <div className="mt-4 text-sm text-[var(--muted)]">
            Demo posture combines login limits, elevated RBAC checks, token readiness, CPF protection, and open risk events.
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-sm font-bold uppercase text-[var(--muted)]">Login Limits</div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Badge value={posture.summary.loginLimitStatus} />
            <LockKeyhole className="text-[var(--accent)]" size={28} />
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-sm font-bold uppercase text-[var(--muted)]">Token / JWT</div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Badge value={posture.summary.tokenJwtReadiness} />
            <KeyRound className="text-[var(--accent)]" size={28} />
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-sm font-bold uppercase text-[var(--muted)]">High Risk Events</div>
          <div className="mt-3 text-5xl font-black">{posture.summary.highRiskEvents}</div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-3">
        <ReadinessPanel title="Token / JWT Readiness" icon={<KeyRound className="text-[var(--accent)]" size={20} />} items={posture.readiness.tokenJwt} />
        <ReadinessPanel title="Login Limit Status" icon={<LockKeyhole className="text-[var(--accent)]" size={20} />} items={posture.readiness.loginLimits} />
        <ReadinessPanel title="CPF Encryption Readiness" icon={<ShieldCheck className="text-[var(--accent)]" size={20} />} items={posture.readiness.cpfEncryption} />
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">Login audit</div>
          <DataTable
            headers={["Created At", "Actor", "Role", "Method", "Location", "Outcome", "Risk"]}
            rows={posture.loginAudit.map((entry) => [
              entry.createdAt,
              entry.actor,
              entry.role,
              entry.method,
              entry.location,
              <Badge key="outcome" value={entry.outcome} />,
              <Badge key="risk" value={entry.risk} />,
            ])}
          />
        </div>

        <section className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">Risk events</div>
          <div className="space-y-3">
            {posture.riskEvents.map((riskItem) => (
              <div key={riskItem.id} className="rounded border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{riskItem.title}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">{riskItem.detail}</div>
                  </div>
                  <Badge value={riskItem.risk} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs uppercase text-[var(--muted)]">
                  <span>{riskItem.createdAt}</span>
                  <span>{riskItem.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section>
        <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">RBAC risk checks</div>
        <DataTable
          headers={["Role", "Permission", "Status", "Risk", "Detail"]}
          rows={posture.rbacRiskChecks.map((check) => [
            check.role,
            check.title,
            <Badge key="status" value={check.status} />,
            <Badge key="risk" value={check.risk} />,
            check.detail,
          ])}
        />
      </section>
    </AppShell>
  );
}
