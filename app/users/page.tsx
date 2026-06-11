"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCcw, ShieldCheck, UserPlus } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { roles, type Role } from "../lib/rbac";
import { portalConfigs, type PortalId } from "../lib/portals";
import type { AppUser } from "../lib/users";
import { readSession } from "../lib/session";

type SafeUser = Omit<AppUser, "passwordHash" | "salt">;

const headers = { "Content-Type": "application/json", "x-vento-role": "Super Admin" };
const portalIds = Object.keys(portalConfigs) as PortalId[];

export default function UsersPage() {
  // Franchise portal: this page becomes "station accounts" scoped to itself.
  const session = useMemo(() => readSession(), []);
  const isFranchise = session?.portal === "franchise";
  const ownFranchise = session?.franchise || session?.organization || "";
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", identifier: "", phone: "", password: "", role: "Ponto Manager" as Role, portal: "ponto" as PortalId, franchise: "", station: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/users", { headers, cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setUsers(payload.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/users", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `请求失败 (${response.status})` });
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
        title={isFranchise ? "站点账号" : "用户与权限"}
        eyebrow={isFranchise ? `为 ${ownFranchise} 下属站点配置登录账号` : "多用户账号 · 角色 · 系统归属"}
        action={
          <button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1">
            <RefreshCcw size={13} /> 刷新
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
            <UserPlus size={15} /> 新建用户
          </div>
          <input className={input} placeholder="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder="登录邮箱或手机号" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
          <input className={input} placeholder="联系电话（选填）" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={input} type="password" placeholder="初始密码（至少 6 位）" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className={`grid grid-cols-2 gap-3 ${isFranchise ? "hidden" : ""}`}>
            <label className="text-[10px] font-black uppercase text-[var(--muted)]">
              所属系统
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
              角色
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
              <input className={input} placeholder="所属加盟商（选填）" value={form.franchise} onChange={(e) => setForm({ ...form, franchise: e.target.value })} />
            )}
            <input className={input} placeholder={isFranchise ? "站点名称 *" : "所属站点（选填）"} value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} />
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
                setMessage({ tone: "ok", text: `用户 ${form.identifier} 已创建，可立即登录 ${portalConfigs[form.portal].productName}。` });
                setForm({ ...form, name: "", identifier: "", phone: "", password: "" });
              }
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            <ShieldCheck size={16} /> 创建账号
          </button>
        </div>

        <div className="panel p-5">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">账号列表（{users.length}）</div>
          {users.length === 0 ? (
            <div className="text-sm font-bold text-[var(--muted)]">还没有自建账号；演示账号不在此列表。</div>
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
                        {user.status === "disabled" && <Badge value="已停用" />}
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                        {user.identifier}
                        {user.franchise && ` ｜ ${user.franchise}`}
                        {user.station && ` / ${user.station}`}
                        {user.lastLoginAt && ` ｜ 最近登录 ${user.lastLoginAt}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="tag inline-flex items-center gap-1"
                        onClick={async () => {
                          const password = window.prompt(`为 ${user.identifier} 设置新密码（至少 6 位）：`);
                          if (!password) return;
                          const result = await post({ action: "resetPassword", userId: user.id, password });
                          if (result) setMessage({ tone: "ok", text: "密码已重置。" });
                        }}
                      >
                        <KeyRound size={13} /> 重置密码
                      </button>
                      <button
                        type="button"
                        className="tag"
                        onClick={async () => {
                          const next = user.status === "active" ? "disabled" : "active";
                          const result = await post({ action: "update", userId: user.id, status: next });
                          if (result) setMessage({ tone: "ok", text: next === "disabled" ? "账号已停用。" : "账号已启用。" });
                        }}
                      >
                        {user.status === "active" ? "停用" : "启用"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
