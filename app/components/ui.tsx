"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bike,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  DatabaseBackup,
  FileText,
  FileBarChart2,
  FileSpreadsheet,
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
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { languages, translate, type Language, type TranslationKey } from "../lib/i18n";
import { getNotificationStatus } from "../lib/notifications";
import { can, type Permission, type Role } from "../lib/rbac";
import { useVentoStore } from "../lib/store";
import { portalConfigs, portalForPath, portalForRole, type PortalId } from "../lib/portals";

const navItems: Array<{
  href: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ size?: number }>;
  permission?: Permission;
}> = [
  { href: "/dashboard", labelKey: "navDashboard", icon: LayoutDashboard, permission: "view_dashboard" },
  { href: "/riders", labelKey: "navRiders", icon: Bike, permission: "manage_riders" },
  { href: "/rider-app", labelKey: "navRiderApp", icon: Bike, permission: "use_rider_app" },
  { href: "/pontos", labelKey: "navPontos", icon: MapPinned, permission: "manage_pontos" },
  { href: "/incidents", labelKey: "navIncidents", icon: ShieldAlert, permission: "create_incidents" },
  { href: "/points-economy", labelKey: "navPointsEconomy", icon: CircleDollarSign, permission: "manage_points" },
  { href: "/ninety-nine-import", labelKey: "navNinetyNineImport", icon: FileSpreadsheet, permission: "manage_riders" },
  { href: "/dispatch", labelKey: "navDispatch", icon: CalendarDays, permission: "manage_slots" },
  { href: "/performance", labelKey: "navPerformance", icon: BarChart3, permission: "view_analytics" },
  { href: "/users", labelKey: "navUsers", icon: ShieldCheck, permission: "manage_slots" },
  { href: "/mall", labelKey: "navMall", icon: Store, permission: "manage_marketplace" },
  { href: "/partner-points", labelKey: "navPartnerPoints", icon: Handshake, permission: "manage_partner_points" },
  { href: "/wallet", labelKey: "navWallet", icon: CircleDollarSign, permission: "view_finance" },
  { href: "/support", labelKey: "navSupport", icon: ShieldCheck, permission: "view_audit" },
  { href: "/crm", labelKey: "navCrm", icon: Handshake, permission: "view_analytics" },
  { href: "/franchise", labelKey: "navFranchise", icon: Store, permission: "view_analytics" },
  { href: "/reports", labelKey: "navReports", icon: FileBarChart2, permission: "view_analytics" },
  { href: "/access-control", labelKey: "navAccessControl", icon: ShieldCheck, permission: "view_audit" },
];

const navGroups: Array<{
  title: string;
  items: typeof navItems;
}> = [
  {
    // Daily operations: scheduling, KPI, network and people.
    title: "Operations",
    items: navItems.filter((item) =>
      [
        "/dashboard",
        "/dispatch",
        "/performance",
        "/ninety-nine-import",
        "/riders",
        "/pontos",
        "/franchise",
        ].includes(item.href),
    ),
  },
  {
    // Mall & partner ecosystem.
    title: "PontoMall",
    items: navItems.filter((item) => ["/mall", "/partner-points"].includes(item.href)),
  },
  {
    // Money: ledgers, settlement, exports.
    title: "Finance",
    items: navItems.filter((item) => ["/wallet", "/reports"].includes(item.href)),
  },
  {
    // Accounts, permissions, tickets, audit.
    title: "System",
    items: navItems.filter((item) => ["/users", "/support", "/access-control"].includes(item.href)),
  },
];

