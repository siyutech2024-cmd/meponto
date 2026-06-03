"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import type { MarketplaceOrder, MarketplaceProduct } from "../lib/points";
import type { Rider } from "../lib/data";

export default function MarketplacePage() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [partners, setPartners] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [accountType, setAccountType] = useState<"rider" | "partner">("rider");
  const [riderId, setRiderId] = useState("r-1002");
  const [partnerId, setPartnerId] = useState("");
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/marketplace/catalog", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/marketplace/orders", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/riders", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/crm", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([catalogPayload, ordersPayload, ridersPayload, partnersPayload]) => {
      if (!active) return;
      setProducts(catalogPayload.data);
      setOrders(ordersPayload.data);
      setRiders(ridersPayload.data);
      setPartners(partnersPayload.data.filter((partner: { category: string }) => partner.category !== "Supplier"));
      setProductId(catalogPayload.data[0]?.id ?? "");
      setPartnerId(partnersPayload.data.find((partner: { category: string }) => partner.category !== "Supplier")?.id ?? "");
    });
    return () => {
      active = false;
    };
  }, []);

  const stock = useMemo(() => products.reduce((sum, product) => sum + product.stock, 0), [products]);

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/marketplace/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountType === "partner" ? { accountType, partnerId, productId } : { accountType, riderId, productId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Redemption failed");
      return;
    }
    setOrders((current) => [payload.data.order, ...current]);
    setProducts((current) => current.map((product) => (product.id === productId ? { ...product, stock: product.stock - 1 } : product)));
    setMessage("Redemption order created and points debited.");
  }

  return (
    <AppShell>
      <PageTitle title="PontoMall" eyebrow="Points catalog, redemption, stock reserve" />
      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Active Products" value={String(products.length)} />
        <Field label="Stock Units" value={String(stock)} />
        <Field label="Orders" value={String(orders.length)} />
        <Field label="Rule Source" value="Points Economy" />
      </section>

      <form onSubmit={redeem} className="panel my-4 grid gap-3 p-4 lg:grid-cols-[180px_1fr_1fr_auto]">
        <select value={accountType} onChange={(event) => setAccountType(event.target.value as "rider" | "partner")} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
          <option value="rider">Rider account</option>
          <option value="partner">Partner account</option>
        </select>
        {accountType === "partner" ? (
          <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>{partner.name}</option>
            ))}
          </select>
        ) : (
          <select value={riderId} onChange={(event) => setRiderId(event.target.value)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
            {riders.map((rider) => (
              <option key={rider.id} value={rider.id}>{rider.name}</option>
            ))}
          </select>
        )}
        <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
          {products
            .filter((product) => product.audience === "both" || product.audience === accountType)
            .map((product) => (
              <option key={product.id} value={product.id}>{product.name} - {product.pointsPrice} pts</option>
            ))}
        </select>
        <button className="h-10 rounded-[8px] border border-transparent bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-strong)]">Redeem</button>
        {message ? <div className="text-sm font-bold text-[var(--text-soft)] lg:col-span-3">{message}</div> : null}
      </form>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable
          headers={["Product", "Audience", "Type", "Price", "Stock", "City", "Status"]}
          rows={products.map((product) => [
            product.name,
            product.audience,
            product.type,
            `${product.pointsPrice} pts`,
            product.stock,
            product.city,
            <Badge key="status" value={product.status} />,
          ])}
        />
        <DataTable
          headers={["Created", "Order", "Account", "Product", "Points", "Status"]}
          rows={orders.map((order) => [
            order.createdAt,
            order.id,
            order.accountType === "partner" ? order.partnerId : order.riderId,
            order.productId,
            order.pointsSpent,
            <Badge key="status" value={order.status} />,
          ])}
        />
      </section>
    </AppShell>
  );
}
