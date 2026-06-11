import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { getAvailablePoints, type MarketplaceOrder, type MarketplaceProduct, type PointsLedgerEntry } from "../../lib/points";
import { defaultMallConfig, resolveTier, tierDefinitions, type MallConfig } from "../../lib/mall";

const COLLECTIONS = ["mallConfigs", "marketplaceProducts", "marketplaceOrders", "pointsLedgerEntries", "riders", "riderDailyKpis"];

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
  const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
  if (rider) {
    const orderCount = lifetimeOrders(rider.ninetyNineId);
    const tier = resolveTier(orderCount);
    me = {
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

  return jsonResponse({
    data: {
      config,
      tiers: tierDefinitions,
      products: memory.marketplaceProducts,
      orders,
      me,
    },
  });
}

type Body =
  | { action: "setConfig"; perOrderPoints?: number; referralPoints?: number; partnerServicePoints?: number; partnerServiceCount?: number }
  | { action: "supplierAddProduct"; name: string; supplierName: string; supplyPrice: number; deliveryCycleDays: number; stock: number; description?: string }
  | { action: "priceProduct"; productId: string; pointsPrice: number; marginPct?: number; status?: "active" | "paused" }
  | { action: "deleteProduct"; productId: string }
  | { action: "redeem"; productId: string; riderId?: string; riderName?: string }
  | { action: "markArrived"; orderId: string }
  | { action: "markPickedUp"; orderId: string }
  | { action: "awardReferral"; inviterRiderId: string; newRiderName: string }
  | { action: "awardPartnerService"; riderId: string; note?: string };

export async function POST(request: Request) {
  const peek = (await request.clone().json().catch(() => ({}))) as { action?: string };
  // Permission map: redeem = rider app; arrivals = station ops; supplier
  // upload = supplier catalog; config/pricing/awards = HQ points authority
  // (note: the plain Rider role intentionally has manage_marketplace for the
  // legacy mall, so admin actions must NOT rely on that permission).
  const forbidden =
    peek.action === "redeem"
      ? requirePermission(request, "use_rider_app") && requirePermission(request, "manage_points")
      : peek.action === "markArrived" || peek.action === "markPickedUp"
        ? requirePermission(request, "manage_slots") && requirePermission(request, "manage_points")
        : peek.action === "supplierAddProduct"
          ? requirePermission(request, "manage_supplier_catalog") && requirePermission(request, "manage_points")
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
      config.updatedAt = nowStamp();
      config.updatedBy = actor;
      const index = memory.mallConfigs.findIndex((item) => item.id === "mall-config");
      if (index === -1) memory.mallConfigs.unshift(config);
      else memory.mallConfigs[index] = config;
      appendServerAudit({ actor, action: "MALL_CONFIG_UPDATED", entity: "MallConfig", entityId: "mall-config", detail: JSON.stringify(config), risk: "Medium" });
      return jsonResponse({ data: config });
    }

    case "supplierAddProduct": {
      const { name, supplierName, description = "" } = body as { name?: string; supplierName?: string; description?: string };
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
      memory.marketplaceProducts[index] = {
        ...memory.marketplaceProducts[index],
        pointsPrice,
        marginPct: Number.isFinite(marginPct) ? marginPct : memory.marketplaceProducts[index].marginPct,
        status: pointsPrice > 0 ? status : "pending_pricing",
      };
      appendServerAudit({ actor, action: "MALL_PRODUCT_PRICED", entity: "MarketplaceProduct", entityId: productId ?? "", detail: `pointsPrice=${pointsPrice} margin=${marginPct}% status=${status}.`, risk: "Low" });
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

      const tier = resolveTier(lifetimeOrders(rider.ninetyNineId));
      const price = Math.ceil(product.pointsPrice * tier.redeemDiscount);
      const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
      if (available < price) {
        return jsonResponse({ error: `积分不足：需要 ${price} 分，当前 ${available} 分`, available, required: price }, { status: 409 });
      }

      const createdAt = nowStamp();
      const eta = new Date();
      eta.setDate(eta.getDate() + (product.deliveryCycleDays ?? 7));
      const order: MarketplaceOrder = {
        id: makeServerId("mko", memory.marketplaceOrders.length + 1),
        accountType: "rider",
        riderId: rider.id,
        productId: product.id,
        pointsSpent: price,
        status: "created",
        createdAt,
        productName: product.name,
        riderName: rider.name,
        station: rider.ponto ?? "Unassigned",
        franchise: rider.franchise ?? "Unassigned",
        etaDate: eta.toISOString().slice(0, 10),
      };
      memory.marketplaceOrders.unshift(order);

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
      return jsonResponse({ data: { order, balance: available - price } }, { status: 201 });
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
        memory.marketplaceOrders[index] = { ...order, status: "fulfilled", pickedUpAt: stamp };
      }
      appendServerAudit({ actor, action: body.action === "markArrived" ? "MALL_ORDER_ARRIVED" : "MALL_ORDER_PICKED_UP", entity: "MarketplaceOrder", entityId: orderId ?? "", detail: `${order.productName} for ${order.riderName} at ${order.station}.`, risk: "Low" });
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
