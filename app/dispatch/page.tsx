"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCopy, ClipboardList, Download, RefreshCcw, Send, Star, Upload, Users } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../lib/dispatch";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };

const headers = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };

const statusLabel: Record<string, string> = {
  scheduling: "排班中",
  executing: "执行中",
  finished: "已结束",
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  reported: "已填报",
  cancelled: "已取消",
};

const tabs = [
  { id: "board", label: "周计划总览", icon: CalendarDays },
  { id: "import", label: "导入 99 计划", icon: Upload },
  { id: "quota", label: "配额分配", icon: Users },
  { id: "review", label: "报名与审核", icon: ClipboardList },
  { id: "report", label: "填报工作台", icon: Send },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function DispatchPage() {
  const [tab, setTab] = useState<TabId>("board");
  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dispatch", { headers, cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setBoard(payload.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/dispatch", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `请求失败 (${response.status})` });
      return null;
    }
    void load();
    return payload.data as Record<string, unknown>;
  }

  const byShift = useMemo(() => {
    const quotaMap = new Map<string, ShiftQuota[]>();
    for (const quota of board.quotas) {
      quotaMap.set(quota.shiftId, [...(quotaMap.get(quota.shiftId) ?? []), quota]);
    }
    const signupMap = new Map<string, ShiftSignup[]>();
    for (const signup of board.signups) {
      signupMap.set(signup.shiftId, [...(signupMap.get(signup.shiftId) ?? []), signup]);
    }
    return { quotaMap, signupMap };
  }, [board]);

  const dates = useMemo(() => [...new Set(board.shifts.map((shift) => shift.date))].sort(), [board.shifts]);

  return (
    <AppShell>
      <PageTitle
        title="运力调度中心"
        eyebrow="Eastwind 排班 · 配额 · 报名 · 审核 · 填报"
        action={
          <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1">
            <RefreshCcw size={13} /> 刷新
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setMessage(null);
            }}
            className={`inline-flex h-10 items-center gap-2 rounded-[8px] border px-4 text-xs font-black uppercase ${tab === item.id ? "border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)] hover:border-[var(--muted)]"}`}
          >
            <item.icon size={15} /> {item.label}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : message.tone === "warn" ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}
        >
          {message.text}
        </div>
      )}

      {tab === "board" && <BoardTab board={board} byShift={byShift} dates={dates} loading={loading} />}
      {tab === "import" && <ImportTab onImport={post} setMessage={setMessage} />}
      {tab === "quota" && <QuotaTab board={board} byShift={byShift} onSave={post} setMessage={setMessage} />}
      {tab === "review" && <ReviewTab board={board} onAction={post} setMessage={setMessage} />}
      {tab === "report" && <ReportTab board={board} byShift={byShift} onAction={post} setMessage={setMessage} />}
    </AppShell>
  );
}

function statBadge(value: number, target: number) {
  if (target === 0) return "text-[var(--muted)]";
  if (value >= target) return "text-[var(--ok-ink)]";
  if (value >= target * 0.7) return "text-[var(--warning-ink)]";
  return "text-[var(--danger-ink)]";
}

