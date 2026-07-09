"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Plus, RefreshCcw, Store, Trash2, UserRound } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import { useDialog } from "../components/dialog";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import { mapsEmbedUrl, type Franchise } from "../lib/network";
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

  const [stationQuery, setStationQuery] = useState("");
  const shownStations = (franchiseScope ? stations.filter((s) => s.franchise === franchiseScope) : stations).filter(
    (s) => !stationQuery.trim() || s.name.toLowerCase().includes(stationQuery.trim().toLowerCase()) || (s.franchise ?? "").toLowerCase().includes(stationQuery.trim().toLowerCase()),
  );
  const isHq = !franchiseScope;

  return (
    <AppShell>
      <PageTitle
        title={t("pnTitle")}
        eyebrow={isHq ? t("pnEyebrowHq") : t("pnEyebrowFr", { f: franchiseScope })}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> {t("pnRefresh")}</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {isHq && (
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Building2 size={14} /> {t("pnFranchisesN", { n: franchises.length })}</div>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {franchises.map((franchise) => (
              <div key={franchise.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black">{franchise.name}</div>
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
                    className="text-[var(--muted)] hover:text-[var(--danger-ink)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                  {franchise.owner || "—"}{franchise.phone && ` ｜ ${franchise.phone}`} ｜ {franchise.city}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge value={t("pnStationsN", { n: franchise.stationCount })} />
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
                </div>
              </div>
            ))}
            {franchises.length === 0 && <div className="text-sm font-bold text-[var(--muted)]">{t("pnNoFranchises")}</div>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
                }
              }}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
            >
              <Plus size={14} /> {t("pnAddFr")}
            </button>
          </div>
        </div>
      )}

      <div className="panel mb-4 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Store size={14} /> {t("pnAddStationTitle")}</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input className={input} placeholder={t("pnStNamePh")} value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} />
          <select className={input} value={stationForm.franchise} onChange={(e) => setStationForm({ ...stationForm, franchise: e.target.value })}>
            <option value="">{t("pnStParentPh")}</option>
            {franchises.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
          <input className={`${input} lg:col-span-2`} placeholder={t("pnStAddrPh")} value={stationForm.address} onChange={(e) => setStationForm({ ...stationForm, address: e.target.value })} />
          <input className={input} placeholder={t("pnStMapPh")} value={stationForm.mapUrl} onChange={(e) => setStationForm({ ...stationForm, mapUrl: e.target.value })} />
          <input className={input} placeholder={t("pnStLeaderPh")} value={stationForm.leader} onChange={(e) => setStationForm({ ...stationForm, leader: e.target.value })} />
        </div>
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
            }
          }}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
        >
          <Plus size={15} /> {t("pnCreateStation")}
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          value={stationQuery}
          onChange={(e) => setStationQuery(e.target.value)}
          placeholder={t("pnSearchPh")}
          className="h-11 w-full max-w-sm rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]"
        />
        <span className="shrink-0 text-xs font-bold text-[var(--muted)]" data-i18n-skip>{shownStations.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shownStations.map((station) => {
          const embed = mapsEmbedUrl(station.address, station.mapUrl);
          return (
            <div key={station.id} className="panel overflow-hidden p-0">
              {embed ? (
                <iframe src={embed} title={`Mapa ${station.name}`} loading="lazy" className="h-44 w-full border-0 grayscale-[0.25] contrast-[1.05]" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <div className="grid h-44 w-full place-items-center bg-gradient-to-br from-[var(--accent-glow)] to-[var(--surface-raised)] text-[var(--accent)]">
                  <MapPin size={36} />
                </div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black">{station.name}</span>
                  <Badge value={station.franchise || t("pnUnbound")} />
                  <span className="tag">{station.bairro}</span>
                  {station.status === "pending" && <span className="tag border-[var(--warning)] text-[var(--warning-ink)]">{t("pnPendingReview")}</span>}
                </div>
                {station.status === "pending" && isHq && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)]"
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
                  </div>
                )}
                {station.address && (
                  <a
                    href={station.mapUrl?.trim() || `https://maps.google.com/maps?q=${encodeURIComponent(station.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-1.5 text-[12px] font-bold text-[var(--muted-strong)] hover:text-[var(--accent)]"
                  >
                    <MapPin size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {station.address}
                  </a>
                )}
                <div className="flex items-center gap-3 text-[11px] font-bold text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1"><UserRound size={12} /> {station.leader || "—"}</span>
                  <span>{t("pnRiders", { n: station.ridersCount })}</span>
                  <span>{t("pnSafety", { n: station.safetyScore })}</span>
                </div>
                {isHq && (
                  <div className="flex gap-2 pt-1">
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
                      <button
                        type="button"
                        className="tag text-[var(--danger-ink)]"
                        onClick={async () => {
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
                        }}
                      >
                        {t("pnDel")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {shownStations.length === 0 && <div className="panel p-6 text-sm font-bold text-[var(--muted)]">{t("pnNoStations")}</div>}
      </div>
    </AppShell>
  );
}
