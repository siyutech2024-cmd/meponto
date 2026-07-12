"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchInput, SectionCard, Skeleton, Stat, StatusBadge, type BadgeTone } from "../components/kit";
import { readSession } from "../lib/session";

/**
 * PointsEconomyPanel — the single source of truth UI for the global points
 * economy (rules incl. money equivalence, per-user balances, append-only
 * ledger). Rendered by BOTH the PontoSys page (/points-economy) and the
 * PontoMall back-office 积分 tab, so the logic lives exactly once.
 */

type Account = { riderId: string; accountId: string; available: number; pending: number };
type PartnerAccount = { partnerId: string; available: number };
type Ledger = { id: string; riderId: string; type: string; points: number; status: string; sourceType: string; reasonCode: string; balanceAfter: number; createdAt: string; note?: string };
type RiderLite = { id: string; name: string; ninetyNineId?: string; birthday?: string };
type Config = {
  pointsPerBrl?: number; perOrderPoints?: number; referralPoints?: number; birthdayBasePoints?: number;
  partnerServicePoints?: number; partnerServiceCount?: number;
  dailyRedeemCount?: number; dailyRedeemPoints?: number; monthlyRedeemPoints?: number; highValueReviewPoints?: number;
};

const RULE_FIELDS: Array<{ k: keyof Config; l: string; hint: string }> = [
  { k: "pointsPerBrl", l: "金钱等价 · R$1 =", hint: "兑换/GMV 折算基准" },
  { k: "perOrderPoints", l: "完单积分 / 单", hint: "每完成 1 单发放" },
  { k: "referralPoints", l: "邀请裂变积分", hint: "邀请好友首次注册" },
  { k: "birthdayBasePoints", l: "生日基础积分", hint: "所有会员生日当天" },
  { k: "partnerServicePoints", l: "Partner 服务积分", hint: "商户每次核销" },
  { k: "partnerServiceCount", l: "Partner 累计 N 次发", hint: "满 N 次发一次" },
  { k: "dailyRedeemCount", l: "单日兑换次数上限", hint: "0 = 不限" },
  { k: "dailyRedeemPoints", l: "单日兑换积分上限", hint: "0 = 不限" },
  { k: "monthlyRedeemPoints", l: "单月兑换积分上限", hint: "0 = 不限" },
  { k: "highValueReviewPoints", l: "高价值审核阈值", hint: "≥ 此分需人工审核" },
];

const typeLabel: Record<string, string> = { earn: "发放", spend: "兑换", refund: "退回", expire: "过期", reverse: "冲正", adjust: "调整", hold: "冻结", release: "释放" };
const typeTone: Record<string, BadgeTone> = { earn: "success", spend: "info", refund: "info", expire: "neutral", reverse: "danger", adjust: "warn", hold: "warn", release: "success" };

