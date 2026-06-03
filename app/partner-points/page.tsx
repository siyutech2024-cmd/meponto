"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import type { CrmPartner } from "../lib/crm";
import type { Rider } from "../lib/data";
import type { PartnerServiceCategory, PartnerServiceRecord } from "../lib/points";

const categories: PartnerServiceCategory[] = ["fuel", "maintenance", "phone_data", "equipment", "vehicle_service"];

export default function PartnerPointsPage() {
  const [services, setServices] = useState<PartnerServiceRecord[]>([]);
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [riderId, setRiderId] = useState("r-1002");
  const [partnerId, setPartnerId] = useState("");
  const [category, setCategory] = useState<PartnerServiceCategory>("maintenance");
  const [amount, setAmount] = useState(120);
  const [receiptRef, setReceiptRef] = useState("NF-DEMO-001");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/partner/services", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/crm", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/riders", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([servicesPayload, partnersPayload, ridersPayload]) => {
      if (!active) return;
      setServices(servicesPayload.data);
      setPartners(partnersPayload.data);
      setRiders(ridersPayload.data);
      setPartnerId(partnersPayload.data[0]?.id ?? "");
    });
    return () => {
      active = false;
    };
  }, []);

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
      setMessage(payload.error ?? "Partner service failed");
      return;
    }
    setServices((current) => [payload.data.service, ...current]);
    setMessage(payload.data.service.status === "confirmed" ? "Benefit confirmed; partner points are pending release." : "Service held for review.");
  }

  return (
    <AppShell>
      <PageTitle title="Partner Points" eyebrow="Partner scans rider member QR to grant discounts and earn fixed points" />
      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Services" value={String(services.length)} />
        <Field label="Confirmed" value={String(services.filter((item) => item.status === "confirmed").length)} />
        <Field label="Pending Review" value={String(services.filter((item) => item.status === "pending").length)} />
        <Field label="Receipt Rule" value="No duplicate" />
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
            <option key={item}>{item}</option>
          ))}
        </select>
        <input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" />
        <input value={receiptRef} onChange={(event) => setReceiptRef(event.target.value)} className="h-11 rounded border border-[var(--line)] bg-[var(--surface)] px-3 outline-none" />
        <button className="h-11 rounded border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)]">Submit</button>
        {message ? <div className="text-sm font-bold text-[var(--text-soft)] lg:col-span-6">{message}</div> : null}
      </form>

      <DataTable
        headers={["Created", "Rider", "Partner", "Category", "Cash Amount", "Rider Discount", "Partner Points", "Status", "Reason"]}
        rows={services.map((service) => [
          service.createdAt,
          service.riderId,
          service.partnerId,
          service.category,
          `R$ ${service.amount}`,
          `R$ ${service.riderDiscountBrl}`,
          service.partnerPoints,
          <Badge key="status" value={service.status} />,
          service.reviewReason ?? "OK",
        ])}
      />
    </AppShell>
  );
}
