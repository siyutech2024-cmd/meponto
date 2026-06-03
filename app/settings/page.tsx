"use client";

import { useMemo, useState } from "react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import { systemSettings, type SettingCategory } from "../lib/settings";

const categories: Array<"All Categories" | SettingCategory> = [
  "All Categories",
  "Incentive",
  "Incident SLA",
  "Notification",
  "Night Shift",
  "Security",
];

export default function SettingsPage() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All Categories");
  const [status, setStatus] = useState("All Status");

  const visibleSettings = useMemo(
    () =>
      systemSettings.filter((setting) => {
        const matchesCategory = category === "All Categories" || setting.category === category;
        const matchesStatus = status === "All Status" || setting.status === status;
        return matchesCategory && matchesStatus;
      }),
    [category, status],
  );

  const active = systemSettings.filter((setting) => setting.status === "Active").length;
  const draft = systemSettings.filter((setting) => setting.status === "Draft").length;
  const paused = systemSettings.filter((setting) => setting.status === "Paused").length;

  return (
    <AppShell>
      <PageTitle title="System Settings" eyebrow="Control rules and thresholds" />
      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Total Settings" value={systemSettings.length} />
        <Field label="Active" value={active} />
        <Field label="Draft" value={draft} />
        <Field label="Paused" value={paused} />
      </section>
      <div className="panel my-4 grid gap-3 p-3 md:grid-cols-[220px_180px_1fr]">
        <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          <option>All Status</option>
          <option>Active</option>
          <option>Draft</option>
          <option>Paused</option>
        </select>
        <div className="flex items-center text-sm font-bold text-[var(--muted)]">{visibleSettings.length} configurable rules</div>
      </div>
      <DataTable
        headers={["Category", "Name", "Value", "Status", "Owner", "Updated At", "Description"]}
        rows={visibleSettings.map((setting) => [
          setting.category,
          setting.name,
          `${setting.value} ${setting.unit}`,
          <Badge key="status" value={setting.status} />,
          setting.owner,
          setting.updatedAt,
          setting.description,
        ])}
      />
    </AppShell>
  );
}
