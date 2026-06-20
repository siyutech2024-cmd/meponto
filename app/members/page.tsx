"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { AppShell, Badge, DataTable, PageTitle } from "../components/ui";
import type { Rider } from "../lib/data";

/**
 * 用户 / 会员表 — one unified member list (公开用户 + 骑手).
 *  - 会员一级: member without a 99 ID (public user).
 *  - 会员二级+: member with a 99 ID (rider), tier by lifetime orders.
 * Reuses the existing riders collection — no separate data table.
 */
export default function MembersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "public" | "rider">("all");

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

  return (
    <AppShell>
      <PageTitle
        title="用户 / 会员"
        eyebrow="公开用户 + 骑手 · 统一会员表（无 99 ID = 会员一级；有 99 ID = 会员二级起）"
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">总会员</div><div className="text-2xl font-black">{riders.length}</div></div>
        <div className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">公开用户（一级）</div><div className="text-2xl font-black">{publicCount}</div></div>
        <div className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">骑手（二级+）</div><div className="text-2xl font-black">{riderCount}</div></div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索姓名 / 电话 / 99 ID" className="h-10 w-64 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none" />
        {(["all", "public", "rider"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`h-10 rounded-[8px] px-4 text-sm font-black ${filter === f ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line)] text-[var(--muted-strong)]"}`}>
            {f === "all" ? "全部" : f === "public" ? "公开用户" : "骑手"}
          </button>
        ))}
      </div>

      <DataTable
        headers={["姓名", "电话", "会员等级", "99 ID", "站点", "加盟商", "注册日"]}
        rows={rows.map((r) => [
          r.name,
          r.phone || "—",
          <Badge key="tier" value={r.ninetyNineId ? "会员二级 · 骑手" : "会员一级 · 公开用户"} />,
          r.ninetyNineId || "—",
          r.ponto && r.ponto !== "Unassigned" ? r.ponto : "—",
          r.franchise && r.franchise !== "Unassigned" ? r.franchise : "—",
          r.joinDate || "—",
        ])}
      />
    </AppShell>
  );
}
