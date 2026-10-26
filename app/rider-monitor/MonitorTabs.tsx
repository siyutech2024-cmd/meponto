"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";
import { regionFromPath, regionHref } from "../lib/regions";

/** Tab switch between the live board and the read-only daily view — one nav
 *  entry, two views. */
export default function MonitorTabs() {
  const pathname = usePathname();
  const language = useVentoStore((s) => s.language);
  const t = useCallback((k: TranslationKey) => translate(language, k), [language]);
  // Stay inside the menu we came from: the Boa Vista menu's tabs point at
  // /rider-monitor/boavista and /rider-monitor/boavista/today.
  const base = regionHref("/rider-monitor", regionFromPath(pathname));
  const tabs = [
    { href: base, label: t("rmTabLive") },
    { href: `${base}/today`, label: t("rmTabToday") },
  ];
  return (
    <div className="mb-4 flex gap-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-1 w-fit">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-[6px] px-4 py-1.5 text-sm font-bold transition-colors ${active ? "bg-[var(--accent)] text-[#111]" : "text-[var(--muted-strong)] hover:text-[var(--text)]"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
