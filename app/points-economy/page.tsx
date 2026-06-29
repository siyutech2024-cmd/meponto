"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";

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

export default function PointsEconomyPage() {
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

  const load = useCallback(async () => {
    const [p, r, m] = await Promise.all([
      fetch("/api/points", { cache: "no-store" }).catch(() => null),
      fetch("/api/riders", { headers, cache: "no-store" }).catch(() => null),
      fetch("/api/mall", { headers, cache: "no-store" }).catch(() => null),
    ]);
    if (p && p.ok) { const d = (await p.json()).data; setAccounts(d.accounts ?? []); setPartnerAccounts(d.partnerAccounts ?? []); setLedger(d.ledger ?? []); }
    if (r && r.ok) setRiders(((await r.json()).data ?? []) as RiderLite[]);
    if (m && m.ok) { const c = ((await m.json()).data?.config ?? {}) as Config; setConfig(c); setForm(Object.fromEntries(RULE_FIELDS.map((f) => [f.k, String(c[f.k] ?? "")]))); }
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
    if (!r || !r.ok) { setNote({ tone: "err", text: "保存失败(需要积分管理权限)" }); return; }
    setNote({ tone: "ok", text: "积分规则已保存,即时生效。" });
    void load();
  }

  const money = (n: number) => n.toLocaleString("pt-BR");
  const field = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

  return (
    <AppShell>
      <PageTitle title="积分经济" eyebrow="积分规则 · 金钱等价 · 用户余额 · 账本" />

      {note && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${note.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>{note.text}</div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["流通积分(可用)", money(totals.available)], ["待定积分", money(totals.pending)], ["Partner 积分", money(totals.partner)], ["账本条数", money(ledger.length)]].map(([l, v]) => (
          <div key={l} className="panel p-4"><div className="text-[10px] font-black uppercase text-[var(--muted)]">{l}</div><div className="mt-1 text-2xl font-black">{v}</div></div>
        ))}
      </section>

      {/* Editable economy rules incl. money equivalence */}
      <div className="panel mb-4 p-5">
        <div className="mb-1 text-sm font-black">积分规则 · 金钱等价（改完点保存即时生效)</div>
        <p className="mb-3 text-xs font-bold text-[var(--muted)]">所有发放/兑换/上限规则在此统一管理。0 表示不限。</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RULE_FIELDS.map((f) => (
            <label key={String(f.k)} className="text-[11px] font-black text-[var(--muted)]">{f.l}
              <input inputMode="numeric" value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value.replace(/[^\d]/g, "") })} className={`mt-1 ${field}`} />
              <span className="mt-0.5 block text-[10px] font-bold text-[var(--muted)]">{f.hint}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void saveConfig()} className="h-10 rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]">保存规则</button>
          <span className="text-[11px] font-bold text-[var(--muted)]">固定规则:积分有效期 <b>12 个月</b>(FIFO 过期)· 站点签到 <b>+50/天</b> · 等级生日加成 prata 50 / ouro 100 / diamante 200(在基础上叠加取高)。</span>
        </div>
      </div>

      {/* Per-user points balances */}
      <div className="panel mb-4 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-black">用户积分余额（{userRows.length} 名有余额会员)</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索姓名 / 99ID" className="ml-auto h-9 w-56 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </div>
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
      </div>

      {/* Ledger */}
      <div className="panel p-5">
        <div className="mb-3 text-sm font-black">积分流水 · 账本(append-only,不可改)</div>
        <div className="overflow-x-auto rounded-[8px] border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead><tr className="bg-[var(--surface-raised)] text-left text-[11px] font-black uppercase text-[var(--muted)]"><th className="px-3 py-2">时间</th><th className="px-3 py-2">会员</th><th className="px-3 py-2">类型</th><th className="px-3 py-2 text-right">积分</th><th className="px-3 py-2">原因</th><th className="px-3 py-2 text-right">余额</th></tr></thead>
            <tbody>
              {ledger.slice(0, 200).map((e) => (
                <tr key={e.id} className="border-t border-[var(--line)] font-bold">
                  <td className="px-3 py-2 text-[11px] text-[var(--muted)]">{e.createdAt}</td>
                  <td className="px-3 py-2">{nameOf.get(e.riderId)?.name ?? e.riderId}</td>
                  <td className="px-3 py-2"><Badge value={typeLabel[e.type] ?? e.type} /></td>
                  <td className={`px-3 py-2 text-right ${["earn", "refund", "release"].includes(e.type) ? "text-[var(--ok-ink)]" : "text-[var(--danger-ink)]"}`}>{["earn", "refund", "release"].includes(e.type) ? "+" : "−"}{money(e.points)}</td>
                  <td className="px-3 py-2 text-[11px] text-[var(--muted)]">{e.reasonCode}</td>
                  <td className="px-3 py-2 text-right">{money(e.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length === 0 && <div className="py-8 text-center text-xs font-bold text-[var(--muted)]">暂无积分流水。</div>}
        </div>
      </div>
    </AppShell>
  );
}
