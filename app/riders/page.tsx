"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, UserPlus } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, Pager, SearchInput, SectionCard, Stat, StatusBadge, TodoCard, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import { downloadCsv } from "../lib/csv";
import { useDialog } from "../components/dialog";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

type RiderRow = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  pix: string;
  ponto: string;
  franchise?: string;
  status: string;
  ar: number;
  joinDate: string;
  ninetyNineId?: string;
  pointsBalance: number;
  totalOrders: number;
  lastReportDate: string;
  reportAr: number | null;
  source: "profile" | "report";
  /** 模式二: "pro" = PRO 池骑手(专属班表+薪酬线下自结). */
  pool?: "standard" | "pro";
};

type Network = { franchises: Array<{ id: string; name: string }>; stations: Array<{ id: string; name: string; franchise?: string }> };

const HEADERS = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };
const isUnassigned = (value?: string) => !value || value === "Unassigned";
const STATUS_OPTIONS = ["Active", "Inactive", "Risk", "Night Shift"] as const;

const statusTone = (status: string): BadgeTone =>
  status === "Active" ? "success" : status === "Risk" ? "danger" : status === "Night Shift" ? "warn" : "neutral";

export default function RidersPage() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val));
    return s;
  };
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [network, setNetwork] = useState<Network>({ franchises: [], stations: [] });
  const [query, setQuery] = useState("");
  const [stationFilter, setStationFilter] = useState("");
  const [franchiseFilter, setFranchiseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  // 模式二: pool filter — "" 全部 / "pro" 仅 PRO / "standard" 仅普通.
  const [poolFilter, setPoolFilter] = useState("");
  // 模式二 §9: optional defaults applied to every rider created by the PRO
  // roster import (leave blank → Unassigned, assign later as usual).
  const [proImportFranchise, setProImportFranchise] = useState("");
  const [proImportPonto, setProImportPonto] = useState("");
  // Bulk PRO marking: 99 ID list pasted by HQ (T1).
  const [poolBulkOpen, setPoolBulkOpen] = useState(false);
  const [poolBulkText, setPoolBulkText] = useState("");
  const [poolBulkBusy, setPoolBulkBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState({ name: "", ninetyNineId: "", phone: "", cpf: "", ponto: "", franchise: "" });
  // Assignment edits are staged here and saved to the DB only after 确认保存.
  const [pending, setPending] = useState<Record<string, { name: string; ponto?: string; franchise?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    const [ridersResponse, networkResponse] = await Promise.all([
      fetch("/api/riders", { headers: HEADERS, cache: "no-store" }),
      fetch("/api/network", { headers: HEADERS, cache: "no-store" }),
    ]);
    if (ridersResponse.ok) setRiders((await ridersResponse.json()).data);
    if (networkResponse.ok) {
      const payload = (await networkResponse.json()).data;
      setNetwork({ franchises: payload.franchises, stations: payload.stations });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live riders (Eastwind board) with NO MePonto profile — surfaced here so
  // operations can onboard them and assign a franchise. Loaded after the main
  // data to stay off the critical path.
  type LiveUnmatched = { riderExtId: string | null; name: string | null; phone: string | null; hotZone: string | null; matched?: boolean };
  const [liveUnmatched, setLiveUnmatched] = useState<LiveUnmatched[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/eastwind/riders-live", { headers: HEADERS, cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()).data as { riders?: LiveUnmatched[] } | LiveUnmatched[];
        const rows = Array.isArray(payload) ? payload : payload?.riders ?? [];
        setLiveUnmatched(rows.filter((row) => row.matched === false));
      } catch {
        // Live board unavailable — section simply stays hidden.
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [riders.length]);

  function onboardFromLive(row: LiveUnmatched) {
    setForm({
      name: row.name ?? "",
      ninetyNineId: String(row.riderExtId ?? "").replace(/\D/g, ""),
      phone: row.phone ?? "",
      cpf: "",
      ponto: "",
      franchise: "",
    });
    setAddOpen(true);
  }

  async function assign(rider: RiderRow, fields: { ponto?: string; franchise?: string; status?: string }) {
    setBusyId(rider.id);
    const response = await fetch("/api/riders", { method: "POST", headers: HEADERS, body: JSON.stringify({ action: "assign", riderId: rider.id, ...fields }) });
    const payload = await response.json().catch(() => ({}));
    setBusyId("");
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("rdOpFailed", { s: response.status }) });
      return;
    }
    setMessage({ tone: "ok", text: `${t("rdUpdated", { name: rider.name })}${fields.ponto ? ` → ${fields.ponto}` : ""}${fields.franchise ? ` / ${fields.franchise}` : ""}` });
    void load();
  }

  /** Stage a franchise/station edit (saved only after 确认保存). */
  function stage(rider: RiderRow, fields: { ponto?: string; franchise?: string }) {
    setPending((current) => {
      const entry = { ...current[rider.id], ...fields, name: rider.name };
      // Cascade: picking a station locks its parent franchise; switching
      // franchise clears a station that doesn't belong to it.
      if (fields.ponto) {
        const station = network.stations.find((s) => s.name === fields.ponto);
        if (station?.franchise) entry.franchise = station.franchise;
      }
      if (fields.franchise !== undefined && fields.ponto === undefined) {
        const effectivePonto = entry.ponto ?? (isUnassigned(rider.ponto) ? undefined : rider.ponto);
        const station = effectivePonto ? network.stations.find((s) => s.name === effectivePonto) : undefined;
        if (station?.franchise && station.franchise !== fields.franchise) entry.ponto = "";
      }
      return { ...current, [rider.id]: entry };
    });
  }

  /**
   * 模式二 T1 · 批量标记 PRO 池.
   * HQ pastes the 99 filtered name list (99 IDs, one per line / comma / space
   * separated). Each match is flipped via the normal assign endpoint, so every
   * change lands an individual RIDER_POOL_CHANGED audit entry. Unknown IDs are
   * reported back instead of silently ignored.
   */
  async function applyPoolBulk(target: "pro" | "standard") {
    const ids = poolBulkText.split(/[\s,;]+/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length >= 6);
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      setMessage({ tone: "err", text: t("rdPoolBulkEmpty") });
      return;
    }
    const byNine = new Map(riders.filter((r) => r.ninetyNineId).map((r) => [String(r.ninetyNineId), r]));
    const matched = unique.map((id) => byNine.get(id)).filter((r): r is RiderRow => !!r);
    const missing = unique.filter((id) => !byNine.has(id));
    if (!(await dialog.confirm(t("rdPoolBulkConfirmQ", { n: matched.length, pool: target === "pro" ? "PRO" : t("rdPoolStandard") }), {
      message: [
        matched.slice(0, 20).map((r) => `· ${r.name} (${r.ninetyNineId})`).join("\n"),
        matched.length > 20 ? `… +${matched.length - 20}` : "",
        missing.length ? `\n${t("rdPoolBulkMissing", { n: missing.length })}: ${missing.slice(0, 10).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      confirmText: t("rdConfirmSave"),
    }))) return;

    setPoolBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const rider of matched) {
      const response = await fetch("/api/riders", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "assign", riderId: rider.id, pool: target }),
      });
      if (response.ok) ok += 1; else failed += 1;
    }
    setPoolBulkBusy(false);
    setPoolBulkOpen(false);
    setPoolBulkText("");
    setMessage({
      tone: failed ? "err" : "ok",
      text: t("rdPoolBulkDone", { ok, failed, missing: missing.length }),
    });
    void load();
  }

  /**
   * 模式二 §9 · PRO 名单建档.
   * Same textarea as the bulk re-pool above, but each line may carry the full
   * row (99 ID / name / CPF / phone) — riders that don't exist yet are CREATED
   * in the PRO pool, riders that already exist are just moved into it. Without
   * this, new-account riders have no profile at all: the live snapshot matches
   * nobody and the settlement sheet can't be tied to a person.
   */
  async function importProRoster() {
    if (!poolBulkText.trim()) {
      setMessage({ tone: "err", text: t("rdPoolBulkEmpty") });
      return;
    }
    const lines = poolBulkText.split(/\r?\n/).filter((line) => line.trim()).length;
    if (!(await dialog.confirm(t("rdProImportConfirmQ", { n: lines }), { message: t("rdProImportConfirmMsg"), confirmText: t("rdConfirmSave") }))) return;
    setPoolBulkBusy(true);
    const response = await fetch("/api/riders", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action: "importPro", text: poolBulkText, franchise: proImportFranchise, ponto: proImportPonto }),
    });
    const payload = await response.json().catch(() => ({}));
    setPoolBulkBusy(false);
    if (!response.ok) {
      setMessage({ tone: "err", text: String(payload.error ?? `HTTP ${response.status}`) });
      return;
    }
    setPoolBulkOpen(false);
    setPoolBulkText("");
    setMessage({ tone: "ok", text: t("rdProImportDone", { created: payload.data.created, promoted: payload.data.promoted, skipped: payload.data.skipped }) });
    void load();
  }

  async function savePending() {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    if (!(await dialog.confirm(t("rdConfirmSaveQ", { n: entries.length }), { message: entries.map(([, e]) => `· ${e.name} → ${e.franchise ?? t("rdUnchanged")} / ${e.ponto || t("rdPendingVal")}`).join("\n"), confirmText: t("rdConfirmSave") }))) return;
    setSaving(true);
    let failed = 0;
    for (const [riderId, entry] of entries) {
      const response = await fetch("/api/riders", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "assign", riderId, ...(entry.ponto !== undefined ? { ponto: entry.ponto } : {}), ...(entry.franchise !== undefined ? { franchise: entry.franchise } : {}) }),
      });
      if (!response.ok) failed += 1;
    }
    setSaving(false);
    setPending({});
    setMessage(failed ? { tone: "err", text: t("rdSavePartial", { ok: entries.length - failed, fail: failed }) } : { tone: "ok", text: t("rdSaveOk", { n: entries.length }) });
    void load();
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return riders
      .filter((rider) => {
        // Riders without a 99 ID stay off this operational page — they remain
        // visible in the Members page for profile completion.
        if (String(rider.ninetyNineId ?? "").trim() === "") return false;
        const haystack = [rider.name, rider.cpf, rider.phone, rider.ninetyNineId].map((value) => String(value ?? "").toLowerCase());
        if (term && !haystack.some((value) => value.includes(term))) return false;
        if (stationFilter && rider.ponto !== stationFilter) return false;
        if (franchiseFilter && rider.franchise !== franchiseFilter) return false;
        if (statusFilter && rider.status !== statusFilter) return false;
        if (poolFilter && (rider.pool === "pro" ? "pro" : "standard") !== poolFilter) return false;
        if (onlyUnassigned && !(isUnassigned(rider.ponto) || isUnassigned(rider.franchise))) return false;
        return true;
      })
      .sort((a, b) => {
        // Unassigned first, then by lifetime orders.
        const aUn = isUnassigned(a.ponto) || isUnassigned(a.franchise) ? 0 : 1;
        const bUn = isUnassigned(b.ponto) || isUnassigned(b.franchise) ? 0 : 1;
        return aUn - bUn || b.totalOrders - a.totalOrders;
      });
  }, [riders, query, stationFilter, franchiseFilter, statusFilter, poolFilter, onlyUnassigned]);

  // Stats use the SAME base as the table (99ID-bearing riders + report rows),
  // otherwise the "unassigned" card counts hidden no-99ID profiles and the
  // click-through list shows fewer rows than the card promises.
  const visibleBase = useMemo(() => riders.filter((rider) => String(rider.ninetyNineId ?? "").trim() !== ""), [riders]);
  const unassignedCount = visibleBase.filter((rider) => isUnassigned(rider.ponto) || isUnassigned(rider.franchise)).length;
  const reportOnlyCount = visibleBase.filter((rider) => rider.source === "report").length;

  // Pagination keeps the table short even with hundreds of riders.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [query, stationFilter, franchiseFilter, statusFilter, poolFilter, onlyUnassigned]);

  const input = "h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]";

  const columns: Array<DataColumn<RiderRow>> = [
    {
      key: "rider",
      label: t("rdColRider"),
      className: "max-w-[220px]",
      render: (rider) => {
        const noPix = rider.source === "profile" && String(rider.pix ?? "").trim() === "";
        const isPro = rider.pool === "pro";
        return (
          <div>
            {/* 缺 PIX 的警告色优先于 PRO 金色 —— 缺 PIX 是"要立刻处理",
                PRO 只是"身份标识",不能让身份色盖掉待办色。 */}
            <div className={`flex items-center gap-1.5 truncate font-black ${noPix ? "text-[var(--warning-ink)]" : isPro ? "text-[#eda100]" : ""}`}>
              <span className="truncate">{rider.name}</span>
              {/* 模式二: PRO 徽章 — 三级后台共用(加盟商/站点只读) */}
              {rider.pool === "pro" && (
                <span className="shrink-0 rounded-full bg-[#eda100] px-1.5 py-[1px] text-[9px] font-black text-[#171b33]">PRO</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {noPix && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const pix = await dialog.prompt(t("rdPixPromptTitle"), { message: t("rdPixPromptMsg", { name: rider.name }), placeholder: "CPF / e-mail / chave aleatória" });
                    if (!pix?.trim()) return;
                    const response = await fetch(`/api/riders/${rider.id}`, { method: "PUT", headers: HEADERS, body: JSON.stringify({ pix: pix.trim() }) });
                    if (response.ok) {
                      setMessage({ tone: "ok", text: t("rdPixSaved", { name: rider.name }) });
                      void load();
                    }
                  }}
                  className="rounded-full border border-[var(--warn)] px-1.5 py-px text-[10px] font-black uppercase text-[var(--warning-ink)] hover:bg-[var(--warn-bg)]"
                >
                  {t("rdNoPix")}
                </button>
              )}
              {rider.source === "report" && <span className="text-[10px] font-black uppercase text-[var(--warning-ink)]">{t("rdReportNoProfile")}</span>}
              {pending[rider.id] && <span className="text-[10px] font-black uppercase text-[var(--warning-ink)]">{t("rdToSave")}</span>}
            </div>
          </div>
        );
      },
    },
    { key: "ninetyNineId", label: "99 ID", render: (rider) => <span className="font-bold text-[var(--muted-strong)]">{rider.ninetyNineId || "—"}</span> },
    {
      key: "franchise",
      label: t("rdColFranchise"),
      render: (rider) => {
        const staged = pending[rider.id];
        const effectiveFranchise = staged?.franchise ?? (isUnassigned(rider.franchise) ? "" : rider.franchise!);
        return (
          <select
            disabled={saving}
            value={effectiveFranchise}
            onChange={(e) => stage(rider, { franchise: e.target.value })}
            className={`h-9 max-w-[150px] rounded-[8px] border bg-[var(--surface-raised)] px-2 text-xs font-bold outline-none ${staged ? "border-[var(--warning)]" : isUnassigned(rider.franchise) ? "border-[var(--danger)] text-[var(--danger-ink)]" : "border-[var(--line)] text-[var(--text)]"}`}
          >
            <option value="">{t("rdUnassignedOpt")}</option>
            {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
        );
      },
    },
    {
      key: "station",
      label: t("rdColStation"),
      render: (rider) => {
        const staged = pending[rider.id];
        const effectiveFranchise = staged?.franchise ?? (isUnassigned(rider.franchise) ? "" : rider.franchise!);
        const effectivePonto = staged?.ponto ?? (isUnassigned(rider.ponto) ? "" : rider.ponto);
        // Cascade: station options follow the (staged) franchise.
        const stationOptions = effectiveFranchise ? network.stations.filter((s) => s.franchise === effectiveFranchise) : network.stations;
        return (
          <select
            disabled={saving}
            value={effectivePonto}
            onChange={(e) => stage(rider, { ponto: e.target.value })}
            className={`h-9 max-w-[170px] rounded-[8px] border bg-[var(--surface-raised)] px-2 text-xs font-bold outline-none ${staged ? "border-[var(--warning)]" : isUnassigned(rider.ponto) ? "border-[var(--danger)] text-[var(--danger-ink)]" : "border-[var(--line)] text-[var(--text)]"}`}
          >
            <option value="">{t("rdUnassignedOpt")}</option>
            {stationOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        );
      },
    },
    { key: "orders", label: t("rdColOrders"), align: "right", render: (rider) => <span className="font-black">{rider.totalOrders}</span> },
    {
      key: "ar",
      label: "AR",
      align: "right",
      render: (rider) => {
        const ar = rider.reportAr ?? rider.ar;
        return <span className={`font-black ${ar !== null && ar < 95 ? "text-[var(--danger-ink)]" : ""}`}>{ar !== null ? `${ar}%` : "—"}</span>;
      },
    },
    { key: "points", label: t("rdColPoints"), align: "right", render: (rider) => <span className="font-black text-[var(--accent)]">{rider.pointsBalance}</span> },
    { key: "lastReport", label: t("rdColLastReport"), render: (rider) => <span className="text-xs font-bold text-[var(--muted)]">{rider.lastReportDate || "—"}</span> },
    { key: "status", label: t("rdColStatus"), render: (rider) => <StatusBadge tone={statusTone(rider.status)} label={rider.status} /> },
    {
      key: "action",
      label: t("rdColAction"),
      align: "right",
      render: (rider) => (
        <div className="flex justify-end gap-1.5">
          {rider.source === "profile" && <Link className="tag" href={`/riders/${rider.id}`}>{t("rdDetail")}</Link>}
          {rider.source === "profile" && (
            <button type="button" className="tag" disabled={busyId === rider.id} onClick={() => void assign(rider, { status: rider.status === "Inactive" ? "Active" : "Inactive" })}>
              {rider.status === "Inactive" ? t("rdEnable") : t("rdDisable")}
            </button>
          )}
          {rider.source === "report" && (
            <button type="button" className="tag border-[var(--accent)] text-[var(--accent)]" disabled={busyId === rider.id} onClick={() => void assign(rider, {})}>
              {t("rdCreateProfile")}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("rdTitle")}
        eyebrow={t("rdEyebrow", { n: visibleBase.length })}
        action={
          <div className="flex gap-2">
            {/* 模式二 T1: 批量标记 PRO 池(总部专属;粘贴 99 名单) */}
            <button type="button" className="tag" onClick={() => setPoolBulkOpen(true)}>
              {t("rdPoolBulk")}
            </button>
            <button
              type="button"
              className="tag"
              onClick={() => downloadCsv(`riders-${new Date().toISOString().slice(0, 10)}`, [t("rdColRider"), "99ID", "CPF", t("rdPhPhone"), t("rdColFranchise"), t("rdColStation"), t("rdColStatus"), "Pool", t("rdColOrders"), t("rdColLastReport"), t("rdColPoints")], filtered.map((r) => [r.name, r.ninetyNineId ?? "", r.cpf, r.phone, r.franchise ?? "", r.ponto, r.status, r.pool === "pro" ? "PRO" : "", String(r.totalOrders), r.lastReportDate, String(r.pointsBalance)]))}
            >
              {t("rdExport")}
            </button>
            <button type="button" className="tag inline-flex items-center gap-1" onClick={() => void load()}><RefreshCcw size={13} /> {t("rdRefresh")}</button>
            <button type="button" onClick={() => setAddOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]">
              <Plus size={14} /> {t("rdAddRider")}
            </button>
          </div>
        }
      />

      {message && (
        <div className={`mb-3 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Quick stats — unassigned is the call to action. */}
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label={t("rdTotal")} value={String(visibleBase.length)} />
        <Stat label={t("rdProfiled")} value={String(visibleBase.length - reportOnlyCount)} />
        <TodoCard label={t("rdUnassignedClick")} value={unassignedCount} tone={unassignedCount > 0 ? "danger" : "neutral"} active={onlyUnassigned} onClick={() => setOnlyUnassigned(!onlyUnassigned)} />
        <TodoCard label={t("rdNewFaces")} value={reportOnlyCount} tone={reportOnlyCount > 0 ? "warn" : "neutral"} />
      </section>

      {/* Toolbar: search + network selects + status chips */}
      <div className="mt-4">
        <Toolbar
          right={
            <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} className={input}>
              <option value="">{t("rdAllStation")}</option>
              <option value="Unassigned">{t("rdUnassignedOpt")}</option>
              {network.stations.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          }
        >
          <SearchInput value={query} onChange={setQuery} placeholder={t("rdSearchPh")} />
          <select value={franchiseFilter} onChange={(e) => setFranchiseFilter(e.target.value)} className={input}>
            <option value="">{t("rdAllFranchise")}</option>
            <option value="Unassigned">{t("rdUnassignedOpt")}</option>
            {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
          {/* 模式二: 池筛选 — 选 PRO 即单独查看全部 PRO 骑手(零新增菜单) */}
          <select value={poolFilter} onChange={(e) => setPoolFilter(e.target.value)} className={input}>
            <option value="">{t("rdAllPool")}</option>
            <option value="pro">PRO</option>
            <option value="standard">{t("rdPoolStandard")}</option>
          </select>
          <Chip active={statusFilter === ""} onClick={() => setStatusFilter("")}>{t("rdAllStatus")}</Chip>
          {STATUS_OPTIONS.map((status) => (
            <Chip key={status} active={statusFilter === status} onClick={() => setStatusFilter(statusFilter === status ? "" : status)}>{status}</Chip>
          ))}
        </Toolbar>
      </div>

      {/* Live riders with no profile: onboard + assign in two clicks */}
      {liveUnmatched.length > 0 && (
        <div className="mt-4">
          <SectionCard title={t("rdLiveTitle", { n: liveUnmatched.length })} desc={t("rdLiveDesc")}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {liveUnmatched.map((row, index) => (
                <div key={`${row.riderExtId ?? index}`} className="flex items-center gap-3 rounded-[10px] border border-[var(--warn)] bg-[var(--surface-raised)] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{row.name || "—"}</div>
                    <div className="truncate text-[11px] font-bold text-[var(--muted)]" translate="no">
                      99ID {row.riderExtId ?? "—"}{row.phone ? ` · ${row.phone}` : ""}{row.hotZone ? ` · ${row.hotZone}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => onboardFromLive(row)} className="tag shrink-0 border-[var(--accent)] text-[var(--accent)]">
                    {t("rdOnboard")}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Riders table */}
      <div className="mt-4">
        <DataTable<RiderRow>
          columns={columns}
          rows={pageRows}
          rowKey={(rider) => rider.id}
          rowAccent={(rider) => rider.pool === "pro"}
          minWidth={920}
          empty={t("rdNoResults")}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex justify-end" data-i18n-skip>
          <Pager page={safePage} pages={totalPages} total={filtered.length} onPage={setPage} />
        </div>
      )}

      {/* 模式二 T1: 批量标记 PRO 池 — 粘贴 99 名单,逐条留审计 */}
      <Drawer open={poolBulkOpen} onClose={() => setPoolBulkOpen(false)} title={<div className="text-sm font-black uppercase">{t("rdPoolBulk")}</div>} ariaLabel={t("rdPoolBulk")}>
        <div className="grid gap-2">
          <div className="text-[11px] font-bold text-[var(--muted)]">{t("rdPoolBulkHint")}</div>
          <textarea
            className={`${input} min-h-40 font-mono`}
            placeholder={"650911814078352\n650912021349691\n…"}
            value={poolBulkText}
            onChange={(e) => setPoolBulkText(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={poolBulkBusy} onClick={() => void applyPoolBulk("pro")}>
              {poolBulkBusy ? "…" : t("rdPoolBulkToPro")}
            </button>
            <button type="button" className="tag" disabled={poolBulkBusy} onClick={() => void applyPoolBulk("standard")}>
              {t("rdPoolBulkToStandard")}
            </button>
          </div>

          {/* 模式二 §9 · PRO 名单建档 —— 新 Eastwind 账号的骑手不会出现在旧
              OL 日报里,系统不会自动建档;总部把新账号名单粘进来一次,直接
              建档为 PRO。同一个抽屉两种用法:上面是"已有骑手改池",这里是
              "新骑手建档",不新增菜单。 */}
          <div className="mt-2 border-t border-[var(--line)] pt-3">
            <div className="text-[11px] font-bold text-[var(--muted)]">{t("rdProImportHint")}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input className={input} placeholder={t("rdProImportFranchise")} value={proImportFranchise} onChange={(e) => setProImportFranchise(e.target.value)} />
              <input className={input} placeholder={t("rdProImportPonto")} value={proImportPonto} onChange={(e) => setProImportPonto(e.target.value)} />
            </div>
            <button type="button" className="tag mt-2 w-full" disabled={poolBulkBusy} onClick={() => void importProRoster()}>
              {poolBulkBusy ? "…" : t("rdProImport")}
            </button>
          </div>
        </div>
      </Drawer>

      {/* New rider drawer */}
      <Drawer open={addOpen} onClose={() => setAddOpen(false)} title={<div className="text-sm font-black uppercase">{t("rdAddRider")}</div>} ariaLabel={t("rdAddRider")}>
        <div className="grid gap-2">
          <input className={input} placeholder={t("rdPhName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder="99 ID" value={form.ninetyNineId} onChange={(e) => setForm({ ...form, ninetyNineId: e.target.value.replace(/\D/g, "") })} />
          <input className={input} placeholder={t("rdPhPhone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={input} placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          <select className={input} value={form.franchise} onChange={(e) => setForm({ ...form, franchise: e.target.value })}>
            <option value="">{t("rdFranchiseOpt")}</option>
            {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
          <select className={input} value={form.ponto} onChange={(e) => setForm({ ...form, ponto: e.target.value })}>
            <option value="">{t("rdStationOpt")}</option>
            {network.stations.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <button
            type="button"
            disabled={!form.name.trim()}
            onClick={async () => {
              const response = await fetch("/api/riders", { method: "POST", headers: HEADERS, body: JSON.stringify(form) });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                setMessage({ tone: "err", text: payload.error ?? t("rdAddFailed", { s: response.status }) });
                return;
              }
              setMessage({ tone: "ok", text: t("rdAddOk", { name: form.name }) });
              setForm({ name: "", ninetyNineId: "", phone: "", cpf: "", ponto: "", franchise: "" });
              setAddOpen(false);
              void load();
            }}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
          >
            <UserPlus size={14} /> {t("rdSaveRider")}
          </button>
        </div>
      </Drawer>

      {/* Sticky confirm bar: nothing is written until the user confirms. */}
      {Object.keys(pending).length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-[var(--warning)] bg-[var(--surface)] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-black text-[var(--warning-ink)]">{t("rdPendingBar", { n: Object.keys(pending).length })}</div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} className="tag" onClick={() => setPending({})}>{t("rdDiscard")}</button>
            <button type="button" disabled={saving} onClick={() => void savePending()} className="inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50">
              {saving ? t("rdSaving") : t("rdConfirmSave")}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
