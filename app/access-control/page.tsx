"use client";

import { Check, X } from "lucide-react";
import { AppShell, Badge, DataTable, PageTitle } from "../components/ui";
import { can, permissionLabels, rolePermissions, roles, type Permission, type Role } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

const permissions = Object.keys(permissionLabels) as Permission[];

export default function AccessControlPage() {
  const currentRole = useVentoStore((state) => state.currentRole);
  const setRole = useVentoStore((state) => state.setRole);

  return (
    <AppShell>
      <PageTitle title="Access Control" eyebrow="RBAC matrix" />
      <section className="mb-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="panel p-4">
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">Active session role</div>
          <select
            value={currentRole}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-11 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 font-black outline-none"
          >
            {roles.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
          <div className="mt-4 flex flex-wrap gap-2">
            {rolePermissions[currentRole].map((permission) => (
              <Badge key={permission} value={permissionLabels[permission]} />
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <div className="mb-2 text-xs font-black uppercase text-[var(--muted)]">Permission summary</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {permissions.map((permission) => (
              <div key={permission} className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface)] p-3">
                <span className="text-sm font-black">{permissionLabels[permission]}</span>
                {can(currentRole, permission) ? <Check className="text-[#06d6a0]" size={18} /> : <X className="text-[#f43f5e]" size={18} />}
              </div>
            ))}
          </div>
        </div>
      </section>
      <DataTable
        headers={["Role", ...permissions.map((permission) => permissionLabels[permission])]}
        rows={roles.map((role) => [
          <span key="role" className={role === currentRole ? "font-black text-[var(--accent)]" : "font-black"}>{role}</span>,
          ...permissions.map((permission) =>
            can(role, permission) ? (
              <Check key={permission} className="text-[#06d6a0]" size={18} />
            ) : (
              <X key={permission} className="text-[#f43f5e]" size={18} />
            ),
          ),
        ])}
      />
    </AppShell>
  );
}
