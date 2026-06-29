"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCcw, ShieldCheck, UserPlus } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { roles, type Role } from "../lib/rbac";
import { portalConfigs, type PortalId } from "../lib/portals";
import type { AppUser } from "../lib/users";
import { readSession } from "../lib/session";
import { useDialog } from "../components/dialog";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

type SafeUser = Omit<AppUser, "passwordHash" | "salt">;

const headers = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };
const portalIds = Object.keys(portalConfigs) as PortalId[];

export default function UsersPage() {
  const dialog = useDialog();
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };
  // Franchise portal: this page becomes "station accounts" scoped to itself.
  const session = useMemo(() => readSession(), []);
  const isFranchise = session?.portal === "franchise";
  const ownFranchise = session?.franchise || session?.organization || "";
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [network, setNetwork] = useState<{ franchises: Array<{ id: string; name: string }>; stations: Array<{ id: string; name: string; franchise?: string }> }>({ franchises: [], stations: [] });
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", identifier: "", phone: "", password: "", role: "Ponto Manager" as Role, portal: "ponto" as PortalId, franchise: "", station: "" });
  const [busy, setBusy] = useState(false);
  // Inline edit modal for an existing account.
  const [edit, setEdit] = useState<{ id: string; name: string; phone: string; role: Role; portal: PortalId; franchise: string; station: string } | null>(null);

  const load = useCallback(async () => {
    const [usersResponse, networkResponse] = await Promise.all([
      fetch("/api/users", { headers, cache: "no-store" }),
      fetch("/api/network", { headers, cache: "no-store" }),
    ]);
    if (usersResponse.ok) setUsers((await usersResponse.json()).data);
    if (networkResponse.ok) {
      const payload = (await networkResponse.json()).data;
      setNetwork({ franchises: payload.franchises, stations: payload.stations });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/users", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? t("usReqFailed", { s: response.status }) });
      return null;
    }
    void load();
    return payload.data;
  }

  const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";
  const allowedRoles = portalConfigs[form.portal].allowedRoles;

  return (
    <AppShell>
      <PageTitle
        title={isFranchise ? t("usTitleSt") : t("usTitleHq")}
        eyebrow={isFranchise ? t("usEyebrowFr", { f: ownFranchise }) : t("usEyebrowHq")}
        action={
          <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1">
            <RefreshCcw size={13} /> {t("usRefresh")}
          </button>
        }
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <div className="panel space-y-3 p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
            <UserPlus size={15} /> {t("usNewUser")}
          </div>
          <input className={input} placeholder={t("usName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder={t("usIdentifier")} value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
          <input className={input} placeholder={t("usPhoneOpt")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={input} type="password" placeholder={t("usPassword")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className={`grid grid-cols-2 gap-3 ${isFranchise ? "hidden" : ""}`}>
            <label className="text-[10px] font-black uppercase text-[var(--muted)]">
              {t("usSystem")}
              <select
                className={`${input} mt-1`}
                value={form.portal}
                onChange={(e) => {
                  const portal = e.target.value as PortalId;
                  const nextAllowed = portalConfigs[portal].allowedRoles;
                  setForm({ ...form, portal, role: nextAllowed.includes(form.role) ? form.role : nextAllowed[0] });
                }}
              >
                {portalIds.map((id) => (
                  <option key={id} value={id}>{portalConfigs[id].productName}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase text-[var(--muted)]">
              {t("usRole")}
              <select className={`${input} mt-1`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {roles.filter((role) => allowedRoles.includes(role)).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isFranchise ? (
              <input className={input} value={ownFranchise} disabled />
            ) : (
              <select className={input} value={form.franchise} onChange={(e) => setForm({ ...form, franchise: e.target.value, station: "" })}>
                <option value="">{t("usOwnerFranchise")}{form.portal === "franchise" ? " *" : t("usOptional")}</option>
                {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            )}
            <select className={input} value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })}>
              <option value="">{t("usOwnerStation")}{form.portal === "ponto" ? " *" : t("usOptional")}</option>
              {network.stations
                .filter((s) => {
                  const fr = isFranchise ? ownFranchise : form.franchise;
                  return !fr || s.franchise === fr;
                })
                .map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !form.name.trim() || !form.identifier.trim() || form.password.length < 6}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const result = await post({ action: "create", ...form });
              setBusy(false);
              if (result) {
                setMessage({ tone: "ok", text: t("usCreated", { id: form.identifier, portal: portalConfigs[form.portal].productName }) });
                setForm({ ...form, name: "", identifier: "", phone: "", password: "" });
              }
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            <ShieldCheck size={16} /> {t("usCreate")}
          </button>
        </div>

        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">{t("usListN", { n: users.length })}</div>
          {users.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">{t("usNoUsers")}</div>
          ) : (
            <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {users.map((user) => (
                <div key={user.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-black">
                        {user.name}
                        <Badge value={user.role} />
                        <Badge value={portalConfigs[user.portal]?.productName ?? user.portal} />
                        {user.status === "disabled" && <Badge value={t("usDisabled")} />}
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                        {user.identifier}
                        {user.franchise && ` ｜ ${user.franchise}`}
                        {user.station && ` / ${user.station}`}
                        {user.lastLoginAt && t("usLastLogin", { x: user.lastLoginAt })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="tag inline-flex items-center gap-1"
                        onClick={async () => {
                          const password = await dialog.prompt(t("usResetPw"), { message: t("usResetPwMsg", { id: user.identifier }) });
                          if (!password) return;
                          const result = await post({ action: "resetPassword", userId: user.id, password });
                          if (result) setMessage({ tone: "ok", text: t("usPwReset") });
                        }}
                      >
                        <KeyRound size={13} /> {t("usResetPw")}
                      </button>
                      <button
                        type="button"
                        className="tag"
                        onClick={async () => {
                          const next = user.status === "active" ? "disabled" : "active";
                          const result = await post({ action: "update", userId: user.id, status: next });
                          if (result) setMessage({ tone: "ok", text: next === "disabled" ? t("usDisabledMsg") : t("usEnabledMsg") });
                        }}
                      >
                        {user.status === "active" ? t("usDisable") : t("usEnable")}
                      </button>
                      <button
                        type="button"
                        className="tag"
                        onClick={() => setEdit({ id: user.id, name: user.name, phone: user.phone ?? "", role: user.role, portal: user.portal, franchise: user.franchise ?? "", station: user.station ?? "" })}
                      >
                        {t("usEdit")}
                      </button>
                      <button
                        type="button"
                        className="tag text-[var(--danger-ink)]"
                        onClick={async () => {
                          if (!(await dialog.confirm(t("usDelQ", { id: user.identifier }), { message: t("usDelMsg"), tone: "danger", confirmText: t("usDel") }))) return;
                          const result = await post({ action: "delete", userId: user.id });
                          if (result) setMessage({ tone: "ok", text: t("usDeleted", { id: user.identifier }) });
                        }}
                      >
                        {t("usDel")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 编辑账号弹窗 */}
      {edit && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--overlay)] p-4 backdrop-blur-sm" onMouseDown={() => setEdit(null)}>
          <div className="panel w-full max-w-lg space-y-3 p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">{t("usEditTitle")}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} placeholder={t("usName")} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <input className={input} placeholder={t("usPhone")} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              {!isFranchise && (
                <select
                  className={input}
                  value={edit.portal}
                  onChange={(e) => {
                    const portal = e.target.value as PortalId;
                    const allowed = portalConfigs[portal].allowedRoles;
                    setEdit({ ...edit, portal, role: allowed.includes(edit.role) ? edit.role : (allowed[0] as Role) });
                  }}
                >
                  {portalIds.map((portalId) => <option key={portalId} value={portalId}>{portalConfigs[portalId].productName}</option>)}
                </select>
              )}
              {!isFranchise && (
                <select className={input} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                  {roles.filter((role) => portalConfigs[edit.portal].allowedRoles.includes(role)).map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              )}
              {!isFranchise && (
                <select className={input} value={edit.franchise} onChange={(e) => setEdit({ ...edit, franchise: e.target.value, station: "" })}>
                  <option value="">{t("usOwnerFranchiseNone")}</option>
                  {network.franchises.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
              )}
              <select className={input} value={edit.station} onChange={(e) => setEdit({ ...edit, station: e.target.value })}>
                <option value="">{t("usOwnerStationNone")}</option>
                {network.stations
                  .filter((s) => {
                    const fr = isFranchise ? ownFranchise : edit.franchise;
                    return !fr || s.franchise === fr;
                  })
                  .map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEdit(null)} className="h-10 rounded-[8px] border border-[var(--line)] px-4 text-sm font-black text-[var(--muted-strong)]">{t("usCancel")}</button>
              <button
                type="button"
                className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]"
                onClick={async () => {
                  const result = await post({ action: "update", userId: edit.id, name: edit.name, phone: edit.phone, role: edit.role, portal: edit.portal, franchise: edit.franchise, station: edit.station });
                  if (result) {
                    setMessage({ tone: "ok", text: t("usUpdated") });
                    setEdit(null);
                  }
                }}
              >
                {t("usSave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
