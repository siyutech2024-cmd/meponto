"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCcw, ShieldCheck, UserPlus } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { Chip, DataTable, Drawer, SearchInput, Stat, StatusBadge, TodoCard, Toolbar, type DataColumn } from "../components/kit";
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
  const [createOpen, setCreateOpen] = useState(false);
  // Toolbar filters.
  const [query, setQuery] = useState("");
  const [portalFilter, setPortalFilter] = useState<PortalId | "">("");
  const [onlyDisabled, setOnlyDisabled] = useState(false);
  // Inline edit drawer for an existing account.
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

  const disabledCount = users.filter((u) => u.status === "disabled").length;
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((u) => {
      if (term && !`${u.name} ${u.identifier} ${u.phone ?? ""}`.toLowerCase().includes(term)) return false;
      if (portalFilter && u.portal !== portalFilter) return false;
      if (onlyDisabled && u.status !== "disabled") return false;
      return true;
    });
  }, [users, query, portalFilter, onlyDisabled]);

  const columns: Array<DataColumn<SafeUser>> = [
    {
      key: "name",
      label: t("usName"),
      className: "max-w-[220px]",
      render: (user) => (
        <div>
          <div className="truncate font-black">{user.name}</div>
          <div className="truncate text-[11px] font-bold text-[var(--muted)]">
            {user.identifier}
            {user.phone && ` ｜ ${user.phone}`}
          </div>
        </div>
      ),
    },
    { key: "role", label: t("usRole"), render: (user) => <StatusBadge tone="info" label={user.role} /> },
    { key: "portal", label: t("usSystem"), render: (user) => <StatusBadge tone="neutral" label={portalConfigs[user.portal]?.productName ?? user.portal} /> },
    {
      key: "owner",
      label: `${t("usOwnerFranchise")} / ${t("usOwnerStation")}`,
      render: (user) => (
        <span className="text-xs font-bold text-[var(--muted-strong)]">
          {user.franchise || "—"}
          {user.station && ` / ${user.station}`}
        </span>
      ),
    },
    {
      key: "status",
      label: t("rdColStatus"),
      render: (user) =>
        user.status === "disabled"
          ? <StatusBadge tone="danger" label={t("usDisabled")} />
          : <StatusBadge tone="success" label={t("rdEnable")} />,
    },
    {
      key: "lastLogin",
      label: t("usLastLogin", { x: "" }).replace(/[｜|]/g, "").trim(),
      render: (user) => <span className="text-xs font-bold text-[var(--muted)]">{user.lastLoginAt || "—"}</span>,
    },
    {
      key: "action",
      label: t("rdColAction"),
      align: "right",
      render: (user) => (
        <div className="flex justify-end gap-1.5">
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
      ),
    },
  ];

  return (
    <AppShell>
      <PageTitle
        title={isFranchise ? t("usTitleSt") : t("usTitleHq")}
        eyebrow={isFranchise ? t("usEyebrowFr", { f: ownFranchise }) : t("usEyebrowHq")}
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1">
              <RefreshCcw size={13} /> {t("usRefresh")}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
            >
              <UserPlus size={14} /> {t("usNewUser")}
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
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label={t("usListN", { n: users.length })} value={String(users.length)} />
        <Stat label={t("rdEnable")} value={String(users.length - disabledCount)} />
        <TodoCard label={t("usDisabled")} value={disabledCount} tone={disabledCount > 0 ? "warn" : "neutral"} active={onlyDisabled} onClick={() => setOnlyDisabled(!onlyDisabled)} />
        <Stat label={t("usSystem")} value={String(new Set(users.map((u) => u.portal)).size)} />
      </section>

      {/* Toolbar */}
      <div className="mt-4">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder={`${t("usName")} / ${t("usIdentifier")}`} />
          <Chip active={portalFilter === ""} onClick={() => setPortalFilter("")}>{t("fmChipAll")}</Chip>
          {portalIds.map((id) => (
            <Chip key={id} active={portalFilter === id} onClick={() => setPortalFilter(portalFilter === id ? "" : id)}>{portalConfigs[id].productName}</Chip>
          ))}
        </Toolbar>
      </div>

      {/* Accounts table */}
      <div className="mt-4">
        <DataTable<SafeUser>
          columns={columns}
          rows={shown}
          rowKey={(user) => user.id}
          minWidth={960}
          empty={t("usNoUsers")}
        />
      </div>

      {/* 新建账号抽屉 */}
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title={<div className="text-sm font-black uppercase">{t("usNewUser")}</div>} ariaLabel={t("usNewUser")}>
        <div className="space-y-3">
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
                setCreateOpen(false);
              }
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            <ShieldCheck size={16} /> {t("usCreate")}
          </button>
        </div>
      </Drawer>

      {/* 编辑账号抽屉 */}
      <Drawer open={edit !== null} onClose={() => setEdit(null)} title={<div className="text-sm font-black uppercase">{t("usEditTitle")}</div>} ariaLabel={t("usEditTitle")}>
        {edit && (
          <div className="space-y-3">
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
            <div className="flex justify-end gap-2 pt-1">
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
        )}
      </Drawer>
    </AppShell>
  );
}
