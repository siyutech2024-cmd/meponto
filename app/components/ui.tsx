"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bike,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  DatabaseBackup,
  FileText,
  FileBarChart2,
  Handshake,
  LayoutDashboard,
  LogOut,
  MapPinned,
  MessageCircle,
  Moon,
  Plus,
  RadioTower,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BrandLockup } from "./brand";
import { languages, translate, type Language, type TranslationKey } from "../lib/i18n";
import { getNotificationStatus } from "../lib/notifications";
import { can, roles, type Permission, type Role } from "../lib/rbac";
import { useVentoStore } from "../lib/store";

const navItems: Array<{ href: string; labelKey: TranslationKey; icon: React.ComponentType<{ size?: number }> }> = [
  { href: "/dashboard", labelKey: "navDashboard", icon: LayoutDashboard },
  { href: "/riders", labelKey: "navRiders", icon: Bike },
  { href: "/pontos", labelKey: "navPontos", icon: MapPinned },
  { href: "/territory", labelKey: "navTerritory", icon: MapPinned },
  { href: "/leaders", labelKey: "navLeaders", icon: Users },
  { href: "/mobile", labelKey: "navMobile", icon: Smartphone },
  { href: "/whatsapp", labelKey: "navWhatsapp", icon: MessageCircle },
  { href: "/incidents", labelKey: "navIncidents", icon: ShieldAlert },
  { href: "/rewards", labelKey: "navRewards", icon: CircleDollarSign },
  { href: "/finance", labelKey: "navFinance", icon: CircleDollarSign },
  { href: "/crm", labelKey: "navCrm", icon: Handshake },
  { href: "/night-shift", labelKey: "navNightShift", icon: Moon },
  { href: "/analytics", labelKey: "navAnalytics", icon: BarChart3 },
  { href: "/reports", labelKey: "navReports", icon: FileBarChart2 },
  { href: "/realtime", labelKey: "navRealtime", icon: RadioTower },
  { href: "/sops", labelKey: "navSops", icon: FileText },
  { href: "/tools", labelKey: "navTools", icon: DatabaseBackup },
  { href: "/audit", labelKey: "navAudit", icon: ClipboardList },
  { href: "/access-control", labelKey: "navAccessControl", icon: ShieldCheck },
  { href: "/security", labelKey: "navSecurity", icon: ShieldQuestion },
  { href: "/settings", labelKey: "navSettings", icon: Settings },
];

