"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bike,
  CheckCheck,
  ChevronDown,
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
  Store,
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

type NavItem = { href: string; labelKey: TranslationKey; icon: React.ComponentType<{ size?: number }> };

const primaryNavItems: NavItem[] = [
  { href: "/dashboard", labelKey: "navDashboard", icon: LayoutDashboard },
  { href: "/riders", labelKey: "navRiders", icon: Bike },
  { href: "/pontos", labelKey: "navPontos", icon: MapPinned },
  { href: "/territory", labelKey: "navTerritory", icon: MapPinned },
  { href: "/leaders", labelKey: "navLeaders", icon: Users },
  { href: "/incidents", labelKey: "navIncidents", icon: ShieldAlert },
  { href: "/finance", labelKey: "navFinance", icon: CircleDollarSign },
];

const operationsNavItems: NavItem[] = [
  { href: "/whatsapp", labelKey: "navWhatsapp", icon: MessageCircle },
  { href: "/mobile", labelKey: "navMobile", icon: Smartphone },
  { href: "/night-shift", labelKey: "navNightShift", icon: Moon },
  { href: "/rewards", labelKey: "navRewards", icon: CircleDollarSign },
  { href: "/crm", labelKey: "navCrm", icon: Handshake },
  { href: "/franchise", labelKey: "navFranchise", icon: Store },
  { href: "/sops", labelKey: "navSops", icon: FileText },
];

