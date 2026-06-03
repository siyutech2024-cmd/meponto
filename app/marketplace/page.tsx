"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PackageCheck, ShoppingCart, Store } from "lucide-react";
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
  const availableProducts = useMemo(
    () => products.filter((product) => product.audience === "both" || product.audience === accountType),
    [accountType, products],
  );
  const selectedProduct = products.find((product) => product.id === productId) ?? availableProducts[0];

  useEffect(() => {
    if (availableProducts.length && !availableProducts.some((product) => product.id === productId)) {
      setProductId(availableProducts[0].id);
    }
  }, [availableProducts, productId]);

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
        <Field label="Active Products" value={<span className="text-2xl">{products.length}</span>} />
        <Field label="Stock Units" value={<span className="text-2xl">{stock}</span>} />
        <Field label="Orders" value={<span className="text-2xl">{orders.length}</span>} />
        <Field label="Rule Source" value="Points Economy" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
                  <Store size={16} />
                  Catalog workspace
                </div>
                <h2 className="mt-1 text-xl font-black">商品库存与兑换规则</h2>
              </div>
              <Badge value={`${availableProducts.length} eligible`} />
            </div>
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
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShoppingCart className="text-[var(--ok)]" size={18} />
              <h2 className="text-lg font-black">兑换订单</h2>
            </div>
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
          </div>
        </div>

        <aside className="space-y-4">
          <form onSubmit={redeem} className="panel grid gap-3 p-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
                <PackageCheck size={16} />
                Quick redemption
              </div>
              <h2 className="mt-1 text-xl font-black">创建兑换订单</h2>
            </div>
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as "rider" | "partner")} className="h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
              <option value="rider">Rider account</option>
              <option value="partner">Partner account</option>
            </select>
            {accountType === "partner" ? (
              <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className="h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>{partner.name}</option>
                ))}
              </select>
            ) : (
              <select value={riderId} onChange={(event) => setRiderId(event.target.value)} className="h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
                {riders.map((rider) => (
                  <option key={rider.id} value={rider.id}>{rider.name}</option>
                ))}
              </select>
            )}
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-11 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[var(--text)] outline-none">
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.name} - {product.pointsPrice} pts</option>
              ))}
            </select>
            <button className="h-11 rounded-[8px] border border-transparent bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-strong)]">Redeem</button>
            {message ? <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm font-bold text-[var(--text-soft)]">{message}</div> : null}
          </form>

          <div className="panel p-4">
            <div className="text-xs font-black uppercase text-[var(--muted)]">Selected product</div>
            <h2 className="mt-1 text-xl font-black">{selectedProduct?.name ?? "No product"}</h2>
            <div className="mt-4 grid gap-3">
              <Field label="Price" value={selectedProduct ? `${selectedProduct.pointsPrice} pts` : "-"} />
              <Field label="Stock" value={selectedProduct?.stock ?? "-"} />
              <Field label="Audience" value={selectedProduct?.audience ?? "-"} />
              <Field label="City" value={selectedProduct?.city ?? "-"} />
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
