"use client";

import Link from "next/link";
import { ExternalLink, LogOut, Moon, RefreshCcw, Sun } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { languages, translate, type TranslationKey } from "../lib/i18n";
import type { Role } from "../lib/rbac";
import type { PortalId } from "../lib/portals";
import { useVentoStore } from "../lib/store";

/**
 * MallShell — the standalone PontoMall back-office chrome. Replaces the old
 * AppShell + nested mall sidebar double layout with a single full-height
 * sidebar, a slim 56px top bar (breadcrumb title + theme / language / account)
 * and a full-width workspace. Session/theme/logout behaviour is copied from
 * AppShell (app/components/ui.tsx) so auth stays on the unified flow.
 */

export type MallNavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Pending-work badge count (red pill; dot when collapsed). */
  badge?: number;
  /** Present → renders a link instead of a tab button. */
  href?: string;
  /** Open the link in a new window (portal entrances). */
  external?: boolean;
};

export type MallNavGroup = { label: string | null; items: MallNavItem[] };

type SessionUser = {
  name: string;
  role: Role;
  portal: PortalId;
  organization: string;
  defaultPath: string;
};

const NAV_ITEM_CLASS = "relative flex h-9 w-full items-center gap-2.5 rounded-[8px] px-0 text-[13px] font-bold transition-colors lg:px-2.5";
const NAV_IDLE_CLASS = "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

export function MallShell({
  title,
  nav,
  activeId,
  onSelect,
  onRefresh,
  children,
}: {
  /** Current page name — rendered as the top-bar breadcrumb "PontoMall · {title}". */
  title: string;
  nav: MallNavGroup[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const language = useVentoStore((state) => state.language);
  const setLanguage = useVentoStore((state) => state.setLanguage);
  const theme = useVentoStore((state) => state.theme);
  const setTheme = useVentoStore((state) => state.setTheme);
  const currentRole = useVentoStore((state) => state.currentRole);
  const setRole = useVentoStore((state) => state.setRole);
  const t = (key: TranslationKey) => translate(language, key);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const activeRole = sessionUser?.role ?? currentRole;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Same session hydration as AppShell: SERVER identity wins over any stale
  // localStorage marker so the workspace perspective never flips.
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
        try {
          const u = payload.user as SessionUser & { franchise?: string; station?: string; identifier?: string };
          window.localStorage.setItem(
            "mePontoSession",
            JSON.stringify({ name: u.name, role: u.role, portal: u.portal, organization: u.organization, franchise: u.franchise ?? "", station: u.station ?? "", identifier: u.identifier ?? "" }),
          );
        } catch {
          /* storage unavailable */
        }
      });
    return () => {
      active = false;
    };
  }, [setRole]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = `/login/${sessionUser?.portal ?? "pontomall"}`;
  };

  const renderItem = (item: MallNavItem) => {
    const { id, label, icon: Icon, badge = 0, href, external } = item;
    const inner = (
      <>
        <span className="grid w-14 shrink-0 place-items-center lg:w-auto"><Icon size={15} /></span>
        <span className="hidden truncate lg:inline">{label}</span>
        {external && <ExternalLink size={12} className="ml-auto hidden shrink-0 opacity-60 lg:block" />}
        {badge > 0 && (
          <>
            <span className={`ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black lg:inline-block ${activeId === id ? "bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]" : "bg-[var(--danger)] text-white"}`}>{badge}</span>
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--danger)] lg:hidden" />
          </>
        )}
      </>
    );

    if (href) {
      // Link items (洞察 in-tab pages / 门户 external windows) are never "active".
      if (external) {
        return (
          <a key={id} href={href} target="_blank" rel="noopener noreferrer" title={label} className={`${NAV_ITEM_CLASS} ${NAV_IDLE_CLASS}`}>
            {inner}
          </a>
        );
      }
      return (
        <Link key={id} href={href} title={label} className={`${NAV_ITEM_CLASS} ${NAV_IDLE_CLASS}`}>
          {inner}
        </Link>
      );
    }

    const active = activeId === id;
    return (
      <button
        key={id}
        type="button"
        title={label}
        onClick={() => onSelect?.(id)}
        className={`${NAV_ITEM_CLASS} ${active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : NAV_IDLE_CLASS}`}
      >
        {inner}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--text)]">
      {/* ---- 主侧栏：固定全高;窄屏折叠成图标栏 ---- */}
      <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] lg:w-56">
        <Link href="/mall" className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-0 lg:px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-logo.png" alt="MePonto" className="mx-auto h-7 w-auto shrink-0 rounded-[6px] object-contain lg:mx-0" />
          <span className="hidden truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)] lg:inline">PontoMall</span>
        </Link>
        <nav className="flex-1 space-y-4 overflow-y-auto px-1.5 py-4 lg:px-3">
          {nav.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`}>
              {group.label && <div className="mb-1.5 hidden px-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted)] lg:block">{group.label}</div>}
              <div className="space-y-0.5">{group.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>
        {onRefresh && (
          <div className="shrink-0 border-t border-[var(--line)] p-1.5 lg:p-3">
            <button type="button" onClick={onRefresh} className="flex h-9 w-full items-center gap-2.5 rounded-[8px] border border-[var(--line)] px-0 text-[13px] font-bold text-[var(--muted)] transition-colors hover:border-[var(--accent)] lg:px-2.5">
              <span className="grid w-14 shrink-0 place-items-center lg:w-auto"><RefreshCcw size={14} /></span>
              <span className="hidden lg:inline">刷新</span>
            </button>
          </div>
        )}
      </aside>

      {/* ---- 顶栏 + 内容区 ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-6">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">PontoMall</span>
            <span className="text-[var(--muted)]">·</span>
            <span className="truncate text-sm font-black text-[var(--text)]">{title}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label={nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode"}
              title={nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode"}
              onClick={() => setTheme(nextTheme)}
              className="grid h-9 w-9 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <select
              data-i18n-skip
              aria-label={t("language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text)] outline-none"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
            <div className="hidden min-w-0 text-right sm:block">
              <div className="max-w-[160px] truncate text-[13px] font-black leading-tight">{sessionUser?.name ?? activeRole}</div>
              <div className="max-w-[160px] truncate text-[10px] font-bold uppercase text-[var(--muted)]">{activeRole}</div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--line)] px-2.5 text-[13px] font-semibold text-[var(--muted-strong)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-ink)]"
            >
              <LogOut size={15} />
              <span className="hidden md:inline">{t("logout")}</span>
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-6 py-5 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
