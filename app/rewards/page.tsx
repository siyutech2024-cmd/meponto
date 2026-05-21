"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { RewardDrawer } from "../components/forms";
import { AppShell, Badge, Button, DataTable, GuardedButton, PageTitle, AddButton } from "../components/ui";
import { leaders } from "../lib/data";
import { can } from "../lib/rbac";
import { type RewardRule, useVentoStore } from "../lib/store";

function RuleDrawer({
  open,
  rule,
  onClose,
}: {
  open: boolean;
  rule?: RewardRule;
  onClose: () => void;
}) {
  const addRewardRule = useVentoStore((state) => state.addRewardRule);
  const updateRewardRule = useVentoStore((state) => state.updateRewardRule);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-[#2a2a4a] bg-[#0d0d1a] shadow-2xl">
        <div className="flex min-h-16 items-center justify-between border-b border-[#2a2a4a] px-4">
          <h2 className="text-xl font-black">{rule ? "Edit Rule" : "Add Rule"}</h2>
          <button
            aria-label="Close"
            title="Close"
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded border border-[#2a2a4a] bg-[#1a1a2e] text-[#c4c4d4] hover:border-[#8b5cf6] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <form
            key={rule?.id ?? "new-rule"}
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const input = {
                ruleName: String(form.get("ruleName")),
                points: Number(form.get("points")),
                type: String(form.get("type")) as RewardRule["type"],
              };

              if (rule) {
                updateRewardRule(rule.id, input);
              } else {
                addRewardRule(input);
                event.currentTarget.reset();
              }
              onClose();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">Rule Name</span>
              <input
                name="ruleName"
                required
                defaultValue={rule?.ruleName ?? ""}
                className="h-11 w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3 outline-none"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">Points</span>
                <input
                  name="points"
                  required
                  min="1"
                  step="1"
                  type="number"
                  defaultValue={rule?.points ?? 10}
                  className="h-11 w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">Type</span>
                <select
                  name="type"
                  defaultValue={rule?.type ?? "Rider"}
                  className="h-11 w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3 outline-none"
                >
                  <option>Rider</option>
                  <option>Leader</option>
                </select>
              </label>
            </div>
            <Button>{rule ? "Save Rule" : "Add Rule"}</Button>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default function RewardsPage() {
  const riders = useVentoStore((state) => state.riders);
  const rewardRules = useVentoStore((state) => state.rewardRules);
  const ledgerEntries = useVentoStore((state) => state.ledgerEntries);
  const currentRole = useVentoStore((state) => state.currentRole);
  const updateLedgerStatus = useVentoStore((state) => state.updateLedgerStatus);
  const [rewardDrawerOpen, setRewardDrawerOpen] = useState(false);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const editingRule = rewardRules.find((rule) => rule.id === editingRuleId);
  const pendingRewards = useMemo(
    () => ledgerEntries.filter((entry) => entry.ledgerType === "Reward" || entry.ledgerType === "Leader Commission"),
    [ledgerEntries],
  );

  return (
    <AppShell>
      <PageTitle
        title="Reward System"
        eyebrow="P1 incentive engine"
        action={
          <div className="flex flex-wrap gap-2">
            <AddButton
              label="Add Rule"
              disabled={!can(currentRole, "manage_rewards")}
              onClick={() => {
                setEditingRuleId(null);
                setRuleDrawerOpen(true);
              }}
            />
            <AddButton label="Send Reward" disabled={!can(currentRole, "manage_rewards")} onClick={() => setRewardDrawerOpen(true)} />
          </div>
        }
      />
      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <DataTable
          headers={["Rule Name", "Points", "Type", "Action"]}
          rows={rewardRules.map((reward) => [
            reward.ruleName,
            reward.points,
            reward.type,
            <GuardedButton
              key="edit"
              permission="manage_rewards"
              onClick={() => {
                setEditingRuleId(reward.id);
                setRuleDrawerOpen(true);
              }}
            >
              Edit Rule
            </GuardedButton>,
          ])}
        />
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Leaderboard</h2>
          <div className="space-y-3">
            {riders
              .slice()
              .sort((a, b) => b.ar - a.ar)
              .slice(0, 3)
              .map((rider, index) => (
                <div key={rider.id} className="flex items-center justify-between rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                  <div>
                    <div className="font-black">{index + 1}. {rider.name}</div>
                    <div className="text-sm text-[#8b8ba3]">{rider.ponto}</div>
                  </div>
                  <Badge value={`${rider.ar}% AR`} />
                </div>
              ))}
          </div>
          <h3 className="mb-3 mt-5 text-sm font-black uppercase text-[#8b8ba3]">Top Leaders</h3>
          <div className="space-y-3">
            {leaders.map((leader) => (
              <div key={leader.id} className="flex items-center justify-between rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                <span className="font-black">{leader.name}</span>
                <Badge value={leader.level} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mt-5">
        <h2 className="mb-3 text-lg font-black">Reward Distribution Queue</h2>
        <DataTable
          headers={["Created At", "Recipient", "Type", "Amount", "Status", "Notes", "Actions"]}
          rows={pendingRewards.map((entry) => [
            entry.createdAt,
            entry.recipient,
            entry.ledgerType,
            `R$ ${entry.amount}`,
            <Badge key="status" value={entry.status} />,
            entry.notes,
            <div key="actions" className="flex flex-wrap gap-2">
              <GuardedButton permission="view_finance" onClick={() => updateLedgerStatus(entry.id, "Approved")}>Approve</GuardedButton>
              <GuardedButton permission="view_finance" onClick={() => updateLedgerStatus(entry.id, "Paid")}>Mark Paid</GuardedButton>
            </div>,
          ])}
        />
      </section>
      <RuleDrawer
        open={ruleDrawerOpen}
        rule={editingRule}
        onClose={() => {
          setRuleDrawerOpen(false);
          setEditingRuleId(null);
        }}
      />
      <RewardDrawer open={rewardDrawerOpen} onClose={() => setRewardDrawerOpen(false)} />
    </AppShell>
  );
}
