"use client";

import Link from "next/link";
import { useState } from "react";
import { AddLeaderDrawer, RewardDrawer } from "../components/forms";
import { AddButton, AppShell, Badge, DataTable, GuardedButton, PageTitle } from "../components/ui";
import { can } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

export default function LeadersPage() {
  const leaders = useVentoStore((state) => state.leaders);
  const currentRole = useVentoStore((state) => state.currentRole);
  const [addOpen, setAddOpen] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);

  return (
    <AppShell>
      <PageTitle
        title="Leader System"
        eyebrow="Rider relationship operators"
        action={<AddButton label="Add Leader" disabled={!can(currentRole, "manage_leaders")} onClick={() => setAddOpen(true)} />}
      />
      <DataTable
        headers={["Leader Name", "Ponto", "Riders Count", "Night Shift Coverage", "Rating", "Level", "Actions"]}
        rows={leaders.map((leader) => [
          leader.name,
          leader.ponto,
          leader.ridersCount,
          `${leader.nightShiftCoverage}%`,
          leader.rating,
          <Badge key="level" value={leader.level} />,
          <div key="actions" className="flex flex-wrap gap-2">
            <Link className="tag" href={`/leaders/${leader.id}`}>View</Link>
            <GuardedButton permission="manage_leaders">Edit</GuardedButton>
            <GuardedButton permission="manage_rewards" onClick={() => setRewardOpen(true)}>Reward</GuardedButton>
          </div>,
        ])}
      />
      <AddLeaderDrawer open={addOpen} onClose={() => setAddOpen(false)} />
      <RewardDrawer open={rewardOpen} onClose={() => setRewardOpen(false)} />
    </AppShell>
  );
}
