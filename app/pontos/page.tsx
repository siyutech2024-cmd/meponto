"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Plus, QrCode, RefreshCcw, Store, Trash2, UserRound } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { DataTable, Drawer, SearchInput, SectionCard, Stat, StatusBadge, TodoCard, Toolbar, type DataColumn } from "../components/kit";
import { readSession } from "../lib/session";
import { useDialog } from "../components/dialog";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import type { Franchise } from "../lib/network";
import type { Ponto } from "../lib/data";

type FranchiseRow = Franchise & { stationCount: number };

const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

export default function NetworkPage() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);
  const franchiseScope = session?.portal === "franchise" ? session.franchise || session.organization : "";

  const [franchises, setFranchises] = useState<FranchiseRow[]>([]);
  const [stations, setStations] = useState<Ponto[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [franchiseForm, setFranchiseForm] = useState({ name: "", owner: "", phone: "", city: "São Paulo" });
  const [stationForm, setStationForm] = useState({ name: "", franchise: "", address: "", mapUrl: "", leader: "" });
  const [stationOpen, setStationOpen] = useState(false);
  const [franchiseOpen, setFranchiseOpen] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/network", { headers, cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setFranchises(payload.data.franchises);
      setStations(payload.data.stations);
    }
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/network", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("pnOpFailed", { s: response.status }) });
      return null;
    }
    void load();
    return payload;
  }

  /** Delete a station; on 409 offer the super-admin force flow (riders become unassigned). */
  async function deleteStation(station: Ponto) {
    if (!(await dialog.confirm(t("pnDelStQ", { name: station.name }), { tone: "danger", confirmText: t("pnDel") }))) return;
    const response = await fetch("/api/network", { method: "POST", headers, body: JSON.stringify({ action: "deleteStation", stationId: station.id }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setMessage({ tone: "ok", text: t("pnStDeleted", { name: station.name }) });
      void load();
      return;
    }
    // Riders still bound: offer force-delete (riders become unassigned).
    if (response.status === 409 && payload.canForce) {
      if (await dialog.confirm(t("pnForceDelStQ"), { message: t("pnForceDelStMsg", { err: payload.error }), tone: "danger", confirmText: t("pnForceDel") })) {
        const r2 = await post({ action: "deleteStation", stationId: station.id, force: true });
        if (r2) setMessage({ tone: "ok", text: t("pnStDeleted", { name: station.name }) });
      }
      return;
    }
    setMessage({ tone: "err", text: payload.error ?? t("pnDelFailed", { s: response.status }) });
  }

  const [stationQuery, setStationQuery] = useState("");
  const scopedStations = franchiseScope ? stations.filter((s) => s.franchise === franchiseScope) : stations;
  const pendingCount = scopedStations.filter((s) => s.status === "pending").length;
  const shownStations = scopedStations.filter(
    (s) =>
      (!onlyPending || s.status === "pending") &&
      (!stationQuery.trim() || s.name.toLowerCase().includes(stationQuery.trim().toLowerCase()) || (s.franchise ?? "").toLowerCase().includes(stationQuery.trim().toLowerCase())),
  );
  const isHq = !franchiseScope;

  const ridersLabel = t("pnRiders", { n: "" }).trim();
  const safetyLabel = t("pnSafety", { n: "" }).replace("/100", "").trim();

  const columns: Array<DataColumn<Ponto>> = [
    {
      key: "station",
      label: t("rdColStation"),
      className: "max-w-[220px]",
      render: (station) => (
        <div>
          <div className="truncate font-black">{station.name}</div>
          <div className="truncate text-[11px] font-bold text-[var(--muted)]">{station.bairro}</div>
        </div>
      ),
    },
    {
      key: "franchise",
      label: t("rdColFranchise"),
      render: (station) =>
        station.franchise
          ? <StatusBadge tone="neutral" label={station.franchise} />
          : <StatusBadge tone="danger" label={t("pnUnbound")} />,
    },
    {
      key: "address",
      label: <MapPin size={13} />,
      className: "max-w-[240px]",
      render: (station) =>
        station.address ? (
          <a
            href={station.mapUrl?.trim() || `https://maps.google.com/maps?q=${encodeURIComponent(station.address)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-start gap-1.5 text-xs font-bold text-[var(--muted-strong)] hover:text-[var(--accent)]"
          >
            <MapPin size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <span className="truncate">{station.address}</span>
          </a>
        ) : (
          <span className="text-xs font-bold text-[var(--muted)]">—</span>
        ),
    },
    {
      key: "leader",
      label: t("pnStLeaderPh"),
      render: (station) => (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--muted-strong)]"><UserRound size={12} /> {station.leader || "—"}</span>
      ),
    },
    { key: "riders", label: ridersLabel, align: "right", render: (station) => <span className="font-black">{station.ridersCount}</span> },
    {
      key: "safety",
      label: safetyLabel,
      align: "right",
      render: (station) => <span className={`font-black ${station.safetyScore < 70 ? "text-[var(--danger-ink)]" : ""}`}>{station.safetyScore}/100</span>,
    },
    {
      key: "status",
      label: t("rdColStatus"),
      render: (station) =>
        station.status === "pending"
          ? <StatusBadge tone="warn" label={t("pnPendingReview")} />
          : <StatusBadge tone="success" label={t("dpStApproved")} />,
    },
    {
      key: "action",
      label: t("rdColAction"),
      align: "right",
      render: (station) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <a href={`/pontos/${station.id}`} className="tag inline-flex items-center gap-1" title="签到二维码 · QR de check-in">
            <QrCode size={12} /> QR
          </a>
          {station.status === "pending" && isHq && (
            <>
              <button
                type="button"
                className="tag border-[var(--accent)] text-[var(--accent)]"
                onClick={async () => {
                  const r = await post({ action: "approveStation", stationId: station.id });
                  if (r) setMessage({ tone: "ok", text: t("pnApproved", { name: station.name }) });
                }}
              >
                {t("pnApprove")}
              </button>
              <button
                type="button"
                className="tag text-[var(--danger-ink)]"
                onClick={async () => {
                  if (!(await dialog.confirm(t("pnRejectStQ", { name: station.name }), { tone: "danger", confirmText: t("pnReject") }))) return;
                  const r = await post({ action: "rejectStation", stationId: station.id });
                  if (r) setMessage({ tone: "ok", text: t("pnRejected") });
                }}
              >
                {t("pnReject")}
              </button>
            </>
          )}
          {isHq && (
            <>
              <button
                type="button"
                className="tag"
                onClick={async () => {
                  const address = await dialog.prompt(t("pnEditAddrTitle"), { defaultValue: station.address ?? "", placeholder: "Rua ... , São Paulo" });
                  if (address === null) return;
                  const mapUrl = (await dialog.prompt(t("pnMapPromptTitle"), { defaultValue: station.mapUrl ?? "" })) ?? "";
                  const r = await post({ action: "updateStation", stationId: station.id, address, mapUrl });
                  if (r) setMessage({ tone: "ok", text: t("pnLocUpdated") });
                }}
              >
                {t("pnEditLoc")}
              </button>
              <button
                type="button"
                className="tag"
                onClick={async () => {
                  const next = await dialog.prompt(t("pnMigrateTitle"), { message: t("pnMigrateMsg", { name: station.name, list: franchises.map((f) => f.name).join(" / ") }), defaultValue: station.franchise ?? "" });
                  if (!next?.trim()) return;
                  const r = await post({ action: "updateStation", stationId: station.id, franchise: next.trim() });
                  if (r) setMessage({ tone: "ok", text: t("pnBoundTo", { x: next.trim() }) });
                }}
              >
                {t("pnChangeParent")}
              </button>
              {session?.role === "Super Admin" && (
                <button type="button" className="tag text-[var(--danger-ink)]" onClick={() => void deleteStation(station)}>
                  {t("pnDel")}
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageTitle
        title={t("pnTitle")}
        eyebrow={isHq ? t("pnEyebrowHq") : t("pnEyebrowFr", { f: franchiseScope })}
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pnRefresh")}</button>
            <button
              type="button"
              onClick={() => setStationOpen(true)}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
            >
              <Plus size={14} /> {t("pnCreateStation")}
            </button>
          </div>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {isHq && <Stat label={t("rdColFranchise")} value={String(franchises.length)} />}
        <Stat label={t("rdColStation")} value={String(scopedStations.length)} />
        <Stat label={ridersLabel} value={String(scopedStations.reduce((sum, s) => sum + s.ridersCount, 0))} />
        <TodoCard
          label={t("pnPendingReview")}
          value={pendingCount}
          tone={pendingCount > 0 ? "warn" : "neutral"}
          active={onlyPending}
          onClick={() => setOnlyPending(!onlyPending)}
        />
      </section>

      {/* Franchise cards (HQ only) */}
      {isHq && (
        <SectionCard
          title={<span className="inline-flex items-center gap-2"><Building2 size={14} /> {t("pnFranchisesN", { n: franchises.length })}</span>}
          right={
            <button type="button" onClick={() => setFranchiseOpen(true)} className="tag inline-flex items-center gap-1">
              <Plus size={13} /> {t("pnAddFr")}
            </button>
          }
          className="mb-4"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {franchises.map((franchise) => (
              <div key={franchise.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-[var(--line-strong)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-black">{franchise.name}</div>
                  <button
                    type="button"
                    title={t("pnDelHint")}
                    onClick={async () => {
                      if (!(await dialog.confirm(t("pnDelFrQ", { name: franchise.name }), { tone: "danger", confirmText: t("pnDel") }))) return;
                      const response = await fetch("/api/network", { method: "POST", headers, body: JSON.stringify({ action: "deleteFranchise", franchiseId: franchise.id }) });
                      const payload = await response.json().catch(() => ({}));
                      if (response.ok) {
                        setMessage({ tone: "ok", text: t("pnDeleted", { name: franchise.name }) });
                        void load();
                        return;
                      }
                      // Bound stations: offer force-delete (stations become unbound).
                      if (response.status === 409 && payload.canForce) {
                        if (await dialog.confirm(t("pnForceDelQ"), { message: t("pnForceDelMsg", { err: payload.error }), tone: "danger", confirmText: t("pnForceDel") })) {
                          const r2 = await post({ action: "deleteFranchise", franchiseId: franchise.id, force: true });
                          if (r2) setMessage({ tone: "ok", text: t("pnDeletedUnbound", { name: franchise.name, n: r2.data?.unbound ?? 0 }) });
                        }
                        return;
                      }
                      setMessage({ tone: "err", text: payload.error ?? t("pnDelFailed", { s: response.status }) });
                    }}
                    className="shrink-0 text-[var(--muted)] hover:text-[var(--danger-ink)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1 truncate text-[11px] font-bold text-[var(--muted)]">
                  {franchise.owner || "—"}{franchise.phone && ` ｜ ${franchise.phone}`} ｜ {franchise.city}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={franchise.stationCount > 0 ? "info" : "neutral"} label={t("pnStationsN", { n: franchise.stationCount })} />
                  <span className={`text-[11px] font-black ${(franchise.depositBalance ?? 0) < 0 ? "text-[var(--danger-ink)]" : "text-[var(--accent)]"}`}>
                    {t("pnDeposit", { x: (franchise.depositBalance ?? 0).toFixed(2) })}{(franchise.depositBalance ?? 0) < 0 && t("pnDepositDebt")}
                  </span>
                  <button
                    type="button"
                    className="tag"
                    onClick={async () => {
                      const raw = await dialog.prompt(t("pnTopUpTitle"), { message: t("pnTopUpMsg", { name: franchise.name }), placeholder: t("pnTopUpPh") });
                      const amount = Number(raw);
                      if (!raw || !Number.isFinite(amount) || amount === 0) return;
                      const r = await post({ action: "depositFranchise", franchiseId: franchise.id, amount, note: t("pnTopUpNote") });
                      if (r) setMessage({ tone: "ok", text: t("pnDepositUpdated", { name: franchise.name, x: Number(r.data?.depositBalance ?? 0).toFixed(2) }) });
                    }}
                  >
                    {t("pnTopUp")}
                  </button>
                  <button
                    type="button"
                    className={`tag ${franchise.leaderMode ? "border-[var(--ok-ink)]/50 text-[var(--ok-ink)]" : ""}`}
                    onClick={async () => {
                      const enabled = !franchise.leaderMode;
                      const ok = await dialog.confirm(
                        t(enabled ? "pnLmOnQ" : "pnLmOffQ", { name: franchise.name }),
                        enabled ? { message: t("pnLmOnMsg") } : { message: t("pnLmOffMsg"), tone: "danger" },
                      );
                      if (!ok) return;
                      const r = await post({ action: "setLeaderMode", franchiseId: franchise.id, enabled });
                      if (r) {
                        setMessage({ tone: "ok", text: t("pnLmDone", { name: franchise.name, state: enabled ? "ON" : "OFF" }) });
                        void load();
                      }
                    }}
                  >
                    {t("pnLeaderMode")}{franchise.leaderMode ? " ✓" : ""}
                  </button>
                </div>
              </div>
            ))}
            {franchises.length === 0 && <div className="text-sm font-bold text-[var(--muted)]">{t("pnNoFranchises")}</div>}
          </div>
        </SectionCard>
      )}

      {/* Station toolbar */}
      <Toolbar
        right={<span className="text-xs font-bold text-[var(--muted)]" data-i18n-skip>{shownStations.length}</span>}
      >
        <SearchInput value={stationQuery} onChange={setStationQuery} placeholder={t("pnSearchPh")} className="w-72" />
      </Toolbar>

      {/* Station table */}
      <div className="mt-4">
        <DataTable<Ponto>
          columns={columns}
          rows={shownStations}
          rowKey={(station) => station.id}
          minWidth={1080}
          empty={t("pnNoStations")}
        />
      </div>

      {/* 新增站点抽屉 */}
      <Drawer
        open={stationOpen}
        onClose={() => setStationOpen(false)}
        title={<div className="inline-flex items-center gap-2 text-sm font-black uppercase"><Store size={14} /> {t("pnAddStationTitle")}</div>}
        ariaLabel={t("pnAddStationTitle")}
      >
        <div className="grid gap-3">
          <input className={input} placeholder={t("pnStNamePh")} value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} />
          <select className={input} value={stationForm.franchise} onChange={(e) => setStationForm({ ...stationForm, franchise: e.target.value })}>
            <option value="">{t("pnStParentPh")}</option>
            {franchises.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
          <input className={input} placeholder={t("pnStAddrPh")} value={stationForm.address} onChange={(e) => setStationForm({ ...stationForm, address: e.target.value })} />
          <input className={input} placeholder={t("pnStMapPh")} value={stationForm.mapUrl} onChange={(e) => setStationForm({ ...stationForm, mapUrl: e.target.value })} />
          <input className={input} placeholder={t("pnStLeaderPh")} value={stationForm.leader} onChange={(e) => setStationForm({ ...stationForm, leader: e.target.value })} />
          <button
            type="button"
            disabled={!stationForm.name.trim() || !stationForm.franchise || (!stationForm.address.trim() && !stationForm.mapUrl.trim())}
            onClick={async () => {
              const r = await post({ action: "addStation", ...stationForm });
              if (r) {
                setMessage({
                  tone: "ok",
                  text: r.pendingApproval
                    ? t("pnStPending", { name: stationForm.name })
                    : t("pnStCreated", { name: stationForm.name, f: stationForm.franchise }),
                });
                setStationForm({ name: "", franchise: "", address: "", mapUrl: "", leader: "" });
                setStationOpen(false);
              }
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            <Plus size={15} /> {t("pnCreateStation")}
          </button>
        </div>
      </Drawer>

      {/* 新增加盟商抽屉 (HQ) */}
      <Drawer
        open={franchiseOpen}
        onClose={() => setFranchiseOpen(false)}
        title={<div className="inline-flex items-center gap-2 text-sm font-black uppercase"><Building2 size={14} /> {t("pnAddFr")}</div>}
        ariaLabel={t("pnAddFr")}
      >
        <div className="grid gap-3">
          <input className={input} placeholder={t("pnFrNamePh")} value={franchiseForm.name} onChange={(e) => setFranchiseForm({ ...franchiseForm, name: e.target.value })} />
          <input className={input} placeholder={t("pnFrOwnerPh")} value={franchiseForm.owner} onChange={(e) => setFranchiseForm({ ...franchiseForm, owner: e.target.value })} />
          <input className={input} placeholder={t("pnFrPhonePh")} value={franchiseForm.phone} onChange={(e) => setFranchiseForm({ ...franchiseForm, phone: e.target.value })} />
          <input className={input} placeholder={t("pnFrCityPh")} value={franchiseForm.city} onChange={(e) => setFranchiseForm({ ...franchiseForm, city: e.target.value })} />
          <button
            type="button"
            disabled={!franchiseForm.name.trim()}
            onClick={async () => {
              const r = await post({ action: "addFranchise", ...franchiseForm });
              if (r) {
                setMessage({ tone: "ok", text: t("pnFrCreated", { name: franchiseForm.name }) });
                setFranchiseForm({ name: "", owner: "", phone: "", city: "São Paulo" });
                setFranchiseOpen(false);
              }
            }}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] px-6 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            <Plus size={14} /> {t("pnAddFr")}
          </button>
        </div>
      </Drawer>
    </AppShell>
  );
}
