"use client";

import { Check, X } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { SectionCard } from "../components/kit";
import { can, permissionLabels, rolePermissions, roles, type Permission, type Role } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

const permissions = Object.keys(permissionLabels) as Permission[];

const Allowed = ({ size = 16 }: { size?: number }) => <Check className="inline-block text-[var(--success)]" size={size} />;
const Denied = ({ size = 16 }: { size?: number }) => <X className="inline-block text-[var(--danger)]" size={size} />;

export default function AccessControlPage() {
  const currentRole = useVentoStore((state) => state.currentRole);
  const setRole = useVentoStore((state) => state.setRole);

  return (
    <AppShell>
      <PageTitle title="Access Control" eyebrow="RBAC matrix" />

      <section className="mb-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="Active session role" desc="Switch role to preview its permissions">
          <select
            value={currentRole}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 font-black outline-none focus:border-[var(--accent)]"
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
        </SectionCard>

        <SectionCard title="Permission summary" desc={`What "${currentRole}" can do right now`}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {permissions.map((permission) => (
              <div key={permission} className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
                <span className="text-sm font-black">{permissionLabels[permission]}</span>
                {can(currentRole, permission) ? <Allowed size={18} /> : <Denied size={18} />}
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Role × permission matrix" desc="Read-only — roles and grants are defined in the shared RBAC model">
        <div className="overflow-x-auto rounded-[8px] border border-[var(--line)]">
          <table className="w-full text-xs" style={{ minWidth: 720 }}>
            <thead>
              <tr className="text-left text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="px-2 py-2">Role</th>
                {permissions.map((permission) => (
                  <th key={permission} className="px-2 py-2 text-center">{permissionLabels[permission]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role} className={`border-t border-[var(--line)] ${role === currentRole ? "bg-[var(--surface-raised)]" : ""}`}>
                  <td className={`whitespace-nowrap px-2 py-2 font-black ${role === currentRole ? "text-[var(--accent)]" : ""}`}>{role}</td>
                  {permissions.map((permission) => (
                    <td key={permission} className="px-2 py-2 text-center">
                      {can(role, permission) ? <Allowed size={14} /> : <Denied size={14} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
