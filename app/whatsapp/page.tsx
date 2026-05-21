"use client";

import { MessageCircle, Radio, RefreshCcw, Search, Send, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, Badge, DataTable, PageTitle } from "../components/ui";
import { whatsappGroups, type WhatsappCoverageStatus, type WhatsappRiskStatus } from "../lib/whatsapp";

const riskFilters: Array<"All Risk" | WhatsappRiskStatus> = ["All Risk", "Stable", "Watch", "Risk", "Critical"];
const coverageFilters: Array<"All Coverage" | WhatsappCoverageStatus> = ["All Coverage", "Covered", "Thin", "Gap"];

export default function WhatsappPage() {
  const [riskFilter, setRiskFilter] = useState<(typeof riskFilters)[number]>("All Risk");
  const [coverageFilter, setCoverageFilter] = useState<(typeof coverageFilters)[number]>("All Coverage");
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return whatsappGroups.filter((group) => {
      const matchesRisk = riskFilter === "All Risk" || group.riskStatus === riskFilter;
      const matchesCoverage = coverageFilter === "All Coverage" || group.coverageStatus === coverageFilter;
      const matchesQuery =
        !normalizedQuery ||
        group.name.toLowerCase().includes(normalizedQuery) ||
        group.leader.toLowerCase().includes(normalizedQuery) ||
        group.ponto.toLowerCase().includes(normalizedQuery);

      return matchesRisk && matchesCoverage && matchesQuery;
    });
  }, [coverageFilter, query, riskFilter]);

  const totalRiders = whatsappGroups.reduce((sum, group) => sum + group.ridersCount, 0);
  const activeToday = whatsappGroups.reduce((sum, group) => sum + group.activeToday, 0);
  const groupsAtRisk = whatsappGroups.filter((group) => group.riskStatus === "Risk" || group.riskStatus === "Critical").length;
  const coverageGaps = whatsappGroups.filter((group) => group.coverageStatus === "Gap").length;
  const alertGroups = whatsappGroups.filter((group) => group.unreadAlerts > 0 || group.pendingApprovals >= 10);

  return (
    <AppShell>
      <PageTitle title="WhatsApp Command" eyebrow="Group operations" />

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Groups Monitored" value={String(whatsappGroups.length)} />
        <Metric label="Riders in Groups" value={String(totalRiders)} />
        <Metric label="Active Today" value={String(activeToday)} />
        <Metric label="Risk / Gaps" value={`${groupsAtRisk}/${coverageGaps}`} tone="warning" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <div className="text-sm font-black">{filteredGroups.length} group records</div>
              <div className="text-xs text-[#8b8ba3]">Sync status, leader coverage, and broadcast readiness</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex h-11 items-center gap-2 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3">
                <Search size={16} className="text-[#8b8ba3]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search group, leader, ponto"
                  className="w-52 bg-transparent text-sm outline-none placeholder:text-[#4a4a60]"
                />
              </label>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as (typeof riskFilters)[number])} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
                {riskFilters.map((filter) => (
                  <option key={filter}>{filter}</option>
                ))}
              </select>
              <select value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value as (typeof coverageFilters)[number])} className="h-11 rounded border border-[#2a2a4a] bg-[#0d0d1a] px-3 outline-none">
                {coverageFilters.map((filter) => (
                  <option key={filter}>{filter}</option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            headers={["Group", "Leader", "Riders", "Active", "Coverage", "Risk", "Last Sync", "Approvals", "Alerts", "Actions"]}
            rows={filteredGroups.map((group) => [
              <div key="group">
                <div className="font-black">{group.name}</div>
                <div className="text-xs text-[#8b8ba3]">{group.ponto}</div>
              </div>,
              <div key="leader">
                <div>{group.leader}</div>
                <div className="text-xs text-[#8b8ba3]">{group.leaderPhone}</div>
              </div>,
              group.ridersCount,
              group.activeToday,
              <Badge key="coverage" value={group.coverageStatus} />,
              <Badge key="risk" value={group.riskStatus} />,
              group.lastSync,
              group.pendingApprovals,
              group.unreadAlerts,
              <div key="actions" className="flex flex-wrap gap-2">
                <button type="button" className="tag inline-flex items-center gap-1">
                  <RefreshCcw size={13} />
                  Sync Group
                </button>
                <button type="button" className="tag inline-flex items-center gap-1">
                  <Send size={13} />
                  Broadcast
                </button>
                <button type="button" className="tag inline-flex items-center gap-1">
                  <Users size={13} />
                  View Members
                </button>
              </div>,
            ])}
          />
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[#8b5cf6]">
              <Radio size={16} />
              Operator Queue
            </div>
            <div className="space-y-2">
              {alertGroups.map((group) => (
                <div key={group.id} className="rounded border border-[#2a2a4a] bg-[#1a1a2e] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black">{group.name}</span>
                    <Badge value={group.riskStatus} />
                  </div>
                  <div className="mt-1 text-sm text-[#8b8ba3]">
                    {group.pendingApprovals} approvals waiting, {group.unreadAlerts} unread alerts.
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[#8b5cf6]">
              <MessageCircle size={16} />
              Broadcast Lanes
            </div>
            <div className="space-y-2 text-sm">
              {whatsappGroups.map((group) => (
                <div key={group.id} className="flex items-center justify-between gap-3 border-b border-[#1e1e3a] pb-2 last:border-0 last:pb-0">
                  <span className="font-bold">{group.broadcastList}</span>
                  <span className="text-[#8b8ba3]">{group.ridersCount} riders</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-black uppercase text-[#8b8ba3]">{label}</div>
      <div className={tone === "warning" ? "mt-2 text-3xl font-black text-[#fb923c]" : "mt-2 text-3xl font-black"}>{value}</div>
    </div>
  );
}
