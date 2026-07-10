"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, SearchInput, Stat, StatusBadge, Toolbar, type DataColumn } from "../components/kit";
import type { Rider } from "../lib/data";

/**
 * 用户 / 会员表 — one unified member list (公开用户 + 骑手).
 *  - 会员一级: member without a 99 ID (public user).
 *  - 会员二级+: member with a 99 ID (rider), tier by lifetime orders.
 * Reuses the existing riders collection — no separate data table.
 */

function tierBadge(member: Rider) {
  return member.ninetyNineId
    ? <StatusBadge tone="info" label="会员二级 · 骑手" />
    : <StatusBadge tone="neutral" label="会员一级 · 公开用户" />;
}

export default function MembersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "public" | "rider">("all");
  const [selected, setSelected] = useState<Rider | null>(null);

  const load = () => fetch("/api/riders", { cache: "no-store" }).then((r) => r.json()).then((p) => setRiders(p.data ?? []));
  useEffect(() => { void load(); }, []);

  const rows = useMemo(
    () =>
      riders.filter((r) => {
        if (filter === "public" && r.ninetyNineId) return false;
        if (filter === "rider" && !r.ninetyNineId) return false;
        if (q && !`${r.name} ${r.phone} ${r.ninetyNineId ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [riders, q, filter],
  );

  const publicCount = riders.filter((r) => !r.ninetyNineId).length;
  const riderCount = riders.length - publicCount;

  const columns: Array<DataColumn<Rider>> = [
    { key: "name", label: "姓名", render: (r) => r.name },
    { key: "phone", label: "电话", render: (r) => r.phone || "—" },
    { key: "tier", label: "会员等级", render: (r) => tierBadge(r) },
    { key: "ninetyNineId", label: "99 ID", render: (r) => r.ninetyNineId || "—" },
    { key: "ponto", label: "站点", render: (r) => (r.ponto && r.ponto !== "Unassigned" ? r.ponto : "—") },
    { key: "franchise", label: "加盟商", render: (r) => (r.franchise && r.franchise !== "Unassigned" ? r.franchise : "—") },
    { key: "joinDate", label: "注册日", render: (r) => r.joinDate || "—" },
  ];

  return (
    <AppShell>
      <PageTitle
        title="用户 / 会员"
        eyebrow="公开用户 + 骑手 · 统一会员表（无 99 ID = 会员一级；有 99 ID = 会员二级起）"
      />

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="总会员" value={String(riders.length)} />
        <Stat label="公开用户（一级）" value={String(publicCount)} />
        <Stat label="骑手（二级+）" value={String(riderCount)} />
      </section>

      <div className="mb-3">
        <Toolbar
          right={
            <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line)] px-4 text-[13px] font-black text-[var(--muted)] hover:border-[var(--accent)]">
              <RefreshCcw size={14} /> 刷新
            </button>
          }
        >
          <SearchInput value={q} onChange={setQ} placeholder="搜索姓名 / 电话 / 99 ID" />
          {(["all", "public", "rider"] as const).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "全部" : f === "public" ? "公开用户" : "骑手"}
            </Chip>
          ))}
        </Toolbar>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={setSelected} minWidth={860} empty="暂无会员。" />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        ariaLabel="会员详情"
        title={
          selected && (
            <div className="min-w-0">
              <div className="truncate text-sm font-black">{selected.name}</div>
              <div className="mt-1">{tierBadge(selected)}</div>
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-0.5 text-sm font-bold">
            {([
              ["电话", selected.phone || "—"],
              ["99 ID", selected.ninetyNineId || "—"],
              ["站点", selected.ponto && selected.ponto !== "Unassigned" ? selected.ponto : "—"],
              ["加盟商", selected.franchise && selected.franchise !== "Unassigned" ? selected.franchise : "—"],
              ["注册日", selected.joinDate || "—"],
            ] as Array<[string, string]>).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0">
                <span className="shrink-0 text-[11px] font-black uppercase text-[var(--muted)]">{label}</span>
                <span className="truncate text-right">{value}</span>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
