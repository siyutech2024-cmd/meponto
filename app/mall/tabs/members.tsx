"use client";

import MembersPanel from "../../members/members-panel";

/**
 * 会员 — PontoMall back-office flat-management tab. Renders the SAME
 * MembersPanel as the PontoSys /members page (zero logic copy): one unified
 * member list (公开用户 + 骑手), fetched from /api/riders by the panel itself.
 */
export default function MembersTab() {
  return <MembersPanel />;
}
