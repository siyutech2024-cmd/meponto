"use client";

import { MessageCircle, Radio, RefreshCcw, Search, Send, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, Badge, DataTable, PageTitle } from "../components/ui";
import { chatMessages, chatRooms, type ChatCoverageStatus, type ChatMessage, type ChatRiskStatus } from "../lib/chat";

const riskFilters: Array<"All Risk" | ChatRiskStatus> = ["All Risk", "Stable", "Watch", "Risk", "Critical"];
const coverageFilters: Array<"All Coverage" | ChatCoverageStatus> = ["All Coverage", "Covered", "Thin", "Gap"];

export default function ChatPage() {
  const [riskFilter, setRiskFilter] = useState<(typeof riskFilters)[number]>("All Risk");
  const [coverageFilter, setCoverageFilter] = useState<(typeof coverageFilters)[number]>("All Coverage");
  const [query, setQuery] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("chat-003");
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<ChatMessage[]>([]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return chatRooms.filter((group) => {
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

  const totalRiders = chatRooms.reduce((sum, group) => sum + group.ridersCount, 0);
  const activeToday = chatRooms.reduce((sum, group) => sum + group.activeToday, 0);
  const groupsAtRisk = chatRooms.filter((group) => group.riskStatus === "Risk" || group.riskStatus === "Critical").length;
  const coverageGaps = chatRooms.filter((group) => group.coverageStatus === "Gap").length;
  const alertGroups = chatRooms.filter((group) => group.unreadAlerts > 0 || group.pendingApprovals >= 10);
  const selectedRoom = chatRooms.find((room) => room.id === selectedRoomId) ?? chatRooms[0];
  const visibleMessages = [...chatMessages, ...sentMessages].filter((message) => message.roomId === selectedRoom.id);

  function sendMessage() {
    const body = draft.trim();
    if (!body) return;

    setSentMessages((messages) => [
      ...messages,
      {
        id: `draft-${Date.now()}`,
        roomId: selectedRoom.id,
        sender: "Ops Desk",
        senderRole: "HQ",
        body,
        createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        status: "Delivered",
      },
    ]);
    setDraft("");
  }

  return (
    <AppShell>
      <PageTitle title="In-App Chat Command" eyebrow="PontoSys room operations" />

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Rooms Monitored" value={String(chatRooms.length)} />
        <Metric label="Riders in Rooms" value={String(totalRiders)} />
        <Metric label="Active Today" value={String(activeToday)} />
        <Metric label="Risk / Gaps" value={`${groupsAtRisk}/${coverageGaps}`} tone="warning" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <div className="text-sm font-black">
                {filteredGroups.length} <span>room records</span>
              </div>
              <div className="text-xs text-[var(--muted)]">Delivery status, leader coverage, and in-app broadcast readiness</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex h-11 items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3">
                <Search size={16} className="text-[var(--muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search room, leader, ponto"
                  className="w-52 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                />
              </label>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as (typeof riskFilters)[number])} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
                {riskFilters.map((filter) => (
                  <option key={filter}>{filter}</option>
                ))}
              </select>
              <select value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value as (typeof coverageFilters)[number])} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
                {coverageFilters.map((filter) => (
                  <option key={filter}>{filter}</option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            headers={["Room", "Leader", "Riders", "Active", "Coverage", "Risk", "Last Activity", "Approvals", "Alerts", "Actions"]}
            rows={filteredGroups.map((group) => [
              <div key="group">
                <div className="font-black">{group.name}</div>
                <div className="text-xs text-[var(--muted)]">{group.ponto}</div>
              </div>,
              <div key="leader">
                <div>{group.leader}</div>
                <div className="text-xs text-[var(--muted)]">{group.leaderPhone}</div>
              </div>,
              group.ridersCount,
              group.activeToday,
              <Badge key="coverage" value={group.coverageStatus} />,
              <Badge key="risk" value={group.riskStatus} />,
              group.lastActivity,
              group.pendingApprovals,
              group.unreadAlerts,
              <div key="actions" className="flex flex-wrap gap-2">
                <button type="button" className="tag inline-flex items-center gap-1" onClick={() => setSelectedRoomId(group.id)}>
                  <RefreshCcw size={13} />
                  Open Room
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
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[var(--accent)]">
              <MessageCircle size={16} />
              {selectedRoom.name}
            </div>
            <div className="space-y-2">
              {visibleMessages.length ? (
                visibleMessages.map((message) => (
                  <div key={message.id} className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-black text-[var(--text)]">{message.sender}</span>
                      <Badge value={message.status} />
                    </div>
                    <div className="mt-2 text-sm text-[var(--text-soft)]">{message.body}</div>
                    <div className="mt-2 text-[10px] text-[var(--muted)]">{message.createdAt}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[var(--muted)]">No messages in this room yet.</div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write an in-app message"
                className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--surface)] px-3 text-sm outline-none"
              />
              <button type="button" onClick={sendMessage} className="grid h-10 w-10 place-items-center rounded border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" aria-label="Send in-app message">
                <Send size={16} />
              </button>
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[var(--accent)]">
              <Radio size={16} />
              Operator Queue
            </div>
            <div className="space-y-2">
              {alertGroups.map((group) => (
                <div key={group.id} className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black">{group.name}</span>
                    <Badge value={group.riskStatus} />
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {group.pendingApprovals} approvals waiting, {group.unreadAlerts} unread alerts.
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[var(--accent)]">
              <MessageCircle size={16} />
              Broadcast Lanes
            </div>
            <div className="space-y-2 text-sm">
              {chatRooms.map((group) => (
                <div key={group.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
                  <span className="font-bold">{group.broadcastList}</span>
                  <span className="text-[var(--muted)]">{group.ridersCount} riders</span>
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
      <div className="text-xs font-black uppercase text-[var(--muted)]">{label}</div>
      <div className={tone === "warning" ? "mt-2 text-3xl font-black text-[#fb923c]" : "mt-2 text-3xl font-black"}>{value}</div>
    </div>
  );
}
