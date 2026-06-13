import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { sendPushToRider } from "../../lib/server/notify";
import { getAvailablePoints, type MarketplaceOrder, type MarketplaceProduct, type PointsLedgerEntry } from "../../lib/points";
import { defaultMallConfig, resolveTier, tierDefinitions, type MallConfig } from "../../lib/mall";

const COLLECTIONS = ["mallConfigs", "marketplaceProducts", "marketplaceOrders", "pointsLedgerEntries", "partnerPointsLedgerEntries", "riders", "riderDailyKpis", "mallCategories", "mallBanners", "mallPayments"];

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function getConfig(): MallConfig {
  return memory.mallConfigs.find((item) => item.id === "mall-config") ?? defaultMallConfig;
}

function lifetimeOrders(rider99Id: string | undefined): number | null {
  if (!rider99Id) return null;
  const rows = memory.riderDailyKpis.filter((row) => row.rider99Id === rider99Id);
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + (row.completedOrders ?? 0), 0);
}

const MONTH_MS = 30 * 24 * 3600 * 1000;

/**
 * FIFO points expiry: points earned more than 12 months ago that were never
 * consumed (spends/expiries count against the oldest earns first) are written
 * off with an auditable "expire" ledger entry. Runs lazily on account access.
 */
function applyPointsExpiry(riderId: string): number {
  const now = Date.now();
  let earnedOld = 0;
  let consumed = 0;
  for (const entry of memory.pointsLedgerEntries) {
    if (entry.riderId !== riderId || entry.status !== "approved") continue;
    if (entry.type === "earn" && now - new Date(entry.createdAt.replace(" ", "T")).getTime() > 12 * MONTH_MS) earnedOld += entry.points;
    if (entry.type === "spend" || entry.type === "expire") consumed += entry.points;
  }
  if (earnedOld <= 0) return 0;
  const available = getAvailablePoints(memory.pointsLedgerEntries, riderId);
  const toExpire = Math.min(available, earnedOld - consumed);
  if (toExpire <= 0) return 0;
  memory.pointsLedgerEntries.unshift({
    id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
    riderId,
    accountId: `pts-${riderId}`,
    type: "expire",
    points: toExpire,
    status: "approved",
    sourceType: "expiry",
    sourceId: `exp-${Date.now()}`,
    balanceAfter: available - toExpire,
    reasonCode: "POINTS_EXPIRED_12M",
    note: "Pontos com mais de 12 meses expiraram automaticamente (FIFO).",
    createdBy: "System",
    createdAt: nowStamp(),
  });
  return toExpire;
}

/** Achievement badges driven by lifetime completed orders. */
const badgeMilestones = [
  { at: 1, icon: "🚀", label: "Primeira entrega" },
  { at: 50, icon: "🔥", label: "50 pedidos" },
  { at: 100, icon: "💪", label: "100 pedidos" },
  { at: 300, icon: "🏅", label: "300 pedidos" },
  { at: 600, icon: "👑", label: "600 pedidos" },
];