type SessionUser = {
  name: string;
  role: Role;
  portal: PortalId;
  organization: string;
  defaultPath: string;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const pathname = usePathname();
  const language = useVentoStore((state) => state.language);
  const setLanguage = useVentoStore((state) => state.setLanguage);
  const theme = useVentoStore((state) => state.theme);
  const setTheme = useVentoStore((state) => state.setTheme);
  const currentRole = useVentoStore((state) => state.currentRole);
  const setRole = useVentoStore((state) => state.setRole);
  const resetDemoData = useVentoStore((state) => state.resetDemoData);
  const notifications = useVentoStore((state) => state.notifications);
  const markNotificationRead = useVentoStore((state) => state.markNotificationRead);
  const acknowledgeNotification = useVentoStore((state) => state.acknowledgeNotification);
  const auditLog = useVentoStore((state) => state.auditLog);
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);
  const t = (key: TranslationKey) => translate(language, key);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const activeRole = sessionUser?.role ?? currentRole;
  const canReset = can(activeRole, "reset_demo");
  const portal = sessionUser ? portalConfigs[sessionUser.portal] : portalForRole(activeRole) ?? portalForPath(pathname ?? "/dashboard");
  const portalModuleHrefs = new Set(portal.modules.map((module) => module.href));
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => portalModuleHrefs.has(item.href) && (!item.permission || can(activeRole, item.permission)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ user: SessionUser }>;
      })
      .then((payload) => {
        if (!active || !payload?.user) return;
        setSessionUser(payload.user);
        setRole(payload.user.role);
      });
    return () => {
      active = false;
    };
  }, [setRole]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--text)] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-[var(--line)] bg-[var(--surface)] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-[64px] items-center border-b border-[var(--line)] px-4">
          <Link href={portal.homePath} className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-logo.png" alt="MePonto" className="h-8 w-auto shrink-0 rounded-[6px] object-contain" />
            <span className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              {portal.productName}
            </span>
          </Link>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 py-3 lg:block lg:h-[calc(100vh-64px)] lg:space-y-4 lg:overflow-y-auto lg:px-3 lg:pb-6">
          {visibleGroups.map((group) => (
            <section key={group.title} className="min-w-max lg:min-w-0">
              <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{group.title}</div>
              <div className="flex gap-2 lg:block lg:space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex min-h-10 shrink-0 items-center gap-3 rounded-[8px] border border-transparent px-3 text-sm font-semibold text-[var(--text-soft)] transition-colors hover:border-[var(--line)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    >
                      <Icon size={17} />
                      <span className="whitespace-nowrap">{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("currentRegion")}</div>
            <div className="text-lg font-black text-[var(--text)]">{t("regionName")}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconButton label={t("notifications")} onClick={() => setNotificationsOpen(true)}>
                <Bell size={18} />
              </IconButton>
              {unreadCount ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-[var(--surface)] bg-[var(--danger)] px-1 text-[10px] font-black text-[var(--text)] animate-pulse">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            <IconButton label={nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode"} onClick={() => setTheme(nextTheme)}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
            <IconButton label={canReset ? t("resetDemoData") : t("resetRequiresSuperAdmin")} onClick={canReset ? resetDemoData : undefined} disabled={!canReset}>
              <RotateCcw size={18} />
            </IconButton>
            <select
              data-i18n-skip
              aria-label={t("language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text)] outline-none"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
            <div className="hidden min-w-0 text-right md:block">
              <div className="truncate text-sm font-black">{sessionUser?.name ?? activeRole}</div>
              <div className="truncate text-[10px] font-bold uppercase text-[var(--muted)]">{sessionUser?.organization ?? portal.productName}</div>
            </div>
            <button
              type="button"
              title="修改密码"
              onClick={async () => {
                const current = window.prompt("当前密码：");
                if (!current) return;
                const next = window.prompt("新密码（至少 6 位）：");
                if (!next) return;
                const response = await fetch("/api/auth/change-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ currentPassword: current, newPassword: next }),
                });
                const payload = await response.json().catch(() => ({}));
                window.alert(response.ok ? "密码已修改，下次登录请使用新密码。" : payload.error ?? "修改失败");
              }}
              className="grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] text-sm font-black text-[var(--accent)] hover:border-[var(--accent)]"
            >
              {activeRole
                .split(" ")
                .map((word) => word[0])
                .join("")}
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = `/login/${portal.id}`;
              }}
              className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-ink)]"
            >
              <LogOut size={17} />
              {t("logout")}
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-7 animate-fade-in">{children}</div>
      </main>
      {notificationsOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--overlay)] backdrop-blur-sm">
          <aside className="h-full w-full max-w-md flex flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-2xl animate-slide-up">
            <div className="flex min-h-16 items-center justify-between border-b border-[var(--line)] px-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)]">{t("operations")}</div>
                <h2 className="text-xl font-bold font-[family-name:var(--font-outfit)]">{t("notifications")}</h2>
              </div>
              <IconButton label={t("closeNotifications")} onClick={() => setNotificationsOpen(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="space-y-4 overflow-y-auto p-4 flex-1">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("operationsQueue")}</div>
                <div className="space-y-2">
                  {notifications.length ? (
                    notifications.map((notification) => {
                      const status = getNotificationStatus(notification);
                      return (
                        <div
                          key={notification.id}
                          className={`rounded-[8px] border p-3 transition-colors ${
                            notification.acknowledgedAt ? "border-[var(--line)] bg-[var(--surface-raised)]/50" : "border-[var(--line)] bg-[var(--surface-raised)]"
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
                              <span className="block font-bold text-sm text-[var(--text)]">{notification.title}</span>
                              <span className="mt-1 block text-xs text-[var(--muted-strong)]">{notification.body}</span>
                            </Link>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <Badge value={notification.severity} />
                              <Badge value={status} />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[10px] text-[var(--muted)]">{notification.createdAt}</span>
                            <button
                              type="button"
                              disabled={Boolean(notification.acknowledgedAt)}
                              onClick={() => acknowledgeNotification(notification.id)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--line)] px-2.5 text-[11px] font-bold text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:bg-[rgba(255,209,0,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <CheckCheck size={14} />
                              {t("ack")}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-xs text-[var(--muted-strong)]">{t("noActiveNotifications")}</div>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("latestAuditEvents")}</div>
                <div className="space-y-2">
                  {auditLog.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-xs">{entry.action}</span>
                        <Badge value={entry.risk} />
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted-strong)]">{entry.detail}</div>
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
      <div>
        {eyebrow ? <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)] font-[family-name:var(--font-outfit)]">{eyebrow}</div> : null}
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] font-[family-name:var(--font-outfit)] md:text-3xl">{title}</h1>
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
      className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-transparent bg-[var(--accent)] px-4 text-sm font-extrabold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--surface-raised)] disabled:text-[#657185]"
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
      className="grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:bg-[rgba(255,209,0,0.08)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
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
    <div className="panel p-4 relative overflow-hidden group">
      <div className="absolute left-0 top-0 h-full w-[3px] bg-[var(--accent)] opacity-80" />
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{title}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-3xl font-extrabold tracking-tight text-[var(--text)] font-[family-name:var(--font-outfit)]">{value}</div>
        {delta ? (
          <div className="rounded-[6px] border border-[rgba(255,209,0,0.35)] bg-[rgba(255,209,0,0.12)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--accent)]">
            {delta}
          </div>
        ) : null}
      </div>
      <Link href={href} className="mt-4 flex h-9 items-center justify-between rounded-[6px] border border-[var(--line)] px-3 text-xs font-bold text-[var(--muted-strong)] transition-colors hover:border-[var(--accent)] hover:bg-[rgba(255,209,0,0.08)] hover:text-[var(--accent)]">
        View
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}

export function Badge({ value }: { value: string }) {
  const tone =
    value === "Critical" || value === "Risk" || value === "Open"
      ? "border-[var(--danger)] text-[var(--danger-ink)] bg-[var(--danger-bg)]"
      : value === "High" || value === "Medium" || value === "Processing" || value === "Night Shift"
        ? "border-[var(--warning)] text-[var(--warning-ink)] bg-[var(--warning-bg)]"
        : value === "Active" || value === "Closed" || value === "Elite"
          ? "border-[var(--ok)] text-[var(--ok-ink)] bg-[var(--ok-bg)]"
          : "border-[var(--line)] text-[var(--muted-strong)] bg-[var(--surface-raised)]";

  return <span className={`inline-flex rounded-[6px] border px-2 py-0.5 text-[11px] font-bold tracking-wide ${tone}`}>{value}</span>;
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
          <thead className="bg-[var(--surface-raised)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap border-b border-[var(--line)] px-4 py-3 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-[var(--line-soft)] last:border-0 transition-colors hover:bg-[var(--surface-hover)]">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-4 py-3 align-middle text-[var(--text-soft)]">
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
    <div className="panel relative min-h-[320px] overflow-hidden p-5">
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(154,166,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(154,166,184,0.12)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="relative z-10 flex h-full min-h-[280px] flex-col justify-between">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)] font-[family-name:var(--font-outfit)]">{t("liveDensityMap")}</div>
          <div className="mt-1 text-2xl font-black text-[var(--text)] font-[family-name:var(--font-outfit)]">{t("mapSummary")}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
          {["Paulista", "Liberdade", "Tatuape", "Pinheiros"].map((name, index) => (
            <div key={name} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
              <div className="text-sm font-bold text-[var(--text)]">{name}</div>
              <div className="mt-1 text-xs text-[var(--muted-strong)]">{index === 2 ? t("criticalNightArea") : t("stablePontoCluster")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 font-bold text-sm text-[var(--text)]">{value}</div>
    </div>
  );
}

export function AlertRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5">
      <AlertTriangle className="mt-0.5 text-[var(--warning)]" size={18} />
      <div>
        <div className="font-bold text-sm text-[var(--text)]">{title}</div>
        <div className="text-xs text-[var(--muted-strong)] mt-0.5">{detail}</div>
      </div>
    </div>
  );
}