export default function PointsEconomyPanel() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [partnerAccounts, setPartnerAccounts] = useState<PartnerAccount[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [riders, setRiders] = useState<RiderLite[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  /** True until the first load() (all three fetches) settles — stats show "…",
   *  rule inputs stay disabled and a banner explains what's happening. */
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, r, m] = await Promise.all([
      fetch("/api/points", { cache: "no-store" }).catch(() => null),
      fetch("/api/riders", { headers, cache: "no-store" }).catch(() => null),
      fetch("/api/mall", { headers, cache: "no-store" }).catch(() => null),
    ]);
    if (p && p.ok) { const d = (await p.json()).data; setAccounts(d.accounts ?? []); setPartnerAccounts(d.partnerAccounts ?? []); setLedger(d.ledger ?? []); }
    if (r && r.ok) setRiders(((await r.json()).data ?? []) as RiderLite[]);
    if (m && m.ok) { const c = ((await m.json()).data?.config ?? {}) as Config; setConfig(c); setForm(Object.fromEntries(RULE_FIELDS.map((f) => [f.k, String(c[f.k] ?? "")]))); }
    setLoading(false);
  }, [headers]);
  useEffect(() => { void load(); }, [load]);

  const nameOf = useMemo(() => new Map(riders.map((r) => [r.id, r])), [riders]);
  const totals = useMemo(() => ({
    available: accounts.reduce((s, a) => s + a.available, 0),
    pending: accounts.reduce((s, a) => s + a.pending, 0),
    partner: partnerAccounts.reduce((s, a) => s + a.available, 0),
  }), [accounts, partnerAccounts]);

  const userRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return accounts
      .map((a) => ({ ...a, rider: nameOf.get(a.riderId) }))
      .filter((a) => a.available > 0 || a.pending > 0)
      .filter((a) => !term || (a.rider?.name ?? "").toLowerCase().includes(term) || String(a.rider?.ninetyNineId ?? "").includes(term) || a.riderId.includes(term))
      .sort((a, b) => b.available - a.available);
  }, [accounts, nameOf, q]);

  async function saveConfig() {
    const body: Record<string, unknown> = { action: "setConfig" };
    for (const f of RULE_FIELDS) { const v = Number(form[f.k]); if (Number.isFinite(v) && v >= 0) body[f.k] = v; }
    const r = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify(body) }).catch(() => null);
    if (!r || !r.ok) { setNote({ tone: "err", text: "保存失败（需要积分管理权限）" }); return; }
    setNote({ tone: "ok", text: "积分规则已保存，即时生效。" });
    void load();
  }

  const money = (n: number) => n.toLocaleString("pt-BR");
  const field = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <div>
      {loading && (
        <div className="mb-4 rounded-[8px] border border-[var(--info)]/40 bg-[var(--info-bg)] px-4 py-3 text-sm font-black text-[var(--info)]" role="status">
          正在加载积分配置…（余额、账本与规则加载完成前暂不可编辑）
        </div>
      )}
      {note && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${note.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>{note.text}</div>
      )}

      {/* Stats — "…" while the first load is in flight (never fake zeros). */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="流通积分（可用）" value={loading ? "…" : money(totals.available)} />
        <Stat label="待定积分" value={loading ? "…" : money(totals.pending)} />
        <Stat label="Partner 积分" value={loading ? "…" : money(totals.partner)} />
        <Stat label="账本条数" value={loading ? "…" : money(ledger.length)} />
      </section>

      {/* Editable economy rules incl. money equivalence — the panel's single primary action. */}
      <SectionCard
        title="积分规则 · 金钱等价"
        desc="所有发放/兑换/上限规则在此统一管理，改完点保存即时生效。0 表示不限。"
        className="mb-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RULE_FIELDS.map((f) => (
            <label key={String(f.k)} className="text-[11px] font-black text-[var(--muted)]">{f.l}
              <input inputMode="numeric" disabled={loading} value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value.replace(/[^\d]/g, "") })} className={`mt-1 ${field} disabled:opacity-50`} />
              <span className="mt-0.5 block text-[10px] font-bold text-[var(--muted)]">{f.hint}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" disabled={loading} onClick={() => void saveConfig()} className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">保存规则</button>
          <span className="text-[11px] font-bold text-[var(--muted)]">固定规则：积分有效期 <b>12 个月</b>（FIFO 过期）· 站点签到 <b>+50/天</b> · 等级生日加成 prata 50 / ouro 100 / diamante 200（在基础上叠加取高）。</span>
        </div>
      </SectionCard>

      {/* Per-user points balances */}
      <SectionCard
        title={`用户积分余额（${userRows.length} 名有余额会员）`}
        right={<SearchInput value={q} onChange={setQ} placeholder="搜索姓名 / 99ID" className="w-56" />}
        className="mb-4"
      >
        {loading ? <Skeleton rows={5} className="p-1" /> : (
        <div className="overflow-x-auto rounded-[8px] border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead><tr className="bg-[var(--surface-raised)] text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="px-3 py-2">会员</th><th className="px-3 py-2">99 ID</th><th className="px-3 py-2 text-right">可用积分</th><th className="px-3 py-2 text-right">待定积分</th></tr></thead>
            <tbody>
              {userRows.slice(0, 300).map((a) => (
                <tr key={a.riderId} className="border-t border-[var(--line)] font-bold">
                  <td className="px-3 py-2 font-black">{a.rider?.name ?? a.riderId}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--muted)]">{a.rider?.ninetyNineId || "—"}</td>
                  <td className="px-3 py-2 text-right text-[var(--accent)]">{money(a.available)}</td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">{money(a.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {userRows.length === 0 && <div className="py-8 text-center text-xs font-bold text-[var(--muted)]">暂无有余额的会员。</div>}
        </div>
        )}
      </SectionCard>

      {/* Ledger */}
      <SectionCard title="积分流水 · 账本" desc="append-only，不可改">
        {loading ? <Skeleton rows={5} className="p-1" /> : (
        <div className="overflow-x-auto rounded-[8px] border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead><tr className="bg-[var(--surface-raised)] text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="px-3 py-2">时间</th><th className="px-3 py-2">会员</th><th className="px-3 py-2">类型</th><th className="px-3 py-2 text-right">积分</th><th className="px-3 py-2">原因</th><th className="px-3 py-2 text-right">余额</th></tr></thead>
            <tbody>
              {ledger.slice(0, 200).map((e) => (
                <tr key={e.id} className="border-t border-[var(--line)] font-bold">
                  <td className="px-3 py-2 text-[11px] text-[var(--muted)]">{e.createdAt}</td>
                  <td className="px-3 py-2">{nameOf.get(e.riderId)?.name ?? e.riderId}</td>
                  <td className="px-3 py-2"><StatusBadge tone={typeTone[e.type] ?? "neutral"} label={typeLabel[e.type] ?? e.type} /></td>
                  <td className={`px-3 py-2 text-right ${["earn", "refund", "release"].includes(e.type) ? "text-[var(--ok-ink)]" : "text-[var(--danger-ink)]"}`}>{["earn", "refund", "release"].includes(e.type) ? "+" : "−"}{money(e.points)}</td>
                  <td className="px-3 py-2 text-[11px] text-[var(--muted)]">{e.reasonCode}</td>
                  <td className="px-3 py-2 text-right">{money(e.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length === 0 && <div className="py-8 text-center text-xs font-bold text-[var(--muted)]">暂无积分流水。</div>}
        </div>
        )}
      </SectionCard>
    </div>
  );
}