function BoardTab({ board, byShift, dates, loading }: { board: Board; byShift: { quotaMap: Map<string, ShiftQuota[]>; signupMap: Map<string, ShiftSignup[]> }; dates: string[]; loading: boolean }) {
  if (loading && board.shifts.length === 0) {
    return <div className="panel p-6 text-sm font-bold text-[var(--muted)]">加载中...</div>;
  }
  if (board.shifts.length === 0) {
    return (
      <div className="panel p-6 text-sm font-bold text-[var(--muted)]">
        还没有班次数据。请先到「导入 99 计划」粘贴 Eastwind 排班计划详情。
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {dates.map((date) => {
        const shifts = board.shifts.filter((shift) => shift.date === date);
        return (
          <div key={date} className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-black">{date}</div>
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">{shifts.length} 个班次</div>
            </div>
            <div className="space-y-2">
              {shifts.map((shift) => {
                const quotas = byShift.quotaMap.get(shift.id) ?? [];
                const signups = byShift.signupMap.get(shift.id) ?? [];
                const franchiseQuota = quotas.filter((quota) => quota.level === "franchise").reduce((sum, quota) => sum + quota.quota, 0);
                const approved = signups.filter((signup) => signup.status === "approved" || signup.status === "reported").length;
                const pending = signups.filter((signup) => signup.status === "submitted").length;
                return (
                  <div key={shift.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-black">
                        {shift.isCritical && <Star size={14} className="text-[var(--accent)]" />}
                        {shift.timeRange}
                        <span className="text-[10px] font-bold text-[var(--muted)]">{shift.hotzone}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {shift.reportedAt && <Badge value="已填报" />}
                        <Badge value={statusLabel[shift.status] ?? shift.status} />
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] font-black">
                      <div>
                        <div className="text-[var(--muted)]">99名额</div>
                        <div>{shift.plannedCount}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted)]">已分配额</div>
                        <div className={statBadge(franchiseQuota, shift.plannedCount)}>{franchiseQuota}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted)]">已审通过</div>
                        <div className={statBadge(approved, shift.plannedCount)}>{approved}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted)]">待审核</div>
                        <div>{pending}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImportTab({ onImport, setMessage }: { onImport: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const [planId, setPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div className="panel space-y-4 p-5">
      <div className="text-sm font-bold leading-6 text-[var(--muted-strong)]">
        操作路径：Eastwind → 骑手排班管理 → 排班计划管理 → 详情，全选复制班次表格后粘贴到下方。系统自动识别班次ID、日期、热区、时段、计划人数、重点班次与状态；重复导入会按班次ID更新。
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input className={input} placeholder="排班计划ID（选填，如 5764786272908346848）" value={planId} onChange={(e) => setPlanId(e.target.value)} />
        <input className={input} placeholder="计划名称（选填，如 Ming 08.06）" value={planName} onChange={(e) => setPlanName(e.target.value)} />
      </div>
      <textarea
        className="min-h-64 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 font-mono text-xs leading-5 outline-none focus:border-[var(--accent)]"
        placeholder={"粘贴 Eastwind 计划详情表格内容...\n例如：\n5764786352616900081  否  2026-06-08  Santo Amaro  --  11:00~14:00  33  ...  31  已结束"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const result = await onImport({ action: "import", planId: planId.trim(), planName: planName.trim(), text });
          setBusy(false);
          if (result) {
            setMessage({ tone: "ok", text: `导入成功：新增 ${result.created} 个班次，更新 ${result.updated} 个班次。` });
            setText("");
          }
        }}
        className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        <Upload size={16} /> {busy ? "导入中..." : "解析并导入"}
      </button>
    </div>
  );
}

function ShiftSelect({ shifts, value, onChange }: { shifts: DispatchShift[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]">
      <option value="">选择班次...</option>
      {shifts.map((shift) => (
        <option key={shift.id} value={shift.id}>
          {shift.date} {shift.timeRange} · {shift.hotzone} · 名额{shift.plannedCount}{shift.isCritical ? " ★" : ""}
        </option>
      ))}
    </select>
  );
}

function QuotaTab({ board, byShift, onSave, setMessage }: { board: Board; byShift: { quotaMap: Map<string, ShiftQuota[]> }; onSave: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const [shiftId, setShiftId] = useState("");
  const [level, setLevel] = useState<"franchise" | "station">("franchise");
  const [franchise, setFranchise] = useState("");
  const [station, setStation] = useState("");
  const [quota, setQuota] = useState("");

  const shift = board.shifts.find((item) => item.id === shiftId);
  const quotas = (shiftId ? byShift.quotaMap.get(shiftId) ?? [] : []).sort((a, b) => a.level.localeCompare(b.level));
  const franchiseTotal = quotas.filter((item) => item.level === "franchise").reduce((sum, item) => sum + item.quota, 0);

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <div className="panel space-y-3 p-5">
        <div className="text-xs font-black uppercase text-[var(--accent)]">分配名额</div>
        <ShiftSelect shifts={board.shifts.filter((item) => item.status !== "finished")} value={shiftId} onChange={setShiftId} />
        <div className="flex gap-2">
          {(["franchise", "station"] as const).map((option) => (
            <button key={option} type="button" onClick={() => setLevel(option)} className={`h-10 flex-1 rounded-[8px] border text-xs font-black ${level === option ? "border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted-strong)]"}`}>
              {option === "franchise" ? "总部 → 加盟商" : "加盟商 → 站点"}
            </button>
          ))}
        </div>
        <input className={input} placeholder="加盟商名称" value={franchise} onChange={(e) => setFranchise(e.target.value)} />
        {level === "station" && <input className={input} placeholder="站点名称" value={station} onChange={(e) => setStation(e.target.value)} />}
        <input className={input} placeholder="名额数量" inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value.replace(/\D/g, ""))} />
        <button
          type="button"
          disabled={!shiftId || !franchise.trim() || quota === "" || (level === "station" && !station.trim())}
          onClick={async () => {
            setMessage(null);
            const result = await onSave({ action: "quota", shiftId, level, franchise: franchise.trim(), station: station.trim() || undefined, quota: Number(quota) });
            if (result) setMessage({ tone: "ok", text: "配额已保存。" });
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          保存配额
        </button>
        {shift && (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-xs font-bold text-[var(--muted-strong)]">
            99 计划名额 {shift.plannedCount}，已分配给加盟商 {franchiseTotal}
            {franchiseTotal > shift.plannedCount && <span className="text-[var(--danger-ink)]">（超额！）</span>}
          </div>
        )}
      </div>

      <div className="panel p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">当前班次配额</div>
        {quotas.length === 0 ? (
          <div className="text-sm font-bold text-[var(--muted)]">选择班次后查看；尚无配额记录。</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="pb-2">层级</th>
                <th className="pb-2">加盟商</th>
                <th className="pb-2">站点</th>
                <th className="pb-2">名额</th>
                <th className="pb-2">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {quotas.map((item) => (
                <tr key={item.id} className="border-t border-[var(--line)] font-bold">
                  <td className="py-2">{item.level === "franchise" ? "加盟商" : "站点"}</td>
                  <td className="py-2">{item.franchise}</td>
                  <td className="py-2">{item.station ?? "--"}</td>
                  <td className="py-2 font-black">{item.quota}</td>
                  <td className="py-2 text-xs text-[var(--muted)]">{item.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ReviewTab({ board, onAction, setMessage }: { board: Board; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const [shiftId, setShiftId] = useState("");
  const [franchise, setFranchise] = useState("");
  const [station, setStation] = useState("");
  const [ridersText, setRidersText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pending = board.signups.filter((signup) => signup.status === "submitted");
  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function review(status: "approved" | "rejected") {
    if (selected.size === 0) return;
    setMessage(null);
    const result = await onAction({ action: "review", signupIds: [...selected], status });
    if (result) {
      setMessage({ tone: "ok", text: `${status === "approved" ? "已通过" : "已驳回"} ${result.changed} 条报名。` });
      setSelected(new Set());
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <div className="panel space-y-3 p-5">
        <div className="text-xs font-black uppercase text-[var(--accent)]">代录站点报名</div>
        <ShiftSelect shifts={board.shifts.filter((item) => item.status === "scheduling")} value={shiftId} onChange={setShiftId} />
        <input className={input} placeholder="加盟商名称" value={franchise} onChange={(e) => setFranchise(e.target.value)} />
        <input className={input} placeholder="站点名称" value={station} onChange={(e) => setStation(e.target.value)} />
        <textarea
          className="min-h-40 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs leading-5 outline-none focus:border-[var(--accent)]"
          placeholder={"一行一个骑手：姓名,99骑手ID[,CPF]\n例如：\nCARLOS SILVA,650911813042436,24445328804"}
          value={ridersText}
          onChange={(e) => setRidersText(e.target.value)}
        />
        <button
          type="button"
          disabled={!shiftId || !franchise.trim() || !station.trim() || !ridersText.trim()}
          onClick={async () => {
            setMessage(null);
            const riders = ridersText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [riderName = "", rider99Id = "", riderCpf = ""] = line.split(/[,，;\t]/).map((part) => part.trim());
                return { riderName, rider99Id, riderCpf };
              });
            const result = await onAction({ action: "signup", shiftId, franchise: franchise.trim(), station: station.trim(), riders });
            if (result) {
              const skipped = (result.skipped as string[]) ?? [];
              setMessage({
                tone: skipped.length > 0 ? "warn" : "ok",
                text: `已录入 ${result.created} 条报名${skipped.length > 0 ? `；跳过 ${skipped.length} 条：${skipped.slice(0, 5).join("、")}` : "。"}`,
              });
              setRidersText("");
            }
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          <Users size={16} /> 提交报名
        </button>
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black uppercase text-[var(--accent)]">待审核队列（{pending.length}）</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void review("approved")} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-40">
              <CheckCircle2 size={14} /> 通过（{selected.size}）
            </button>
            <button type="button" onClick={() => void review("rejected")} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--danger)] px-4 text-xs font-black uppercase text-[var(--danger-ink)] disabled:opacity-40">
              驳回
            </button>
          </div>
        </div>
        {pending.length === 0 ? (
          <div className="text-sm font-bold text-[var(--muted)]">暂无待审核报名。</div>
        ) : (
          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {pending.map((signup) => {
              const shift = board.shifts.find((item) => item.id === signup.shiftId);
              return (
                <label key={signup.id} className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <input type="checkbox" checked={selected.has(signup.id)} onChange={() => toggle(signup.id)} className="h-4 w-4 accent-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-black">
                      {signup.riderName || signup.rider99Id}
                      <span className="font-mono text-[11px] font-bold text-[var(--muted)]">{signup.rider99Id}</span>
                    </div>
                    <div className="text-[11px] font-bold text-[var(--muted)]">
                      {shift ? `${shift.date} ${shift.timeRange} · ${shift.hotzone}` : signup.shiftId} ｜ {signup.franchise} / {signup.station}
                    </div>
                  </div>
                  <Badge value={statusLabel[signup.status]} />
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportTab({ board, byShift, onAction, setMessage }: { board: Board; byShift: { signupMap: Map<string, ShiftSignup[]> }; onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; setMessage: (m: { tone: "ok" | "warn" | "err"; text: string } | null) => void }) {
  const candidates = board.shifts.filter((shift) => shift.status !== "finished");

  async function copyRoster(shiftId: string) {
    setMessage(null);
    const result = await onAction({ action: "report", shiftId, confirm: false });
    if (!result) return;
    const text = String(result.rosterText ?? "");
    if (!text) {
      setMessage({ tone: "warn", text: "该班次还没有已通过的报名。" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: "ok", text: `已复制 ${result.count} 个骑手ID（一行一个），到 Eastwind「骑手排班」弹窗粘贴提交即可。` });
    } catch {
      setMessage({ tone: "warn", text: `复制失败，请手动复制：\n${text.slice(0, 200)}...` });
    }
  }

  async function markReported(shiftId: string) {
    const result = await onAction({ action: "report", shiftId, confirm: true });
    if (result) setMessage({ tone: "ok", text: `班次已标记为已填报（${result.count} 人）。` });
  }

  return (
    <div className="panel p-5">
      <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">填报工作台 · 复制清单 → Eastwind 提交 → 标记完成</div>
      {candidates.length === 0 ? (
        <div className="text-sm font-bold text-[var(--muted)]">暂无可填报的班次。</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase text-[var(--muted)]">
              <th className="pb-2">班次</th>
              <th className="pb-2">99名额</th>
              <th className="pb-2">已通过</th>
              <th className="pb-2">缺口</th>
              <th className="pb-2">状态</th>
              <th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((shift) => {
              const signups = byShift.signupMap.get(shift.id) ?? [];
              const approved = signups.filter((signup) => signup.status === "approved" || signup.status === "reported").length;
              const gap = shift.plannedCount - approved;
              return (
                <tr key={shift.id} className="border-t border-[var(--line)] font-bold">
                  <td className="py-2">
                    <div className="flex items-center gap-1 font-black">
                      {shift.isCritical && <Star size={13} className="text-[var(--accent)]" />}
                      {shift.date} {shift.timeRange}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">{shift.hotzone} · {shift.id}</div>
                  </td>
                  <td className="py-2">{shift.plannedCount}</td>
                  <td className={`py-2 font-black ${statBadge(approved, shift.plannedCount)}`}>{approved}</td>
                  <td className={`py-2 font-black ${gap > 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok-ink)]"}`}>{gap > 0 ? gap : 0}</td>
                  <td className="py-2">{shift.reportedAt ? <Badge value={`已填报 ${shift.reportedAt}`} /> : <Badge value="未填报" />}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copyRoster(shift.id)} className="tag inline-flex items-center gap-1">
                        <ClipboardCopy size={13} /> 复制清单
                      </button>
                      <button type="button" onClick={() => void markReported(shift.id)} className="tag inline-flex items-center gap-1">
                        <Download size={13} /> 标记已填报
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
