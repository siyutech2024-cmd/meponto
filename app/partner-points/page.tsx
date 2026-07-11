"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Wallet } from "lucide-react";
import { AppShell, PageTitle } from "../components/ui";
import { DataTable, Drawer, SearchInput, Stat, StatusBadge, Toolbar, type BadgeTone, type DataColumn } from "../components/kit";
import type { CrmPartner } from "../lib/crm";
import type { Rider } from "../lib/data";
import type { PartnerServiceCategory, PartnerServiceRecord } from "../lib/points";

const categories: PartnerServiceCategory[] = ["fuel", "maintenance", "phone_data", "equipment", "vehicle_service"];

/** Brazil-facing labels for the partner operator surface. */
const categoryLabel: Record<PartnerServiceCategory, string> = {
  fuel: "Combustível",
  maintenance: "Manutenção / óleo",
  phone_data: "Telefonia / dados",
  equipment: "Equipamento de segurança",
  vehicle_service: "Serviço veicular",
};

const serviceStatusLabel: Record<string, string> = {
  confirmed: "Confirmado",
  pending: "Em análise",
  rejected: "Recusado",
};

const serviceStatusTone: Record<string, BadgeTone> = {
  confirmed: "success",
  pending: "warn",
  rejected: "danger",
};

type LedgerRow = { id: string; type: string; points: number; status: string; createdAt: string; balanceAfter: number };
type PartnerMe = { accountType?: string; name?: string; balance?: number; ledger?: LedgerRow[] };

const STORE_URL = "https://mall.meponto.com/";
const positiveLedger = new Set(["earn", "refund", "release", "adjust"]);

