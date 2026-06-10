"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, KeyRound } from "lucide-react";
import { AppShell, Badge, PageTitle } from "./ui";
import { can } from "../lib/rbac";
import { portalConfigs, testAccounts, type PortalId } from "../lib/portals";
import { useVentoStore } from "../lib/store";

export function PortalHome({ portalId }: { portalId: PortalId }) {
  const currentRole = useVentoStore((state) => state.currentRole);
  const portal = portalConfigs[portalId];
  const account = testAccounts.find((item) => item.portal === portalId);
  const visibleModules = portal.modules.filter((module) => !module.permission || can(currentRole, module.permission));

  return (
    <AppShell>
      <PageTitle
        title={portal.title}
        eyebrow={`${portal.productName} / ${portal.futureDomain}`}
        action={<Link href="/login" className="tag">Switch account</Link>}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="panel p-5">
            <div className="max-w-3xl">
              <Badge value={portal.loginHint} />
              <p className="mt-4 text-lg font-bold leading-8 text-[var(--text-soft)]">{portal.description}</p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">Vercel path</div>
                <div className="mt-2 font-black">{portal.vercelPath}</div>
              </div>
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">Future domain</div>
                <div className="mt-2 font-black">{portal.futureDomain}</div>
              </div>
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="text-[10px] font-black uppercase text-[var(--muted)]">Active role</div>
                <div className="mt-2 font-black">{currentRole}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-black">{module.label}</h2>
                  <ArrowRight size={18} className="mt-1 shrink-0 text-[var(--muted)] group-hover:text-[var(--accent)]" />
                </div>
                <p className="mt-3 text-sm font-bold leading-6 text-[var(--muted-strong)]">{module.description}</p>
                {module.permission ? (
                  <div className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                    Permission: {module.permission}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
              <KeyRound size={16} />
              Test account
            </div>
            {account ? (
              <div className="space-y-3 text-sm">
                <AccountLine label="Name" value={account.name} />
                <AccountLine label="Email" value={account.identifier} />
                <AccountLine label="Phone" value={account.phone} />
                <AccountLine label="Password" value={account.password} />
                <AccountLine label="Role" value={account.role} />
                <AccountLine label="Org" value={account.organization} />
              </div>
            ) : null}
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
              <ExternalLink size={16} />
              Domain mapping
            </div>
            <div className="space-y-2 text-sm font-bold text-[var(--muted-strong)]">
              <p>当前 Vercel 先使用 path 访问：{portal.vercelPath}</p>
              <p>下一步接入 meponto.com 后，将该模块映射到：{portal.futureDomain}</p>
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function AccountLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
      <span className="text-[10px] font-black uppercase text-[var(--muted)]">{label}</span>
      <span className="text-right font-black text-[var(--text)]">{value}</span>
    </div>
  );
}

