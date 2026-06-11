"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, Star, Upload } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import type { DispatchShift, ShiftQuota, ShiftSignup } from "../../lib/dispatch";

type Board = { shifts: DispatchShift[]; quotas: ShiftQuota[]; signups: ShiftSignup[] };

const signupLabel: Record<string, string> = {
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  reported: "已填报",
  cancelled: "已取消",
};

export default function StationDispatchPage() {
  const session = useMemo(() => readSession(), []);
  const station = session?.station || session?.organization || "Santo Amaro";
  const franchise = session?.franchise || "Franquia Sul";
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Ponto Manager" }), [session]);

  const [board, setBoard] = useState<Board>({ shifts: [], quotas: [], signups: [] });
  const [message, setMessage] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [shiftId, setShiftId] = useState("");
  const [lines, setLines] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/dispatch?station=${encodeURIComponent(station)}&franchise=${encodeURIComponent(franchise)}`, { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setBoard(payload.data);
  }, [headers, station, franchise]);

  useEffect(() => {
    void load();
  }, [load]);

  // Shifts that have a station-level quota for us.
  const myRows = board.shifts
    .map((shift) => {
      const quota = board.quotas.find((item) => item.shiftId === shift.id && item.level === "station" && item.station === station);
      const signups = board.signups.filter((item) => item.shiftId === shift.id);
      return { shift, quota, signups };
    })
    .filter((row) => row.quota);

  const openShifts = myRows.filter((row) => row.shift.status === "scheduling");

  return (
    <AppShell>
      <PageTitle
        title="排班提报"
        eyebrow={`站点工作台 · ${station}（${franchise}）`}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : message.tone === "warn" ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="panel space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
            <Upload size={14} /> 提报骑手报名
          </div>
          <label className="block text-[10px] font-black uppercase text-[var(--muted)]">
            选择班次
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="mt-1 h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none">
              <option value="">请选择...</option>
              {openShifts.map(({ shift, quota }) => (
                <option key={shift.id} value={shift.id}>
                  {shift.date} {shift.timeRange}（本站配额 {quota?.quota}）
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-black uppercase text-[var(--muted)]">
            骑手清单（每行：姓名,99骑手ID[,CPF]）
            <textarea
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              rows={7}
              placeholder={"Carlos Mendes,650911801352198\nAndre Santos,650911920473782"}
              className="mt-1 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="button"
            disabled={busy || !shiftId || !lines.trim()}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const riders = lines
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [riderName, rider99Id, riderCpf] = line.split(/[,，;\t]/).map((part) => (part ?? "").trim());
                  return { riderName, rider99Id, riderCpf };
                });
              const response = await fetch("/api/dispatch", {
                method: "POST",
                headers,
                body: JSON.stringify({ action: "signup", shiftId, franchise, station, riders }),
              });
              const payload = await response.json().catch(() => ({}));
              setBusy(false);
              if (!response.ok) {
                setMessage({ tone: "err", text: payload.error ?? `提报失败 (${response.status})` });
                return;
              }
              setLines("");
              const skipped = (payload.data.skipped ?? []) as string[];
              setMessage({
                tone: skipped.length > 0 ? "warn" : "ok",
                text: `已提报 ${payload.data.created?.length ?? 0} 名骑手，等待加盟商/总部审核。${skipped.length > 0 ? ` 跳过：${skipped.join("、")}` : ""}`,
              });
              void load();
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "提报中..." : "提交报名"}
          </button>
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
            <ClipboardList size={14} /> 本站班次与报名状态
          </div>
          {myRows.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">加盟商还没有给 {station} 分配班次配额。</div>
          ) : (
            <div className="space-y-3">
              {myRows.map(({ shift, quota, signups }) => {
                const approved = signups.filter((item) => item.status === "approved" || item.status === "reported").length;
                return (
                  <div key={shift.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-black">
                        {shift.isCritical && <Star size={13} className="text-[var(--accent)]" />}
                        {shift.date} {shift.timeRange}
                      </div>
                      <div className="text-xs font-black">
                        配额 <span className="text-[var(--accent)]">{quota?.quota}</span> ｜ 已通过 {approved} ｜ 已提报 {signups.length}
                      </div>
                    </div>
                    {signups.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {signups.map((signup) => (
                          <span key={signup.id} className="tag">
                            {signup.riderName || signup.rider99Id} <Badge value={signupLabel[signup.status] ?? signup.status} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