function creditPoints(riderId: string, points: number, reasonCode: string, note: string, sourceId: string, actor: string): PointsLedgerEntry {
  const available = getAvailablePoints(memory.pointsLedgerEntries, riderId);
  const entry: PointsLedgerEntry = {
    id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
    riderId,
    accountId: `pts-${riderId}`,
    type: "earn",
    points,
    status: "approved",
    sourceType: "admin_adjustment",
    sourceId,
    balanceAfter: available + points,
    reasonCode,
    note,
    createdBy: actor,
    createdAt: nowStamp(),
  };
  memory.pointsLedgerEntries.unshift(entry);
  return entry;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopeStation = url.searchParams.get("station") ?? "";
  const scopeFranchise = url.searchParams.get("franchise") ?? "";
  const riderId = url.searchParams.get("riderId") ?? "";
  const riderName = url.searchParams.get("riderName") ?? "";

  await refreshCollectionsFromDatabase(COLLECTIONS);

  const config = getConfig();
  let orders = memory.marketplaceOrders.filter((order) => order.accountType === "rider");
  if (scopeStation) orders = orders.filter((order) => order.station === scopeStation);
  if (scopeFranchise) orders = orders.filter((order) => order.franchise === scopeFranchise);
  if (riderId) orders = orders.filter((order) => order.riderId === riderId);

  // Rider context (membership + balance) when requested by the rider app.
  let me: Record<string, unknown> | null = null;
  let expiredNow = 0;
  const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
  if (rider) {
    expiredNow = applyPointsExpiry(rider.id);
    const orderCount = lifetimeOrders(rider.ninetyNineId);
    const tier = resolveTier(orderCount);
    me = {
      badges: badgeMilestones.map((m) => ({ ...m, achieved: (orderCount ?? 0) >= m.at })),
      expiredNow,
      riderId: rider.id,
      name: rider.name,
      station: rider.ponto ?? "Unassigned",
      franchise: rider.franchise ?? "Unassigned",
      balance: getAvailablePoints(memory.pointsLedgerEntries, rider.id),
      lifetimeOrders: orderCount,
      tier: tier.tier,
      tierLabel: tier.label,
      redeemDiscount: tier.redeemDiscount,
      perks: tier.perks,
    };
  }

  // Supplier settlement: fulfilled orders × supply price = payable.
  const supplierMap = new Map<string, { qty: number; payable: number }>();
  for (const order of memory.marketplaceOrders.filter((o) => o.status === "fulfilled" || o.status === "arrived")) {
    const product = memory.marketplaceProducts.find((item) => item.id === order.productId);
    if (!product?.supplierName) continue;
    const entry = supplierMap.get(product.supplierName) ?? { qty: 0, payable: 0 };
    entry.qty += 1;
    entry.payable += product.supplyPrice ?? 0;
    supplierMap.set(product.supplierName, entry);
  }
  const supplierSettlement = [...supplierMap.entries()].map(([supplier, value]) => ({ supplier, qty: value.qty, payable: Math.round(value.payable * 100) / 100 }));

  // Points expiring within 30 days (earned 11-12 months ago) for the rider.
  let expiringPoints = 0;
  if (me) {
    const now = Date.now();
    const MONTH = 30 * 24 * 3600 * 1000;
    for (const entry of memory.pointsLedgerEntries) {
      if (entry.riderId !== (me as { riderId: string }).riderId || entry.type !== "earn" || entry.status !== "approved") continue;
      const age = now - new Date(entry.createdAt.replace(" ", "T")).getTime();
      if (age > 11 * MONTH && age < 12 * MONTH) expiringPoints += entry.points;
    }
  }

  // Persist lazily-created expiry entries before the instance can freeze.
  if (expiredNow > 0) await flushPendingToDatabase();

  // HQ-only economics: supplier payables and supply prices never leave the
  // building — the public storefront still gets products/orders/me.
  const { sessionFromRequest } = await import("../../lib/auth-session");
  const session = await sessionFromRequest(request);
  const isHq = session?.portal === "pontosys" || session?.portal === "pontomall";
  // Suppliers still see THEIR OWN quoted prices.
  const supplierName = session?.portal === "supplier" ? session.organization || "" : "";
  const products = memory.marketplaceProducts.map((product) => {
    if (isHq || (supplierName && product.supplierName === supplierName)) return product;
    const { supplyPrice: _sp, marginPct: _mp, ...rest } = product;
    return rest;
  });

  return jsonResponse({
    data: {
      config: { ...config, pixKey: undefined },
      pixKey: config.pixKey ?? "",
      categories: [...memory.mallCategories].filter((c) => c.active).sort((a, b) => a.sort - b.sort),
      banners: [...memory.mallBanners].filter((b) => b.active).sort((a, b) => a.sort - b.sort),
      tiers: tierDefinitions,
      products,
      orders,
      me: me ? { ...me, expiringPoints } : null,
      supplierSettlement: isHq ? supplierSettlement : [],
    },
  });
}

type Body =
  | { action: "setConfig"; perOrderPoints?: number; referralPoints?: number; partnerServicePoints?: number; partnerServiceCount?: number }
  | { action: "supplierAddProduct"; name: string; supplierName: string; supplyPrice: number; deliveryCycleDays: number; stock: number; description?: string; imageUrl?: string; category?: string; isVirtual?: boolean }
  | { action: "updateProduct"; productId: string; name?: string; description?: string; imageUrl?: string; category?: string; stock?: number; deliveryCycleDays?: number; purchaseLimit?: number }
  | { action: "priceProduct"; productId: string; pointsPrice: number; marginPct?: number; status?: "active" | "paused" }
  | { action: "deleteProduct"; productId: string }
  | { action: "redeem"; productId: string; riderId?: string; riderName?: string }
  | { action: "markArrived"; orderId: string }
  | { action: "markPickedUp"; orderId: string }
  | { action: "awardReferral"; inviterRiderId: string; newRiderName: string }
  | { action: "awardPartnerService"; riderId: string; note?: string }
  | { action: "scanPartner"; riderId: string; partnerId: string };