const roleLabels: Record<Language, Record<Role, string>> = {
  en: {
    "Super Admin": "Super Admin",
    "Regional Manager": "Regional Manager",
    "Ponto Manager": "Ponto Manager",
    Leader: "Leader",
    Finance: "Finance",
    Support: "Support",
  },
  zh: {
    "Super Admin": "总部管理员",
    "Regional Manager": "区域经理",
    "Ponto Manager": "Ponto经理",
    Leader: "Leader",
    Finance: "财务",
    Support: "支持",
  },
  pt: {
    "Super Admin": "Super Admin",
    "Regional Manager": "Gerente Regional",
    "Ponto Manager": "Gerente de Ponto",
    Leader: "Líder",
    Finance: "Financeiro",
    Support: "Suporte",
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const language = useVentoStore((state) => state.language);
  const setLanguage = useVentoStore((state) => state.setLanguage);
  const currentRole = useVentoStore((state) => state.currentRole);
  const setRole = useVentoStore((state) => state.setRole);
  const resetDemoData = useVentoStore((state) => state.resetDemoData);
  const notifications = useVentoStore((state) => state.notifications);
  const markNotificationRead = useVentoStore((state) => state.markNotificationRead);
  const acknowledgeNotification = useVentoStore((state) => state.acknowledgeNotification);
  const auditLog = useVentoStore((state) => state.auditLog);
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);
  const canReset = can(currentRole, "reset_demo");
  const t = (key: TranslationKey) => translate(language, key);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr] bg-[#0a0a12]">
      <aside className="border-b border-[#2a2a4a] bg-[#0d0d1a] lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-20 items-center px-5">
          <BrandLockup />
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 shrink-0 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-semibold text-[#c4c4d4] hover:border-[#8b5cf6]/20 hover:bg-[#1a1a2e]/60 hover:text-[#8b5cf6] transition-all duration-200"
              >
                <Icon size={18} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-[#2a2a4a] bg-[#0d0d1a]/80 backdrop-blur-md px-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{t("currentRegion")}</div>
            <div className="text-lg font-black font-[family-name:var(--font-outfit)] bg-gradient-to-r from-white to-[#c4c4d4] bg-clip-text text-transparent">{t("regionName")}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconButton label={t("notifications")} onClick={() => setNotificationsOpen(true)}>
                <Bell size={18} />
              </IconButton>
              {unreadCount ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-[#0d0d1a] bg-[#f43f5e] px-1 text-[10px] font-black text-white animate-pulse">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            <IconButton label={canReset ? t("resetDemoData") : t("resetRequiresSuperAdmin")} onClick={canReset ? resetDemoData : undefined} disabled={!canReset}>
              <RotateCcw size={18} />
            </IconButton>
            <select
              data-i18n-skip
              aria-label={t("language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="h-10 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] px-2 text-sm font-bold text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
            <select
              data-i18n-skip
              aria-label="Current role"
              value={currentRole}
              onChange={(event) => setRole(event.target.value as Role)}
              className="h-10 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] px-2 text-sm font-bold text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[language][role]}
                </option>
              ))}
            </select>
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] text-sm font-bold text-[#8b5cf6]">
              {currentRole
                .split(" ")
                .map((word) => word[0])
                .join("")}
            </div>
            <Link
              href="/login"
              className="flex h-10 items-center gap-2 rounded-lg border border-[#2a2a4a] px-3 text-sm font-semibold text-[#8b8ba3] hover:text-white hover:border-[#f43f5e]/50 hover:bg-[#f43f5e]/10 transition-all duration-200"
            >
              <LogOut size={17} />
              {t("logout")}
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 animate-fade-in">{children}</div>
      </main>
      {notificationsOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <aside className="h-full w-full max-w-md flex flex-col border-l border-[#2a2a4a] bg-[#0d0d1a]/95 backdrop-blur-lg shadow-2xl animate-slide-up">
            <div className="flex min-h-16 items-center justify-between border-b border-[#2a2a4a] px-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#8b5cf6]">{t("operations")}</div>
                <h2 className="text-xl font-bold font-[family-name:var(--font-outfit)]">{t("notifications")}</h2>
              </div>
              <IconButton label={t("closeNotifications")} onClick={() => setNotificationsOpen(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="space-y-4 overflow-y-auto p-4 flex-1">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{t("operationsQueue")}</div>
                <div className="space-y-2">
                  {notifications.length ? (
                    notifications.map((notification) => {
                      const status = getNotificationStatus(notification);
                      return (
                        <div
                          key={notification.id}
                          className={`rounded-xl border p-3 transition-all duration-200 ${
                            notification.acknowledgedAt ? "border-[#2a2a4a] bg-[#1a1a2e]/40" : "border-[#2a2a4a] bg-[#1a1a2e]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Link
                              href={notification.href}
                              onClick={() => {
                                markNotificationRead(notification.id);
                                setNotificationsOpen(false);
                              }}
                              className="min-w-0 flex-1"
                            >
                              <span className="block font-bold text-sm text-[#f0f0ff]">{notification.title}</span>
                              <span className="mt-1 block text-xs text-[#8b8ba3]">{notification.body}</span>
                            </Link>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <Badge value={notification.severity} />
                              <Badge value={status} />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[10px] text-[#8b8ba3]">{notification.createdAt}</span>
                            <button
                              type="button"
                              disabled={Boolean(notification.acknowledgedAt)}
                              onClick={() => acknowledgeNotification(notification.id)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2a2a4a] px-2.5 text-[11px] font-bold text-[#c4c4d4] hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <CheckCheck size={14} />
                              {t("ack")}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-3 text-xs text-[#8b8ba3]">{t("noActiveNotifications")}</div>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{t("latestAuditEvents")}</div>
                <div className="space-y-2">
                  {auditLog.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-xs">{entry.action}</span>
                        <Badge value={entry.risk} />
                      </div>
                      <div className="mt-1 text-xs text-[#8b8ba3]">{entry.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function PageTitle({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
      <div>
        {eyebrow ? <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#8b5cf6] font-[family-name:var(--font-outfit)]">{eyebrow}</div> : null}
        <h1 className="text-3xl font-extrabold tracking-tight font-[family-name:var(--font-outfit)] bg-gradient-to-r from-white to-[#c4c4d4] bg-clip-text text-transparent">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  type = "submit",
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-[#8b5cf6] to-[#06d6a0] px-4 text-sm font-extrabold text-white shadow-md shadow-[rgba(139,92,246,0.2)] hover:shadow-lg hover:shadow-[rgba(139,92,246,0.35)] hover:brightness-110 active:scale-98 transition-all duration-200 disabled:cursor-not-allowed disabled:border-[#2a2a4a] disabled:bg-[#1a1a2e] disabled:text-[#4a4a60] disabled:shadow-none disabled:brightness-100 disabled:scale-100"
    >
      {children}
    </button>
  );
}

export function AddButton({ label, onClick, disabled = false }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button type="button" onClick={onClick} disabled={disabled}>
      <Plus size={17} />
      {label}
    </Button>
  );
}

export function IconButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-10 w-10 place-items-center rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] text-[#c4c4d4] hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/10 hover:text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GuardedButton({
  permission,
  children,
  onClick,
}: {
  permission: Permission;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const currentRole = useVentoStore((state) => state.currentRole);
  const allowed = can(currentRole, permission);

  return (
    <button
      type="button"
      className="tag disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!allowed}
      title={allowed ? undefined : `${currentRole} cannot perform this action`}
      onClick={allowed ? onClick : undefined}
    >
      {children}
    </button>
  );
}

export function StatCard({
  title,
  value,
  delta,
  href,
}: {
  title: string;
  value: string;
  delta?: string;
  href: string;
}) {
  return (
    <div className="panel industrial-shadow p-5 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#8b5cf6] to-[#06d6a0] opacity-0 group-hover:opacity-100 transition-all duration-300" />
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{title}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-4xl font-extrabold tracking-tight font-[family-name:var(--font-outfit)]">{value}</div>
        {delta ? (
          <div className="rounded-lg bg-[#8b5cf6]/15 px-2.5 py-1 text-[11px] font-extrabold text-[#a78bfa] border border-[#8b5cf6]/30">
            {delta}
          </div>
        ) : null}
      </div>
      <Link href={href} className="mt-5 flex h-10 items-center justify-between rounded-lg border border-[#2a2a4a] px-3 text-xs font-bold text-[#c4c4d4] hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/10 hover:text-white transition-all duration-200">
        View
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}

export function Badge({ value }: { value: string }) {
  const tone =
    value === "Critical" || value === "Risk" || value === "Open"
      ? "border-[#f43f5e] text-[#fb7185] bg-[#f43f5e]/15"
      : value === "High" || value === "Medium" || value === "Processing" || value === "Night Shift"
        ? "border-[#fb923c] text-[#fdba74] bg-[#fb923c]/15"
        : value === "Active" || value === "Closed" || value === "Elite"
          ? "border-[#06d6a0] text-[#34d399] bg-[#06d6a0]/15"
          : "border-[#2a2a4a] text-[#a5a5bd] bg-[#1a1a2e]";

  return <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-bold tracking-wide ${tone}`}>{value}</span>;
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead className="bg-[#1a1a2e] text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap border-b border-[#2a2a4a] px-4 py-3.5 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-[#1e1e3a] last:border-0 hover:bg-[#1a1a2e]/30 transition-colors duration-150">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-4 py-3.5 align-middle text-[#f0f0ff]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MiniMap() {
  const language = useVentoStore((state) => state.language);
  const t = (key: TranslationKey) => translate(language, key);

  return (
    <div className="panel relative min-h-[360px] overflow-hidden p-5">
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(139,92,246,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.15)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute left-[18%] top-[30%] h-28 w-28 rounded-full bg-[#8b5cf6]/20 blur-2xl animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute left-[62%] top-[43%] h-32 w-32 rounded-full bg-[#f43f5e]/15 blur-2xl animate-pulse" style={{ animationDuration: '5s' }} />
      <div className="absolute left-[45%] top-[18%] h-24 w-24 rounded-full bg-[#fb923c]/15 blur-2xl animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-between">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#8b5cf6] font-[family-name:var(--font-outfit)]">{t("liveDensityMap")}</div>
          <div className="mt-1 text-2xl font-black font-[family-name:var(--font-outfit)] bg-gradient-to-r from-white to-[#c4c4d4] bg-clip-text text-transparent">{t("mapSummary")}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
          {["Paulista", "Liberdade", "Tatuape", "Pinheiros"].map((name, index) => (
            <div key={name} className="rounded-xl border border-[#2a2a4a] bg-[#0d0d1a]/85 p-3.5 backdrop-blur-md">
              <div className="text-sm font-bold text-[#f0f0ff]">{name}</div>
              <div className="mt-1 text-xs text-[#8b8ba3]">{index === 2 ? t("criticalNightArea") : t("stablePontoCluster")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#2a2a4a] bg-[#0d0d1a] p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{label}</div>
      <div className="mt-1.5 font-bold text-sm text-[#f0f0ff]">{value}</div>
    </div>
  );
}

export function AlertRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-3.5">
      <AlertTriangle className="mt-0.5 text-[#fb923c]" size={18} />
      <div>
        <div className="font-bold text-sm text-[#f0f0ff]">{title}</div>
        <div className="text-xs text-[#8b8ba3] mt-0.5">{detail}</div>
      </div>
    </div>
  );
}
