"use client";

import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, Wallet } from "lucide-react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
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

  return (
    <AppShell>
      <PageTitle title="Pontos do parceiro" eyebrow="Escaneie o QR de membro do entregador para conceder descontos e ganhar pontos" />

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
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] bg-[var(--accent)] px-5 text-sm font-black text-[var(--accent-ink)]"
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

      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Serviços" value={String(services.length)} />
        <Field label="Confirmados" value={String(services.filter((item) => item.status === "confirmed").length)} />
        <Field label="Em análise" value={String(services.filter((item) => item.status === "pending").length)} />
        <Field label="Regra de recibo" value="Sem duplicidade" />
      </section>

      <form onSubmit={submitService} className="panel my-4 grid gap-3 p-4 lg:grid-cols-6">
        <select value={riderId} onChange={(event) => setRiderId(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          {riders.map((rider) => (
            <option key={rider.id} value={rider.id}>{rider.name}</option>
          ))}
        </select>
        <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>{partner.name}</option>
          ))}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value as PartnerServiceCategory)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none">
          {categories.map((item) => (
            <option key={item} value={item}>{categoryLabel[item]}</option>
          ))}
        </select>
        <input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" />
        <input value={receiptRef} onChange={(event) => setReceiptRef(event.target.value)} placeholder="Nº do recibo / NF" className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" />
        <button disabled={!riderId || !partnerId || !receiptRef.trim() || !(amount > 0)} className="h-11 rounded border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] disabled:opacity-50">Registrar</button>
        {message ? <div className="text-sm font-bold text-[var(--text-soft)] lg:col-span-6">{message}</div> : null}
      </form>

      <DataTable
        headers={["Data", "Entregador", "Parceiro", "Categoria", "Valor", "Desconto", "Pontos", "Status", "Motivo"]}
        rows={services.map((service) => [
          service.createdAt,
          riderName(service.riderId),
          partnerName(service.partnerId),
          categoryLabel[service.category] ?? service.category,
          `R$ ${service.amount}`,
          `R$ ${service.riderDiscountBrl}`,
          service.partnerPoints,
          <Badge key="status" value={serviceStatusLabel[service.status] ?? service.status} />,
          service.reviewReason ?? "OK",
        ])}
      />
    </AppShell>
  );
}