async function handlePost(request: Request) {
  const peek = (await request.clone().json().catch(() => ({}))) as { action?: string };
  // Permission map: redeem = rider app; arrivals = station ops; supplier
  // upload = supplier catalog; config/pricing/awards = HQ points authority
  // (note: the plain Rider role intentionally has manage_marketplace for the
  // legacy mall, so admin actions must NOT rely on that permission).
  const forbidden =
    peek.action === "redeem" || peek.action === "scanPartner"
      ? requirePermission(request, "use_rider_app")
      : peek.action === "markArrived" || peek.action === "markPickedUp"
        ? requirePermission(request, "manage_slots")
        : peek.action === "supplierAddProduct" || peek.action === "updateProduct"
          ? requirePermission(request, "manage_supplier_catalog")
          : requirePermission(request, "manage_points");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  const actor = roleFromRequest(request);

  switch (body.action) {
    case "setConfig": {
      const config = { ...getConfig() };
      const fields = ["perOrderPoints", "referralPoints", "partnerServicePoints", "partnerServiceCount"] as const;
      for (const field of fields) {
        const value = Number(body[field]);
        if (Number.isFinite(value) && value >= 0) config[field] = value;
      }
      if (typeof body.pixKey === "string") config.pixKey = String(body.pixKey).slice(0, 120);
      config.updatedAt = nowStamp();
      config.updatedBy = actor;
      const index = memory.mallConfigs.findIndex((item) => item.id === "mall-config");
      if (index === -1) memory.mallConfigs.unshift(config);
      else memory.mallConfigs[index] = config;
      appendServerAudit({ actor, action: "MALL_CONFIG_UPDATED", entity: "MallConfig", entityId: "mall-config", detail: JSON.stringify(config), risk: "Medium" });
      return jsonResponse({ data: config });
    }

    case "supplierAddProduct": {
      const { name, supplierName, description = "", isVirtual = false, imageUrl = "", category = "" } = body as { name?: string; supplierName?: string; description?: string; isVirtual?: boolean; imageUrl?: string; category?: string };
      const supplyPrice = Number(body.supplyPrice);
      const deliveryCycleDays = Math.max(1, Math.floor(Number(body.deliveryCycleDays) || 7));
      const stock = Math.max(0, Math.floor(Number(body.stock) || 0));
      if (!name || !supplierName || !Number.isFinite(supplyPrice) || supplyPrice <= 0) {
        return jsonResponse({ error: "name, supplierName and supplyPrice are required" }, { status: 400 });
      }
      const product: MarketplaceProduct = {
        id: makeServerId("mkp", memory.marketplaceProducts.length + 1),
        name: String(name).slice(0, 80),
        type: "equipment",
        pointsPrice: 0,
        stock,
        city: "São Paulo",
        status: "pending_pricing",
        audience: "rider",
        supplierName: String(supplierName).slice(0, 80),
        supplyPrice,
        deliveryCycleDays,
        description: String(description).slice(0, 200),
        isVirtual: isVirtual === true,
        imageUrl: String(imageUrl).slice(0, 300),
        category: String(category).slice(0, 40),
      };
      memory.marketplaceProducts.unshift(product);
      appendServerAudit({ actor, action: "MALL_PRODUCT_SUBMITTED", entity: "MarketplaceProduct", entityId: product.id, detail: `${product.name} by ${supplierName} @ R$${supplyPrice} (cycle ${deliveryCycleDays}d).`, risk: "Low" });
      return jsonResponse({ data: product }, { status: 201 });
    }

    case "priceProduct": {
      const { productId } = body as { productId?: string };
      const index = memory.marketplaceProducts.findIndex((item) => item.id === productId);
      if (index === -1) return jsonResponse({ error: "product not found" }, { status: 404 });
      const pointsPrice = Math.max(0, Math.floor(Number(body.pointsPrice) || 0));
      const marginPct = Number(body.marginPct);
      const status = body.status === "paused" ? "paused" : "active";
      const cashPriceBRL = Number(body.cashPriceBRL);
      memory.marketplaceProducts[index] = {
        ...memory.marketplaceProducts[index],
        pointsPrice,
        marginPct: Number.isFinite(marginPct) ? marginPct : memory.marketplaceProducts[index].marginPct,
        cashPriceBRL: Number.isFinite(cashPriceBRL) && cashPriceBRL > 0 ? Math.round(cashPriceBRL * 100) / 100 : undefined,
        status: pointsPrice > 0 || (Number.isFinite(cashPriceBRL) && cashPriceBRL > 0) ? status : "pending_pricing",
      };
      appendServerAudit({ actor, action: "MALL_PRODUCT_PRICED", entity: "MarketplaceProduct", entityId: productId ?? "", detail: `pointsPrice=${pointsPrice} margin=${marginPct}% status=${status}.`, risk: "Low" });
      return jsonResponse({ data: memory.marketplaceProducts[index] });
    }

    case "updateProduct": {
      const { productId } = body as { productId?: string };
      const index = memory.marketplaceProducts.findIndex((item) => item.id === productId);
      if (index === -1) return jsonResponse({ error: "product not found" }, { status: 404 });
      const fields = body as Record<string, unknown>;
      const current = memory.marketplaceProducts[index];
      memory.marketplaceProducts[index] = {
        ...current,
        ...(fields.name !== undefined ? { name: String(fields.name).slice(0, 80) } : {}),
        ...(fields.description !== undefined ? { description: String(fields.description).slice(0, 200) } : {}),
        ...(fields.imageUrl !== undefined ? { imageUrl: String(fields.imageUrl).slice(0, 300) } : {}),
        ...(fields.category !== undefined ? { category: String(fields.category).slice(0, 40) } : {}),
        ...(fields.stock !== undefined ? { stock: Math.max(0, Number(fields.stock) || 0) } : {}),
        ...(fields.deliveryCycleDays !== undefined ? { deliveryCycleDays: Math.max(0, Number(fields.deliveryCycleDays) || 0) } : {}),
        ...(fields.purchaseLimit !== undefined ? { purchaseLimit: Math.max(0, Math.floor(Number(fields.purchaseLimit) || 0)) } : {}),
      };
      appendServerAudit({ actor, action: "MALL_PRODUCT_UPDATED", entity: "MarketplaceProduct", entityId: productId ?? "", detail: JSON.stringify(fields).slice(0, 180), risk: "Low" });
      return jsonResponse({ data: memory.marketplaceProducts[index] });
    }

    case "deleteProduct": {
      const { productId } = body as { productId?: string };
      const index = memory.marketplaceProducts.findIndex((item) => item.id === productId);
      if (index === -1) return jsonResponse({ error: "product not found" }, { status: 404 });
      memory.marketplaceProducts.splice(index, 1);
      persistDeleteRecord("marketplaceProducts", productId ?? "");
      return jsonResponse({ data: { ok: true } });
    }

    case "redeem": {
      const { productId, riderId, riderName } = body as { productId?: string; riderId?: string; riderName?: string };
      const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
      if (!rider) return jsonResponse({ error: "骑手档案未找到，请先注册建档" }, { status: 404 });
      const product = memory.marketplaceProducts.find((item) => item.id === productId && item.status === "active");
      if (!product) return jsonResponse({ error: "商品不存在或未上架" }, { status: 404 });
      if (product.stock <= 0) return jsonResponse({ error: "商品库存不足" }, { status: 409 });

      // Per-rider monthly purchase limit (anti-hoarding for scarce items).
      const purchaseLimit = product.purchaseLimit ?? 0;
      if (purchaseLimit > 0) {
        const month = nowStamp().slice(0, 7);
        const monthCount = memory.marketplaceOrders.filter(
          (order) => order.riderId === rider.id && order.productId === product.id && order.status !== "cancelled" && order.createdAt.startsWith(month),
        ).length;
        if (monthCount >= purchaseLimit) {
          return jsonResponse({ error: `Limite de resgate atingido: ${purchaseLimit}/mês por entregador.` }, { status: 429 });
        }
      }

      // Expire stale points first so the redemption uses the true balance.
      applyPointsExpiry(rider.id);

      const tier = resolveTier(lifetimeOrders(rider.ninetyNineId));
      const price = Math.ceil(product.pointsPrice * tier.redeemDiscount);
      const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
      if (available < price) {
        return jsonResponse({ error: `积分不足：需要 ${price} 分，当前 ${available} 分`, available, required: price }, { status: 409 });
      }

      const createdAt = nowStamp();
      const eta = new Date();
      eta.setDate(eta.getDate() + (product.deliveryCycleDays ?? 7));
      // Virtual goods: no logistics — issue an instant voucher code instead.
      const isVirtual = product.isVirtual === true;
      const voucherCode = isVirtual
        ? `MP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        : undefined;
      const cashDue = Math.round((product.cashPriceBRL ?? 0) * 100) / 100;
      const order: MarketplaceOrder = {
        id: makeServerId("mko", memory.marketplaceOrders.length + 1),
        accountType: "rider",
        riderId: rider.id,
        productId: product.id,
        pointsSpent: price,
        status: isVirtual ? "fulfilled" : "created",
        createdAt,
        productName: product.name,
        riderName: rider.name,
        station: rider.ponto ?? "Unassigned",
        franchise: rider.franchise ?? "Unassigned",
        etaDate: isVirtual ? createdAt.slice(0, 10) : eta.toISOString().slice(0, 10),
        ...(isVirtual ? { pickedUpAt: createdAt, voucherCode } : {}),
        ...(cashDue > 0 ? { cashDue, paymentStatus: "pending" as const } : {}),
      };
      memory.marketplaceOrders.unshift(order);

      // Hybrid checkout: open a manual PIX reconciliation record. Pickup is
      // blocked until the mall office confirms the transfer.
      let payment = null;
      if (cashDue > 0) {
        payment = {
          id: makeServerId("mpay", memory.mallPayments.length + 1),
          orderId: order.id,
          riderId: rider.id,
          riderName: rider.name,
          productName: product.name,
          amountBRL: cashDue,
          pixKey: getConfig().pixKey ?? "",
          status: "pending" as const,
          createdAt,
        };
        memory.mallPayments.unshift(payment);
      }

      const entry: PointsLedgerEntry = {
        id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
        riderId: rider.id,
        accountId: `pts-${rider.id}`,
        type: "spend",
        points: price,
        status: "approved",
        sourceType: "marketplace_order",
        sourceId: order.id,
        marketplaceOrderId: order.id,
        balanceAfter: available - price,
        reasonCode: "MALL_REDEMPTION",
        note: `${product.name}（${tier.label}${tier.redeemDiscount < 1 ? ` ${Math.round(tier.redeemDiscount * 100)}折` : ""}）`,
        createdBy: "PontoMall",
        createdAt,
      };
      memory.pointsLedgerEntries.unshift(entry);

      const productIndex = memory.marketplaceProducts.findIndex((item) => item.id === product.id);
      if (productIndex !== -1) {
        memory.marketplaceProducts[productIndex] = { ...product, stock: product.stock - 1 };
      }

      appendServerAudit({ actor, action: "MALL_REDEEMED", entity: "MarketplaceOrder", entityId: order.id, detail: `${rider.name} redeemed ${product.name} for ${price} pts, pickup at ${order.station}, ETA ${order.etaDate}.`, risk: "Low" });
      return jsonResponse({ data: { order, payment, balance: available - price } }, { status: 201 });
    }

    case "markArrived":
    case "markPickedUp": {
      const { orderId } = body as { orderId?: string };
      const index = memory.marketplaceOrders.findIndex((item) => item.id === orderId);
      if (index === -1) return jsonResponse({ error: "order not found" }, { status: 404 });
      const order = memory.marketplaceOrders[index];
      const stamp = nowStamp();
      if (body.action === "markArrived") {
        memory.marketplaceOrders[index] = { ...order, status: "arrived", arrivedAt: stamp, notifiedAt: stamp };
      } else {
        if (order.paymentStatus && order.paymentStatus !== "paid") {
          return jsonResponse({ error: "现金部分尚未核销，不能交付（先在商城后台确认收款）。" }, { status: 409 });
        }
        memory.marketplaceOrders[index] = { ...order, status: "fulfilled", pickedUpAt: stamp };
      }
      appendServerAudit({ actor, action: body.action === "markArrived" ? "MALL_ORDER_ARRIVED" : "MALL_ORDER_PICKED_UP", entity: "MarketplaceOrder", entityId: orderId ?? "", detail: `${order.productName} for ${order.riderName} at ${order.station}.`, risk: "Low" });
      if (body.action === "markArrived" && order.riderName) {
        await sendPushToRider(order.riderName, "Seu resgate chegou! 🎁", `「${order.productName}」já está em ${order.station}. Retire quando puder.`, "/rider-app/mall");
      }
      return jsonResponse({ data: memory.marketplaceOrders[index] });
    }

    case "awardReferral": {
      const { inviterRiderId, newRiderName } = body as { inviterRiderId?: string; newRiderName?: string };
      const inviter = memory.riders.find((item) => item.id === inviterRiderId);
      if (!inviter) return jsonResponse({ error: "inviter not found" }, { status: 404 });
      const config = getConfig();
      const entry = creditPoints(inviter.id, config.referralPoints, "REFERRAL_REWARD", `邀请骑手 ${newRiderName ?? ""} 注册`, `ref-${Date.now()}`, actor);
      return jsonResponse({ data: { entry, balance: entry.balanceAfter } }, { status: 201 });
    }

    case "scanPartner": {
      // A rider scans a partner's QR code → the PARTNER earns points.
      // Anti-fraud: rider must have completed orders (Eastwind-verified),
      // one scan per rider/partner/day, and a daily cap per partner.
      const { riderId: scannerId, partnerId } = body as { riderId?: string; partnerId?: string };
      const rider = memory.riders.find((item) => item.id === scannerId);
      if (!rider) return jsonResponse({ error: "Cadastro do entregador não encontrado." }, { status: 404 });
      const partner = memory.crmPartners.find((item) => item.id === partnerId);
      if (!partner) return jsonResponse({ error: "Parceiro não encontrado." }, { status: 404 });

      const orders = lifetimeOrders(rider.ninetyNineId);
      if (!orders || orders <= 0) {
        return jsonResponse({ error: "Apenas entregadores com pedidos concluídos podem validar parceiros (antifraude)." }, { status: 403 });
      }

      const date = new Date().toISOString().slice(0, 10);
      const scanId = `ppts-scan-${date}-${partner.id}-${rider.id}`;
      if (memory.partnerPointsLedgerEntries.some((entry) => entry.id === scanId)) {
        return jsonResponse({ error: "Você já validou este parceiro hoje." }, { status: 409 });
      }
      const todayScans = memory.partnerPointsLedgerEntries.filter(
        (entry) => entry.partnerId === partner.id && entry.id.startsWith(`ppts-scan-${date}-`),
      ).length;
      if (todayScans >= 10) {
        return jsonResponse({ error: "Limite diário de validações deste parceiro atingido." }, { status: 429 });
      }

      const config = getConfig();
      memory.partnerPointsLedgerEntries.unshift({
        id: scanId,
        partnerId: partner.id,
        accountId: `ppts-${partner.id}`,
        type: "earn",
        points: config.partnerServicePoints,
        status: "approved",
        sourceType: "partner_service_benefit",
        sourceId: scanId,
        balanceAfter: 0,
        reasonCode: "PARTNER_QR_SCAN",
        note: `Validado pelo entregador ${rider.name}`,
        createdBy: "QR Scan",
        createdAt: nowStamp(),
      });

      appendServerAudit({
        actor,
        action: "PARTNER_QR_SCANNED",
        entity: "PartnerPoints",
        entityId: partner.id,
        detail: `${rider.name} scanned ${partner.name}: +${config.partnerServicePoints} pts (scan ${todayScans + 1}/10 today).`,
        risk: "Low",
      });

      return jsonResponse({ data: { ok: true, partnerName: partner.name, points: config.partnerServicePoints } }, { status: 201 });
    }

    case "awardPartnerService": {
      const { riderId: targetId, note = "" } = body as { riderId?: string; note?: string };
      const rider = memory.riders.find((item) => item.id === targetId);
      if (!rider) return jsonResponse({ error: "rider not found" }, { status: 404 });
      const config = getConfig();
      const entry = creditPoints(rider.id, config.partnerServicePoints, "PARTNER_SERVICE_REWARD", note || `完成 ${config.partnerServiceCount} 次 Partner 服务`, `psr-${Date.now()}`, actor);
      return jsonResponse({ data: { entry, balance: entry.balanceAfter } }, { status: 201 });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

// Ensure mutations are durably written before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
