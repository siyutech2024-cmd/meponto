"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Plus, RefreshCcw, Store, Trash2, UserRound } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { readSession } from "../lib/session";
import { mapsEmbedUrl, type Franchise } from "../lib/network";
import type { Ponto } from "../lib/data";

type FranchiseRow = Franchise & { stationCount: number };

const input = "h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";

export default function NetworkPage() {
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }), [session]);
  const franchiseScope = session?.portal === "franchise" ? session.franchise || session.organization : "";

  const [franchises, setFranchises] = useState<FranchiseRow[]>([]);
  const [stations, setStations] = useState<Ponto[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [franchiseForm, setFranchiseForm] = useState({ name: "", owner: "", phone: "", city: "São Paulo" });
  const [stationForm, setStationForm] = useState({ name: "", franchise: "", address: "", mapUrl: "", leader: "" });

  const load = useCallback(async () => {
    const response = await fetch("/api/network", { headers, cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setFranchises(payload.data.franchises);
      setStations(payload.data.stations);
    }
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/network", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ tone: "err", text: payload.error ?? `操作失败 (${response.status})` });
      return null;
    }
    void load();
    return payload;
  }

  const shownStations = franchiseScope ? stations.filter((s) => s.franchise === franchiseScope) : stations;
  const isHq = !franchiseScope;

  return (
    <AppShell>
      <PageTitle
        title="网络架构"
        eyebrow={isHq ? "总部 → 加盟商 → 站点 · 层级绑定" : `加盟商视角 · ${franchiseScope}`}
        action={<button type="button" onClick={() => void load()} className="tag inline-flex items-center gap-1"><RefreshCcw size={13} /> 刷新</button>}
      />

      {message && (
        <div className={`mb-4 rounded-[8px] border px-4 py-3 text-sm font-black ${message.tone === "ok" ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger-ink)]"}`}>
          {message.text}
        </div>
      )}

      {isHq && (
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Building2 size={14} /> 加盟商（{franchises.length}）</div>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {franchises.map((franchise) => (
              <div key={franchise.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black">{franchise.name}</div>
                  <button
                    type="button"
                    title="删除（需先迁移下属站点）"
                    onClick={async () => {
                      if (!window.confirm(`删除加盟商「${franchise.name}」？`)) return;
                      const response = await fetch("/api/network", { method: "POST", headers, body: JSON.stringify({ action: "deleteFranchise", franchiseId: franchise.id }) });
                      const payload = await response.json().catch(() => ({}));
                      if (response.ok) {
                        setMessage({ tone: "ok", text: `「${franchise.name}」已删除。` });
                        void load();
                        return;
                      }
                      // Bound stations: offer force-delete (stations become unbound).
                      if (response.status === 409 && payload.canForce) {
                        if (window.confirm(`${payload.error}\n\n强制删除？其站点将变为「未绑定」，可稍后迁移到其他加盟商。`)) {
                          const r2 = await post({ action: "deleteFranchise", franchiseId: franchise.id, force: true });
                          if (r2) setMessage({ tone: "ok", text: `「${franchise.name}」已删除，${r2.data?.unbound ?? 0} 个站点已解除绑定。` });
                        }
                        return;
                      }
                      setMessage({ tone: "err", text: payload.error ?? `删除失败 (${response.status})` });
                    }}
                    className="text-[var(--muted)] hover:text-[var(--danger-ink)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1 text-[11px] font-bold text-[var(--muted)]">
                  {franchise.owner || "—"}{franchise.phone && ` ｜ ${franchise.phone}`} ｜ {franchise.city}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge value={`${franchise.stationCount} 个站点`} />
                  <span className={`text-[11px] font-black ${(franchise.depositBalance ?? 0) < 0 ? "text-[var(--danger-ink)]" : "text-[var(--accent)]"}`}>
                    预存 R$ {(franchise.depositBalance ?? 0).toFixed(2)}{(franchise.depositBalance ?? 0) < 0 && "（欠款，请充值）"}
                  </span>
                  <button
                    type="button"
                    className="tag"
                    onClick={async () => {
                      const raw = window.prompt(`为「${franchise.name}」充值预存金额（负数=扣减）：`, "");
                      const amount = Number(raw);
                      if (!raw || !Number.isFinite(amount) || amount === 0) return;
                      const r = await post({ action: "depositFranchise", franchiseId: franchise.id, amount, note: "后台手工调整" });
                      if (r) setMessage({ tone: "ok", text: `「${franchise.name}」预存余额已更新：R$ ${Number(r.data?.depositBalance ?? 0).toFixed(2)}` });
                    }}
                  >
                    充值
                  </button>
                </div>
              </div>
            ))}
            {franchises.length === 0 && <div className="text-sm font-bold text-[var(--muted)]">还没有加盟商，先在下方创建。</div>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input className={input} placeholder="加盟商名称 *" value={franchiseForm.name} onChange={(e) => setFranchiseForm({ ...franchiseForm, name: e.target.value })} />
            <input className={input} placeholder="负责人" value={franchiseForm.owner} onChange={(e) => setFranchiseForm({ ...franchiseForm, owner: e.target.value })} />
            <input className={input} placeholder="联系电话" value={franchiseForm.phone} onChange={(e) => setFranchiseForm({ ...franchiseForm, phone: e.target.value })} />
            <input className={input} placeholder="城市" value={franchiseForm.city} onChange={(e) => setFranchiseForm({ ...franchiseForm, city: e.target.value })} />
            <button
              type="button"
              disabled={!franchiseForm.name.trim()}
              onClick={async () => {
                const r = await post({ action: "addFranchise", ...franchiseForm });
                if (r) {
                  setMessage({ tone: "ok", text: `加盟商 ${franchiseForm.name} 已创建。` });
                  setFranchiseForm({ name: "", owner: "", phone: "", city: "São Paulo" });
                }
              }}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-[8px] bg-[var(--accent)] text-xs font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
            >
              <Plus size={14} /> 新增加盟商
            </button>
          </div>
        </div>
      )}

      <div className="panel mb-4 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]"><Store size={14} /> 新增站点（必须绑定上级加盟商 + 地址/地图）</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input className={input} placeholder="站点名称 *" value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} />
          <select className={input} value={stationForm.franchise} onChange={(e) => setStationForm({ ...stationForm, franchise: e.target.value })}>
            <option value="">上级加盟商 *</option>
            {franchises.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
          <input className={`${input} lg:col-span-2`} placeholder="站点地址（如 Rua Augusta 1000, São Paulo）*" value={stationForm.address} onChange={(e) => setStationForm({ ...stationForm, address: e.target.value })} />
          <input className={input} placeholder="Google Maps 链接（选填）" value={stationForm.mapUrl} onChange={(e) => setStationForm({ ...stationForm, mapUrl: e.target.value })} />
          <input className={input} placeholder="站点负责人" value={stationForm.leader} onChange={(e) => setStationForm({ ...stationForm, leader: e.target.value })} />
        </div>
        <button
          type="button"
          disabled={!stationForm.name.trim() || !stationForm.franchise || (!stationForm.address.trim() && !stationForm.mapUrl.trim())}
          onClick={async () => {
            const r = await post({ action: "addStation", ...stationForm });
            if (r) {
              setMessage({ tone: "ok", text: `站点 ${stationForm.name} 已创建并绑定 ${stationForm.franchise}。` });
              setStationForm({ name: "", franchise: "", address: "", mapUrl: "", leader: "" });
            }
          }}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--accent)] px-6 text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
        >
          <Plus size={15} /> 创建站点
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shownStations.map((station) => {
          const embed = mapsEmbedUrl(station.address, station.mapUrl);
          return (
            <div key={station.id} className="panel overflow-hidden p-0">
              {embed ? (
                <iframe src={embed} title={`Mapa ${station.name}`} loading="lazy" className="h-44 w-full border-0 grayscale-[0.25] contrast-[1.05]" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <div className="grid h-44 w-full place-items-center bg-gradient-to-br from-[var(--accent-glow)] to-[var(--surface-raised)] text-[var(--accent)]">
                  <MapPin size={36} />
                </div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black">{station.name}</span>
                  <Badge value={station.franchise || "未绑定"} />
                  <span className="tag">{station.bairro}</span>
                </div>
                {station.address && (
                  <a
                    href={station.mapUrl?.trim() || `https://maps.google.com/maps?q=${encodeURIComponent(station.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-1.5 text-[12px] font-bold text-[var(--muted-strong)] hover:text-[var(--accent)]"
                  >
                    <MapPin size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {station.address}
                  </a>
                )}
                <div className="flex items-center gap-3 text-[11px] font-bold text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1"><UserRound size={12} /> {station.leader || "—"}</span>
                  <span>骑手 {station.ridersCount}</span>
                  <span>安全 {station.safetyScore}/100</span>
                </div>
                {isHq && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      className="tag"
                      onClick={async () => {
                        const address = window.prompt("站点地址：", station.address ?? "");
                        if (address === null) return;
                        const mapUrl = window.prompt("Google Maps 链接（可留空）:", station.mapUrl ?? "") ?? "";
                        const r = await post({ action: "updateStation", stationId: station.id, address, mapUrl });
                        if (r) setMessage({ tone: "ok", text: "站点位置已更新。" });
                      }}
                    >
                      编辑位置
                    </button>
                    <button
                      type="button"
                      className="tag"
                      onClick={async () => {
                        const next = window.prompt(`迁移「${station.name}」到加盟商（现有：${franchises.map((f) => f.name).join(" / ")}）:`, station.franchise ?? "");
                        if (!next?.trim()) return;
                        const r = await post({ action: "updateStation", stationId: station.id, franchise: next.trim() });
                        if (r) setMessage({ tone: "ok", text: `已绑定到 ${next.trim()}。` });
                      }}
                    >
                      变更上级
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {shownStations.length === 0 && <div className="panel p-6 text-sm font-bold text-[var(--muted)]">暂无站点。</div>}
      </div>
    </AppShell>
  );
}
