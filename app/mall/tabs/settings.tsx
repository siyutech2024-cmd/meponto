"use client";

import { useState } from "react";
import { SectionCard } from "../kit";
import { useMallAdmin } from "./context";

/**
 * 设置 — wave-1 redesign: sectioned cards (PIX 收款 / 积分规则跳转 / 域名说明)
 * with a unified form style. Same single API action as before (setConfig).
 */
export default function SettingsTab() {
  const { mall, post } = useMallAdmin();
  const [pixDraft, setPixDraft] = useState<string | null>(null);
  const pixKey = pixDraft ?? mall?.pixKey ?? "";

  return (
    <div className="max-w-2xl space-y-5">
      <SectionCard title="收款配置" desc="骑手充值 / 混合付款时展示的公司收款方式。">
        <label className="block text-[11px] font-bold text-[var(--muted)]">公司 PIX 收款 Key
          <input
            value={pixKey}
            onChange={(e) => setPixDraft(e.target.value)}
            placeholder="CNPJ / e-mail / chave aleatória"
            className="mt-1 h-10 w-full max-w-md rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 font-mono text-sm font-bold outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button type="button" onClick={() => void post("/api/mall", { action: "setConfig", pixKey }, "收款配置已保存")} className="mt-4 h-10 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-bold text-[var(--accent-ink)]">保存</button>
      </SectionCard>

      <SectionCard title="积分规则" desc="商城不再单独维护积分规则，统一在「积分经济」页管理。">
        <p className="text-xs font-bold leading-5 text-[var(--muted)]">
          完单积分、邀请裂变、生日、Partner 服务积分、金钱等价(R$ ↔ 分)、每日/每月兑换上限、高价值审核阈值等,都已移到积分经济页统一设置(避免两处重复)。
        </p>
        <a href="/points-economy" className="mt-3 inline-flex h-9 items-center rounded-[8px] border border-[var(--line)] px-4 text-xs font-bold text-[var(--accent)] hover:border-[var(--accent)]">前往积分经济 →</a>
      </SectionCard>

      <SectionCard title="域名与入口" desc="商城门面与统一控制台的访问方式。">
        <div className="space-y-2 text-xs font-bold leading-5 text-[var(--muted)]">
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">门面：<span className="font-mono text-[var(--text)]">mall.meponto.com</span></div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">统一控制台：<span className="font-mono text-[var(--text)]">mall.meponto.com/admin</span>（运营 / 供应商 / 合作方按角色进入，同一登录）</div>
        </div>
      </SectionCard>
    </div>
  );
}