export default function PartnerPointsPage() {
  const [services, setServices] = useState<PartnerServiceRecord[]>([]);
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [riderId, setRiderId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [category, setCategory] = useState<PartnerServiceCategory>("maintenance");
  const [amount, setAmount] = useState(120);
  const [receiptRef, setReceiptRef] = useState("");
  const [message, setMessage] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/partner/services", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/crm", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/riders", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/mall", { cache: "no-store" }).then((response) => response.json()).catch(() => null),
    ]).then(([servicesPayload, partnersPayload, ridersPayload, mallPayload]) => {
      if (!active) return;
      setServices(servicesPayload.data);
      setPartners(partnersPayload.data);
      setRiders(ridersPayload.data);
      setPartnerId(partnersPayload.data[0]?.id ?? "");
      setRiderId(ridersPayload.data[0]?.id ?? "");
      const mallMe = mallPayload?.data?.me;
      if (mallMe?.accountType === "partner") setMe(mallMe);
    });
    return () => {
      active = false;
    };
  }, []);

  const riderName = (id: string) => riders.find((rider) => rider.id === id)?.name ?? id;
  const partnerName = (id: string) => partners.find((partner) => partner.id === id)?.name ?? id;

  const shownServices = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return services;
    return services.filter((service) =>
      `${riderName(service.riderId)} ${partnerName(service.partnerId)} ${service.receiptRef}`.toLowerCase().includes(term),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, riders, partners, query]);

  async function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/partner/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riderId, partnerId, category, amount, receiptRef }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Não foi possível registrar o serviço.");
      return;
    }
    setServices((current) => [payload.data.service, ...current]);
    setMessage(
      payload.data.service.status === "confirmed"
        ? "Benefício confirmado — os pontos do parceiro entram após a liberação."
        : "Serviço enviado para análise.",
    );
  }

  const field = "mt-1 h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 font-bold outline-none focus:border-[var(--accent)]";

  const columns: Array<DataColumn<PartnerServiceRecord>> = [
    { key: "createdAt", label: "Data", render: (service) => <span className="text-xs font-bold text-[var(--muted)]">{service.createdAt}</span> },
    { key: "rider", label: "Entregador", render: (service) => <span className="font-black">{riderName(service.riderId)}</span> },
    { key: "partner", label: "Parceiro", render: (service) => partnerName(service.partnerId) },
    { key: "category", label: "Categoria", render: (service) => categoryLabel[service.category] ?? service.category },
    { key: "amount", label: "Valor", align: "right", render: (service) => `R$ ${service.amount}` },
    { key: "discount", label: "Desconto", align: "right", render: (service) => `R$ ${service.riderDiscountBrl}` },
    { key: "points", label: "Pontos", align: "right", render: (service) => <span className="font-black text-[var(--accent)]">{service.partnerPoints}</span> },
    { key: "status", label: "Status", render: (service) => <StatusBadge tone={serviceStatusTone[service.status] ?? "neutral"} label={serviceStatusLabel[service.status] ?? service.status} /> },
    { key: "reason", label: "Motivo", render: (service) => <span className="text-xs font-bold text-[var(--muted)]">{service.reviewReason ?? "OK"}</span> },
  ];

  return (
    <AppShell>
      <PageTitle
        title="Pontos do parceiro"
        eyebrow="Registrar serviço ao entregador (escaneie o QR de membro) e creditar pontos ao parceiro"
        action={
          <button
            type="button"
            onClick={() => { setMessage(""); setRegisterOpen(true); }}
            className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-black uppercase text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
          >
            <Plus size={14} /> Registrar serviço
          </button>
        }
      />

      {/* Cadastro, aprovação e contas de login dos parceiros vivem no CRM. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-[var(--line)] p-3 text-xs font-bold text-[var(--muted)]">
        <span>合作方的入驻 / 审核 / 开通登录账号在「合作伙伴 CRM」。本页只用于<b className="text-[var(--text)]">给骑手核销一笔合作方服务</b>。</span>
        <a href="/crm" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--accent)] px-3 font-black text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]">管理 / 审核合作方 → CRM</a>
      </div>

      {/* Saldo do parceiro logado + entrada na loja (fecha o ciclo ganhar → ver → gastar). */}
      {me?.accountType === "partner" && (
        <section className="panel mb-4 flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]"><Wallet size={20} /></span>
            <div>
              <div className="text-[11px] font-black uppercase text-[var(--muted)]">Saldo de pontos · {me.name}</div>
              <div className="text-2xl font-black">{(me.balance ?? 0).toLocaleString("pt-BR")} pts</div>
            </div>
          </div>
          <a
            href={STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] border border-[var(--accent)] px-5 text-sm font-black text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
          >
            <ExternalLink size={16} /> Entrar na loja e resgatar
          </a>
        </section>
      )}

      {me?.ledger && me.ledger.length > 0 && (
        <section className="panel mb-4 p-4">
          <div className="mb-2 text-[11px] font-black uppercase text-[var(--muted)]">Extrato recente</div>
          <div className="space-y-1.5">
            {me.ledger.slice(0, 8).map((row) => {
              const positive = positiveLedger.has(row.type);
              return (
                <div key={row.id} className="flex items-center justify-between gap-3 text-sm font-bold">
                  <span className="text-[var(--muted)]">{row.createdAt.slice(0, 10)}</span>
                  <span className={positive ? "text-[var(--ok,#1d7a3e)]" : "text-[var(--danger,#c4423b)]"}>
                    {positive ? "+" : "−"}{row.points.toLocaleString("pt-BR")}
                  </span>
                  <span className="w-24 text-right text-[var(--muted)]">Saldo {row.balanceAfter.toLocaleString("pt-BR")}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stats */}
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Serviços" value={String(services.length)} />
        <Stat label="Confirmados" value={String(services.filter((item) => item.status === "confirmed").length)} />
        <Stat label="Em análise" value={String(services.filter((item) => item.status === "pending").length)} />
        <Stat label="Regra de recibo" value="Sem duplicidade" />
      </section>

      {/* Toolbar */}
      <div className="my-4">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar entregador / parceiro / recibo" className="w-72" />
        </Toolbar>
      </div>

      {/* Service records */}
      <DataTable<PartnerServiceRecord>
        columns={columns}
        rows={shownServices}
        rowKey={(service) => service.id}
        minWidth={860}
        empty="Nenhum serviço registrado."
      />

      {/* Registrar serviço drawer */}
      <Drawer open={registerOpen} onClose={() => setRegisterOpen(false)} title={<div className="text-sm font-black uppercase">Registrar serviço · 核销合作方服务</div>} ariaLabel="Registrar serviço">
        <form onSubmit={submitService} className="grid gap-3">
          <label className="text-[11px] font-black text-[var(--muted)]">Parceiro 合作方
            <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className={field}>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>{partner.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-black text-[var(--muted)]">Entregador 骑手（会员码）
            <select value={riderId} onChange={(event) => setRiderId(event.target.value)} className={field}>
              {riders.map((rider) => (
                <option key={rider.id} value={rider.id}>{rider.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-black text-[var(--muted)]">Categoria 品类
            <select value={category} onChange={(event) => setCategory(event.target.value as PartnerServiceCategory)} className={field}>
              {categories.map((item) => (
                <option key={item} value={item}>{categoryLabel[item]}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-black text-[var(--muted)]">Valor R$
            <input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} className={field} />
          </label>
          <label className="text-[11px] font-black text-[var(--muted)]">Recibo / NF
            <input value={receiptRef} onChange={(event) => setReceiptRef(event.target.value)} placeholder="Nº do comprovante" className={field} />
          </label>
          <button
            disabled={!riderId || !partnerId || !receiptRef.trim() || !(amount > 0)}
            className="h-11 rounded-[8px] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            Registrar serviço
          </button>
          {message ? <div className="text-sm font-bold text-[var(--text-soft)]">{message}</div> : null}
        </form>
      </Drawer>
    </AppShell>
  );
}