const managementNavItems: NavItem[] = [
  { href: "/analytics", labelKey: "navAnalytics", icon: BarChart3 },
  { href: "/reports", labelKey: "navReports", icon: FileBarChart2 },
  { href: "/realtime", labelKey: "navRealtime", icon: RadioTower },
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
  const pathname = usePathname();
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
  const isActive = (item: NavItem) => pathname === item.href || pathname.startsWith(`${item.href}/`);
  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex min-h-10 shrink-0 items-center gap-3 rounded-lg border px-3 text-sm font-semibold transition-colors ${
          active
            ? "border-[#d7ebe4] bg-[#edf8f4] text-[#087857]"
            : "border-transparent text-[#66736f] hover:bg-[#f4f8f6] hover:text-[#17211e]"
        }`}
      >
        <Icon size={18} />
        {t(item.labelKey)}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#17211e] lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="border-b border-[#e2e8e5] bg-white lg:flex lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex h-20 items-center px-5">
          <BrandLockup />
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
          {primaryNavItems.map(renderNavItem)}
          <details className="group hidden pt-3 lg:block" open={operationsNavItems.some(isActive)}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[#88938f]">
              Operations
              <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
            </summary>
            <div className="space-y-1">{operationsNavItems.map(renderNavItem)}</div>
          </details>
          <details className="group hidden pt-2 lg:block" open={managementNavItems.some(isActive)}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[#88938f]">
              Management
              <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
            </summary>
            <div className="space-y-1">{managementNavItems.map(renderNavItem)}</div>
          </details>
        </nav>
        <details className="group px-3 pb-3 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#e2e8e5] px-3 py-2 text-xs font-bold text-[#66736f]">
            More modules
            <ChevronDown className="ml-auto transition-transform group-open:rotate-180" size={14} />
          </summary>
          <div className="mt-2 grid gap-1 rounded-lg border border-[#e2e8e5] bg-white p-2 sm:grid-cols-2">
            {[...operationsNavItems, ...managementNavItems].map(renderNavItem)}
          </div>
        </details>
        <div className="mt-auto hidden border-t border-[#eef1f0] p-3 lg:block">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-[#66736f] hover:bg-[#f4f8f6]">
              Admin
              <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
            </summary>
            <div className="space-y-2 px-1 pt-2">
              <select
                data-i18n-skip
                aria-label="Current role"
                value={currentRole}
                onChange={(event) => setRole(event.target.value as Role)}
                className="h-9 w-full rounded-lg border border-[#e2e8e5] bg-white px-2 text-xs font-bold text-[#17211e] outline-none"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[language][role]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!canReset}
                onClick={canReset ? resetDemoData : undefined}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#66736f] hover:bg-[#fff8ed] hover:text-[#9a5a04] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={15} />
                {canReset ? t("resetDemoData") : t("resetRequiresSuperAdmin")}
              </button>
            </div>
          </details>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-[#e2e8e5] bg-white px-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{t("currentRegion")}</div>
            <div className="text-lg font-black text-[#17211e] font-[family-name:var(--font-outfit)]">{t("regionName")}</div>
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
            <select
              data-i18n-skip
              aria-label={t("language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="h-10 rounded-lg border border-[#e2e8e5] bg-white px-2 text-sm font-bold text-[#17211e] outline-none"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-[#d7ebe4] bg-[#edf8f4] text-sm font-bold text-[#087857]">
              {currentRole
                .split(" ")
                .map((word) => word[0])
                .join("")}
            </div>
            <Link
              href="/login"
              className="flex h-10 items-center gap-2 rounded-lg border border-[#e2e8e5] px-3 text-sm font-semibold text-[#66736f] transition-colors hover:border-[#f4c7cc] hover:bg-[#fff4f5] hover:text-[#b42333]"
            >
              <LogOut size={17} />
              {t("logout")}
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 animate-fade-in">{children}</div>
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
        <h1 className="text-3xl font-extrabold tracking-tight text-[#17211e] font-[family-name:var(--font-outfit)]">{title}</h1>
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
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#087857] bg-[#087857] px-4 text-sm font-extrabold text-white shadow-sm transition-colors hover:border-[#066a4d] hover:bg-[#066a4d] disabled:cursor-not-allowed disabled:border-[#d7dfdc] disabled:bg-[#eef1f0] disabled:text-[#9aa6a2] disabled:shadow-none"
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
      className="grid h-10 w-10 place-items-center rounded-lg border border-[#e2e8e5] bg-white text-[#66736f] transition-colors hover:border-[#b8d8cd] hover:bg-[#edf8f4] hover:text-[#087857] disabled:cursor-not-allowed disabled:opacity-40"
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
    <div className="panel p-5 relative overflow-hidden group">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{title}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-4xl font-extrabold tracking-tight font-[family-name:var(--font-outfit)]">{value}</div>
        {delta ? (
          <div className="rounded-full border border-[#d7ebe4] bg-[#edf8f4] px-2.5 py-1 text-[11px] font-extrabold text-[#087857]">
            {delta}
          </div>
        ) : null}
      </div>
      <Link href={href} className="mt-5 flex h-10 items-center justify-between rounded-lg border-t border-[#e2e8e5] pt-3 text-xs font-bold text-[#087857] transition-colors hover:text-[#055f45]">
        View
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}

export function Badge({ value }: { value: string }) {
  const tone =
    value === "Critical" || value === "Risk" || value === "Open"
      ? "border-[#f2c2c7] text-[#b42333] bg-[#fff4f5]"
      : value === "High" || value === "Medium" || value === "Processing" || value === "Night Shift"
        ? "border-[#f5d7a7] text-[#9a5a04] bg-[#fff8ed]"
        : value === "Active" || value === "Closed" || value === "Elite"
          ? "border-[#c7e7dc] text-[#087857] bg-[#edf8f4]"
          : "border-[#e2e8e5] text-[#66736f] bg-[#f8faf9]";

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
          <thead className="bg-[#f8faf9] text-[10px] font-bold uppercase tracking-wider text-[#66736f]">
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
              <tr key={index} className="border-b border-[#eef1f0] last:border-0 hover:bg-[#fbfcfc] transition-colors duration-150">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-4 py-3.5 align-middle text-[#26332f]">
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
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(8,120,87,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(8,120,87,0.07)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-between">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#8b5cf6] font-[family-name:var(--font-outfit)]">{t("liveDensityMap")}</div>
          <div className="mt-1 text-2xl font-black text-[#17211e] font-[family-name:var(--font-outfit)]">{t("mapSummary")}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
          {["Paulista", "Liberdade", "Tatuape", "Pinheiros"].map((name, index) => (
            <div key={name} className="rounded-xl border border-[#e2e8e5] bg-white p-3.5 shadow-sm">
              <div className="text-sm font-bold text-[#17211e]">{name}</div>
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
