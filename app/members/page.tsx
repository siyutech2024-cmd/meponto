"use client";

import { AppShell, PageTitle } from "../components/ui";
import MembersPanel from "./members-panel";

/**
 * 用户 / 会员 — thin PontoSys page shell. The whole workbench lives in
 * MembersPanel (./members-panel.tsx), which is ALSO rendered by the PontoMall
 * back-office 会员 tab (app/mall/tabs/members.tsx) — one implementation, two homes.
 */
export default function MembersPage() {
  return (
    <AppShell>
      <PageTitle
        title="用户 / 会员"
        eyebrow="公开用户 + 骑手 · 统一会员表（无 99 ID = 会员一级；有 99 ID = 会员二级起）"
      />
      <MembersPanel />
    </AppShell>
  );
}
