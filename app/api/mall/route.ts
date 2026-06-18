import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { appendEvent, MARKETPLACE_EVENTS, recentEvents } from "../../lib/server/events";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { sendPushToRider } from "../../lib/server/notify";
import { getAvailablePoints, getAvailablePartnerPoints, pointsRules, type MarketplaceOrder, type MarketplaceProduct, type PartnerPointsLedgerEntry, type PointsLedgerEntry } from "../../lib/points";
import { defaultMallConfig, resolveTier, tierDefinitions, type MallConfig } from "../../lib/mall";
import type { CashLedgerEntry, MallCoupon } from "../../lib/mall-ops";

/** Tier rank for coupon eligibility (member=0 … diamante=4). */
function tierRank(name: string): number {
  return tierDefinitions.findIndex((t) => t.tier === name);
}

/** Coupons a rider is eligible for (tier + validity + per-rider limit), ignoring
 *  the per-product minPoints threshold (applied per product at display/redeem). */
function eligibleCouponsForRider(riderId: string, tierName: string): MallCoupon[] {
  const today = new Date().toISOString().slice(0, 10);
  const riderRank = tierRank(tierName);
  return memory.mallCoupons.filter((c) => {
    if (!c.active) return false;
    if (c.expiresAt && c.expiresAt < today) return false;
    if (riderRank < tierRank(c.minTier)) return false;
    if (c.perRiderLimit > 0) {
      const used = memory.marketplaceOrders.filter((o) => o.couponId === c.id && o.riderId === riderId && o.status !== "cancelled").length;
      if (used >= c.perRiderLimit) return false;
    }
    return true;
  });
}

/** Best coupon (max discount) for a rider against a given tier-discounted price. */
function bestCouponForRider(riderId: string, tierName: string, price: number): { coupon: MallCoupon; discount: number } | null {
  let best: { coupon: MallCoupon; discount: number } | null = null;
  for (const c of eligibleCouponsForRider(riderId, tierName)) {
    if (price < c.minPoints) continue;
    const discount = c.type === "percent_off" ? Math.floor((price * c.value) / 100) : Math.min(c.value, price);
    if (discount > 0 && (!best || discount > best.discount)) best = { coupon: c, discount };
  }
  return best;
}

/** Cash balance = immutable ledger sum (top-ups minus spends). */
function cashBalanceOf(riderId: string): number {
  let balance = 0;
  for (const entry of memory.cashLedgerEntries) {
    if (entry.riderId !== riderId) continue;
    balance += entry.type === "spend" ? -entry.amountBRL : entry.amountBRL;
  }
  return Math.round(balance * 100) / 100;
}

const COLLECTIONS = ["mallConfigs", "marketplaceProducts", "marketplaceOrders", "pointsLedgerEntries", "partnerPointsLedgerEntries", "riders", "riderDailyKpis", "mallCategories", "mallBanners", "mallCoupons", "mallPayments", "cashTopUps", "cashLedgerEntries"];

const PRODUCT_TYPES = ["equipment", "fuel_coupon", "maintenance_coupon", "phone_data", "safety_item", "partner_voucher"] as const;

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
  // HQ/unscoped views include Partner redemptions for reconciliation; the
  // scope (station/franchise) and riderId filters below naturally exclude
  // Partner orders for rider storefronts and franchise/station portals, since
  // Partner orders carry no station/franchise/riderId. (Partner storefront
  // gets its own scoped list further down.)
  let orders = memory.marketplaceOrders.filter((order) => order.accountType === "rider" || order.accountType === "partner");
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
      cashBalance: cashBalanceOf(rider.id),
      topUps: memory.cashTopUps.filter((t) => t.riderId === rider.id).slice(0, 10),
      coupons: eligibleCouponsForRider(rider.id, tier.tier),
      // Read-only points ledger slice (newest 30) for the storefront extract
      // drawer. The ledger stays append-only in memory.pointsLedgerEntries.
      ledger: memory.pointsLedgerEntries
        .filter((entry) => entry.riderId === rider.id)
        .slice(0, 30)
        .map((entry) => ({
          id: entry.id,
          type: entry.type,
          points: entry.points,
          status: entry.status,
          sourceType: entry.sourceType,
          reasonCode: entry.reasonCode,
          note: entry.note,
          createdAt: entry.createdAt,
          balanceAfter: entry.balanceAfter,
        })),
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

  // Partner storefront context: a logged-in Partner (portal "partner") redeems
  // with its Partner points. Identity maps read-only via organization → the
  // crmPartner with the same name (no auth/session changes required).
  if (!me && session?.portal === "partner") {
    const partner = memory.crmPartners.find((p) => p.name === session.organization);
    if (partner) {
      me = {
        accountType: "partner",
        partnerId: partner.id,
        riderId: "",
        name: partner.name,
        balance: getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partner.id),
        // Same read-only ledger slice shape as the rider, from the Partner
        // append-only ledger, so the storefront drawer is account-agnostic.
        ledger: memory.partnerPointsLedgerEntries
          .filter((entry) => entry.partnerId === partner.id)
          .slice(0, 30)
          .map((entry) => ({
            id: entry.id,
            type: entry.type,
            points: entry.points,
            status: entry.status,
            sourceType: entry.sourceType,
            reasonCode: entry.reasonCode,
            note: entry.note,
            createdAt: entry.createdAt,
            balanceAfter: entry.balanceAfter,
          })),
      };
      // Partner sees only its own redemption orders.
      orders = memory.marketplaceOrders.filter((order) => order.accountType === "partner" && order.partnerId === partner.id);
    }
  }

  const products = memory.marketplaceProducts.map((product) => {
    if (isHq || (supplierName && product.supplierName === supplierName)) return product;
    const { supplyPrice: _sp, marginPct: _mp, ...rest } = product;
    return rest;
  });

  // HQ-only points liability & redemption reconciliation. Points are a
  // marketing-cost liability (the standard treats `1 BRL = 10 pts` as a
  // reference, not a cash promise), so this is a derived read model over the
  // append-only ledgers — no new writes. Closes "earn liability ↔ expiry
  // recovery ↔ cash redemption" for Finance.
  const pointsLiability = isHq ? buildPointsLiability(supplierSettlement) : null;

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
      pointsLiability,
      events: isHq ? recentEvents(50) : [],
    },
  });
}

const LIABILITY_POSITIVE = new Set(["earn", "refund", "release", "adjust"]);

/** Derived points-liability aggregate over both append-only ledgers (HQ only). */
function buildPointsLiability(supplierSettlement: Array<{ supplier: string; qty: number; payable: number }>) {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const rate = pointsRules.pointsPerBrlReference || 10;

  const aggregate = (entries: Array<{ type: string; status: string; points: number; createdAt: string }>) => {
    let outstanding = 0;
    let earnedThisMonth = 0;
    let spentThisMonth = 0;
    let expiredThisMonth = 0;
    let pending = 0;
    for (const entry of entries) {
      if (entry.status === "approved") {
        outstanding += LIABILITY_POSITIVE.has(entry.type) ? entry.points : -entry.points;
        if (entry.createdAt.startsWith(monthPrefix)) {
          if (entry.type === "earn") earnedThisMonth += entry.points;
          else if (entry.type === "spend") spentThisMonth += entry.points;
          else if (entry.type === "expire") expiredThisMonth += entry.points;
        }
      } else if (entry.status === "pending" && entry.type === "earn") {
        pending += entry.points;
      }
    }
    return { outstanding, earnedThisMonth, spentThisMonth, expiredThisMonth, pending };
  };

  const rider = aggregate(memory.pointsLedgerEntries);
  const partner = aggregate(memory.partnerPointsLedgerEntries);
  const totalOutstanding = rider.outstanding + partner.outstanding;
  const supplierPayableBRL = Math.round(supplierSettlement.reduce((sum, row) => sum + row.payable, 0) * 100) / 100;

  return {
    rate,
    riderOutstanding: rider.outstanding,
    partnerOutstanding: partner.outstanding,
    totalOutstanding,
    liabilityBRL: Math.round((totalOutstanding / rate) * 100) / 100,
    earnedThisMonth: rider.earnedThisMonth + partner.earnedThisMonth,
    spentThisMonth: rider.spentThisMonth + partner.spentThisMonth,
    expiredThisMonth: rider.expiredThisMonth + partner.expiredThisMonth,
    pendingPoints: rider.pending + partner.pending,
    supplierPayableBRL,
  };
}

type Body =
  | { action: "setConfig"; perOrderPoints?: number; referralPoints?: number; partnerServicePoints?: number; partnerServiceCount?: number }
  | { action: "supplierAddProduct"; name: string; supplierName: string; supplyPrice: number; deliveryCycleDays: number; stock: number; description?: string; imageUrl?: string; category?: string; isVirtual?: boolean; audience?: "rider" | "partner" | "both"; type?: string }
  | { action: "supplierUpdateProduct"; productId: string; name?: string; supplyPrice?: number; description?: string; imageUrl?: string; category?: string; stock?: number; deliveryCycleDays?: number; isVirtual?: boolean; audience?: "rider" | "partner" | "both"; type?: string }
  | { action: "supplierDeleteProduct"; productId: string }
  | { action: "updateProduct"; productId: string; name?: string; description?: string; imageUrl?: string; category?: string; stock?: number; deliveryCycleDays?: number; purchaseLimit?: number }
  | { action: "priceProduct"; productId: string; pointsPrice: number; marginPct?: number; status?: "active" | "paused" }
  | { action: "deleteProduct"; productId: string }
  | { action: "redeem"; productId: string; riderId?: string; riderName?: string; accountType?: "rider" | "partner" }
  | { action: "cancelOrder"; orderId: string; riderId?: string }
  | { action: "confirmReceipt"; orderId: string }
  | { action: "markArrived"; orderId: string }
  | { action: "markPickedUp"; orderId: string }
  | { action: "reviewOrder"; orderId: string; decision: "approve" | "reject" }
  | { action: "awardReferral"; inviterRiderId: string; newRiderName: string }
  | { action: "awardPartnerService"; riderId: string; note?: string }
  | { action: "scanPartner"; riderId: string; partnerId: string };

async function handlePost(request: Request) {
  const peek = (await request.clone().json().catch(() => ({}))) as { action?: string; accountType?: string };
  // Permission map: redeem = rider app (or partner services for a Partner
  // account); arrivals = station ops; supplier upload = supplier catalog;
  // config/pricing/awards = HQ points authority (note: the plain Rider role
  // intentionally has manage_marketplace for the legacy mall, so admin actions
  // must NOT rely on that permission).
  const forbidden =
    peek.action === "redeem"
      ? requirePermission(request, peek.accountType === "partner" ? "manage_partner_services" : "use_rider_app")
      : peek.action === "confirmReceipt"
      ? requirePermission(request, "manage_partner_services")
      : peek.action === "scanPartner" || peek.action === "cancelOrder"
        ? requirePermission(request, "use_rider_app")
        : peek.action === "markArrived" || peek.action === "markPickedUp"
        ? requirePermission(request, "manage_slots")
        : peek.action === "supplierAddProduct" || peek.action === "updateProduct" || peek.action === "supplierUpdateProduct" || peek.action === "supplierDeleteProduct"
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
      const type = (PRODUCT_TYPES as readonly string[]).includes(String(body.type)) ? (String(body.type) as MarketplaceProduct["type"]) : "equipment";
      const audience = (["rider", "partner", "both"] as const as readonly string[]).includes(String(body.audience)) ? (String(body.audience) as MarketplaceProduct["audience"]) : "rider";
      if (!name || !supplierName || !Number.isFinite(supplyPrice) || supplyPrice <= 0) {
        return jsonResponse({ error: "name, supplierName and supplyPrice are required" }, { status: 400 });
      }
      const product: MarketplaceProduct = {
        id: makeServerId("mkp", memory.marketplaceProducts.length + 1),
        name: String(name).slice(0, 80),
        type,
        pointsPrice: 0,
        stock,
        city: "São Paulo",
        status: "pending_pricing",
        audience,
        supplierName: String(supplierName).slice(0, 80),
        supplyPrice,
        deliveryCycleDays,
        description: String(description).slice(0, 200),
        isVirtual: isVirtual === true,
        imageUrl: String(imageUrl).slice(0, 400000),
        category: String(category).slice(0, 40),
      };
      memory.marketplaceProducts.unshift(product);
      appendServerAudit({ actor, action: "MALL_PRODUCT_SUBMITTED", entity: "MarketplaceProduct", entityId: product.id, detail: `${product.name} by ${supplierName} @ R$${supplyPrice} (cycle ${deliveryCycleDays}d, ${audience}/${type}).`, risk: "Low" });
      return jsonResponse({ data: product }, { status: 201 });
    }

    case "supplierUpdateProduct": {
      // A supplier edits its OWN still-unpriced product (identity from session).
      const { sessionFromRequest } = await import("../../lib/auth-session");
      const session = await sessionFromRequest(request);
      const supplier = session?.portal === "supplier" ? session.organization || "" : "";
      if (!supplier) return jsonResponse({ error: "Apenas fornecedores podem editar produtos." }, { status: 403 });
      const { productId } = body as { productId?: string };
      const index = memory.marketplaceProducts.findIndex((item) => item.id === productId);
      if (index === -1) return jsonResponse({ error: "Produto não encontrado." }, { status: 404 });
      const current = memory.marketplaceProducts[index];
      if (current.supplierName !== supplier) return jsonResponse({ error: "Este produto não é seu." }, { status: 403 });
      if (current.status !== "pending_pricing") return jsonResponse({ error: "Produto já precificado — solicite alteração de preço ao mall." }, { status: 409 });
      const fields = body as Record<string, unknown>;
      const sp = Number(fields.supplyPrice);
      memory.marketplaceProducts[index] = {
        ...current,
        ...(fields.name !== undefined ? { name: String(fields.name).slice(0, 80) } : {}),
        ...(fields.description !== undefined ? { description: String(fields.description).slice(0, 200) } : {}),
        ...(fields.imageUrl !== undefined ? { imageUrl: String(fields.imageUrl).slice(0, 400000) } : {}),
        ...(fields.category !== undefined ? { category: String(fields.category).slice(0, 40) } : {}),
        ...(fields.stock !== undefined ? { stock: Math.max(0, Math.floor(Number(fields.stock) || 0)) } : {}),
        ...(fields.deliveryCycleDays !== undefined ? { deliveryCycleDays: Math.max(1, Math.floor(Number(fields.deliveryCycleDays) || 7)) } : {}),
        ...(Number.isFinite(sp) && sp > 0 ? { supplyPrice: sp } : {}),
        ...(fields.isVirtual !== undefined ? { isVirtual: fields.isVirtual === true } : {}),
        ...((PRODUCT_TYPES as readonly string[]).includes(String(fields.type)) ? { type: String(fields.type) as MarketplaceProduct["type"] } : {}),
        ...((["rider", "partner", "both"] as readonly string[]).includes(String(fields.audience)) ? { audience: String(fields.audience) as MarketplaceProduct["audience"] } : {}),
      };
      appendServerAudit({ actor, action: "MALL_PRODUCT_SUPPLIER_UPDATED", entity: "MarketplaceProduct", entityId: productId ?? "", detail: `${supplier} editou ${current.name}.`, risk: "Low" });
      return jsonResponse({ data: memory.marketplaceProducts[index] });
    }

    case "supplierDeleteProduct": {
      const { sessionFromRequest } = await import("../../lib/auth-session");
      const session = await sessionFromRequest(request);
      const supplier = session?.portal === "supplier" ? session.organization || "" : "";
      if (!supplier) return jsonResponse({ error: "Apenas fornecedores podem excluir produtos." }, { status: 403 });
      const { productId } = body as { productId?: string };
      const index = memory.marketplaceProducts.findIndex((item) => item.id === productId);
      if (index === -1) return jsonResponse({ error: "Produto não encontrado." }, { status: 404 });
      const current = memory.marketplaceProducts[index];
      if (current.supplierName !== supplier) return jsonResponse({ error: "Este produto não é seu." }, { status: 403 });
      if (current.status !== "pending_pricing") return jsonResponse({ error: "Produto já precificado — não pode ser excluído pelo fornecedor." }, { status: 409 });
      memory.marketplaceProducts.splice(index, 1);
      persistDeleteRecord("marketplaceProducts", productId ?? "");
      appendServerAudit({ actor, action: "MALL_PRODUCT_SUPPLIER_DELETED", entity: "MarketplaceProduct", entityId: productId ?? "", detail: `${supplier} excluiu ${current.name}.`, risk: "Low" });
      return jsonResponse({ data: { ok: true } });
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
        ...(fields.imageUrl !== undefined ? { imageUrl: String(fields.imageUrl).slice(0, 400000) } : {}),
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
      const accountType = (body as { accountType?: string }).accountType === "partner" ? "partner" : "rider";

      // ---- Partner redemption -------------------------------------------------
      // A logged-in Partner (portal "partner") redeems with its Partner points.
      // Identity maps read-only via organization → crmPartner name. Points-only,
      // no tier discount. Virtual goods → instant voucher; physical goods are
      // shipped to the partner's own shop and the partner self-confirms receipt.
      if (accountType === "partner") {
        const { sessionFromRequest } = await import("../../lib/auth-session");
        const session = await sessionFromRequest(request);
        const partner = session?.portal === "partner" ? memory.crmPartners.find((p) => p.name === session.organization) : undefined;
        if (!partner) return jsonResponse({ error: "Conta de parceiro não encontrada." }, { status: 404 });
        const product = memory.marketplaceProducts.find((item) => item.id === productId && item.status === "active");
        if (!product) return jsonResponse({ error: "Produto indisponível ou fora de catálogo." }, { status: 404 });
        if (product.audience !== "partner" && product.audience !== "both") {
          return jsonResponse({ error: "Este produto não está disponível para parceiros." }, { status: 409 });
        }
        if (product.stock <= 0) return jsonResponse({ error: "Produto esgotado." }, { status: 409 });
        if ((product.cashPriceBRL ?? 0) > 0) {
          return jsonResponse({ error: "Resgates com parte em dinheiro ainda não estão disponíveis para parceiros." }, { status: 409 });
        }
        const price = product.pointsPrice;
        const available = getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partner.id);
        if (available < price) {
          return jsonResponse({ error: `Pontos insuficientes: precisa de ${price}, você tem ${available}.`, available, required: price }, { status: 409 });
        }
        const createdAt = nowStamp();
        const isVirtual = product.isVirtual === true;
        const eta = new Date();
        eta.setDate(eta.getDate() + (product.deliveryCycleDays ?? 7));
        const voucherCode = isVirtual ? `MP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : undefined;
        const order: MarketplaceOrder = {
          id: makeServerId("mko", memory.marketplaceOrders.length + 1),
          accountType: "partner",
          partnerId: partner.id,
          productId: product.id,
          pointsSpent: price,
          // Virtual: instant. Physical: shipped to the partner's shop, partner
          // self-confirms receipt (confirmReceipt) to complete.
          status: isVirtual ? "fulfilled" : "created",
          createdAt,
          productName: product.name,
          riderName: partner.name,
          // Reuse "station" to carry the partner's delivery location (its bairro).
          station: isVirtual ? undefined : partner.bairro ?? "Loja do parceiro",
          etaDate: isVirtual ? createdAt.slice(0, 10) : eta.toISOString().slice(0, 10),
          ...(isVirtual ? { pickedUpAt: createdAt, voucherCode } : {}),
        };
        memory.marketplaceOrders.unshift(order);
        const ledger: PartnerPointsLedgerEntry = {
          id: makeServerId("ppts", memory.partnerPointsLedgerEntries.length + 1),
          partnerId: partner.id,
          accountId: `ppts-${partner.id}`,
          type: "spend",
          points: price,
          status: "approved",
          sourceType: "marketplace_order",
          sourceId: order.id,
          marketplaceOrderId: order.id,
          balanceAfter: available - price,
          reasonCode: "MALL_REDEMPTION",
          note: product.name,
          createdBy: "PontoMall",
          createdAt,
        };
        memory.partnerPointsLedgerEntries.unshift(ledger);
        const partnerProductIndex = memory.marketplaceProducts.findIndex((item) => item.id === product.id);
        if (partnerProductIndex !== -1) memory.marketplaceProducts[partnerProductIndex] = { ...product, stock: product.stock - 1 };
        appendServerAudit({ actor, action: "MALL_REDEEMED", entity: "MarketplaceOrder", entityId: order.id, detail: `${partner.name} (parceiro) resgatou ${product.name} por ${price} pts.`, risk: price >= 8000 ? "High" : "Low" });
        appendEvent(MARKETPLACE_EVENTS.orderCreated, { orderId: order.id, accountType: "partner", partnerId: partner.id, productId: product.id, productName: product.name, pointsSpent: price }, actor);
        return jsonResponse({ data: { order, balance: available - price } }, { status: 201 });
      }

      const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
      if (!rider) return jsonResponse({ error: "骑手档案未找到，请先注册建档" }, { status: 404 });

      // Risk control: fraud-held riders cannot self-redeem (manual review required).
      if (rider.status === "Risk") {
        appendServerAudit({ actor, action: "MALL_REDEEM_BLOCKED_RISK", entity: "Rider", entityId: rider.id, detail: `${rider.name} (status Risk) bloqueado de resgatar.`, risk: "High" });
        return jsonResponse({ error: "Sua conta está em revisão de segurança. Fale com o suporte para resgatar." }, { status: 403 });
      }
      // Anti-abuse: per-rider daily redemption cap (guardrail against scripted abuse).
      const DAILY_REDEEM_CAP = 20;
      const todayKey = nowStamp().slice(0, 10);
      const todayRedeems = memory.marketplaceOrders.filter((o) => o.riderId === rider.id && o.status !== "cancelled" && o.createdAt.startsWith(todayKey)).length;
      if (todayRedeems >= DAILY_REDEEM_CAP) {
        return jsonResponse({ error: `Limite diário de resgates atingido (${DAILY_REDEEM_CAP}/dia). Tente novamente amanhã.` }, { status: 429 });
      }

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
      const basePrice = Math.ceil(product.pointsPrice * tier.redeemDiscount);
      // Auto-apply the best eligible storefront coupon (points discount).
      const couponPick = bestCouponForRider(rider.id, tier.tier, basePrice);
      const couponDiscount = couponPick?.discount ?? 0;
      const price = Math.max(0, basePrice - couponDiscount);
      const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
      if (available < price) {
        return jsonResponse({ error: `积分不足：需要 ${price} 分，当前 ${available} 分`, available, required: price }, { status: 409 });
      }

      // High-value redemptions are held for manual review before completing:
      // points are debited (held) immediately, but virtual vouchers are NOT
      // issued and fulfilment is blocked until an operator approves.
      const HIGH_VALUE_POINTS = 8000;
      const heldForReview = price >= HIGH_VALUE_POINTS;

      const createdAt = nowStamp();
      const eta = new Date();
      eta.setDate(eta.getDate() + (product.deliveryCycleDays ?? 7));
      // Virtual goods: no logistics — issue an instant voucher code instead
      // (unless held for review, in which case the code waits for approval).
      const isVirtual = product.isVirtual === true;
      const issueNow = isVirtual && !heldForReview;
      const voucherCode = issueNow
        ? `MP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        : undefined;
      const cashDue = Math.round((product.cashPriceBRL ?? 0) * 100) / 100;
      // Hybrid checkout: cash part is paid from the rider's prepaid balance
      // (topped up via PIX and confirmed by the mall office). No balance, no order.
      if (cashDue > 0) {
        const cashAvailable = cashBalanceOf(rider.id);
        if (cashAvailable < cashDue) {
          return jsonResponse(
            { error: `Saldo insuficiente: precisa de R$ ${cashDue.toFixed(2)}, você tem R$ ${cashAvailable.toFixed(2)}. Recarregue via PIX.`, cashDue, cashAvailable, needTopUp: true },
            { status: 409 },
          );
        }
      }
      const order: MarketplaceOrder = {
        id: makeServerId("mko", memory.marketplaceOrders.length + 1),
        accountType: "rider",
        riderId: rider.id,
        productId: product.id,
        pointsSpent: price,
        status: issueNow ? "fulfilled" : "created",
        createdAt,
        productName: product.name,
        riderName: rider.name,
        station: rider.ponto ?? "Unassigned",
        franchise: rider.franchise ?? "Unassigned",
        etaDate: isVirtual ? createdAt.slice(0, 10) : eta.toISOString().slice(0, 10),
        ...(issueNow ? { pickedUpAt: createdAt, voucherCode } : {}),
        ...(heldForReview ? { reviewStatus: "pending" as const } : {}),
        ...(couponDiscount > 0 && couponPick ? { couponId: couponPick.coupon.id, couponDiscount } : {}),
        ...(cashDue > 0 ? { cashDue, paymentStatus: "paid" as const } : {}),
      };
      memory.marketplaceOrders.unshift(order);

      // Deduct the cash part from the prepaid balance — immutable ledger record.
      if (cashDue > 0) {
        const cashAvailable = cashBalanceOf(rider.id);
        const ledgerEntry: CashLedgerEntry = {
          id: makeServerId("mcl", memory.cashLedgerEntries.length + 1),
          riderId: rider.id,
          riderName: rider.name,
          type: "spend",
          amountBRL: cashDue,
          sourceId: order.id,
          balanceAfter: Math.round((cashAvailable - cashDue) * 100) / 100,
          note: product.name,
          createdBy: "PontoMall",
          createdAt,
        };
        memory.cashLedgerEntries.unshift(ledgerEntry);
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
        note: `${product.name}（${tier.label}${tier.redeemDiscount < 1 ? ` ${Math.round(tier.redeemDiscount * 100)}折` : ""}${couponDiscount > 0 ? ` · cupom -${couponDiscount}` : ""}）`,
        createdBy: "PontoMall",
        createdAt,
      };
      memory.pointsLedgerEntries.unshift(entry);

      const productIndex = memory.marketplaceProducts.findIndex((item) => item.id === product.id);
      if (productIndex !== -1) {
        memory.marketplaceProducts[productIndex] = { ...product, stock: product.stock - 1 };
      }

      appendServerAudit({ actor, action: heldForReview ? "MALL_REDEEM_HELD_REVIEW" : "MALL_REDEEMED", entity: "MarketplaceOrder", entityId: order.id, detail: `${rider.name} redeemed ${product.name} for ${price} pts${heldForReview ? " — HELD for review" : `, pickup at ${order.station}, ETA ${order.etaDate}`}.`, risk: heldForReview ? "High" : "Low" });
      appendEvent(MARKETPLACE_EVENTS.orderCreated, { orderId: order.id, accountType: "rider", riderId: rider.id, productId: product.id, productName: product.name, pointsSpent: price, station: order.station, cashDue: order.cashDue ?? 0, reviewStatus: heldForReview ? "pending" : "none" }, actor);
      return jsonResponse({ data: { order, balance: available - price, cashBalance: cashBalanceOf(rider.id), held: heldForReview, couponDiscount } }, { status: 201 });
    }

    case "cancelOrder": {
      // Rider self-service cancellation of an in-transit redemption. Refunds
      // points (+ any cash paid from the prepaid balance) and restocks the item.
      const { orderId, riderId } = body as { orderId?: string; riderId?: string };
      const index = memory.marketplaceOrders.findIndex((item) => item.id === orderId);
      if (index === -1) return jsonResponse({ error: "Resgate não encontrado." }, { status: 404 });
      const order = memory.marketplaceOrders[index];
      // Ownership check (mirrors the redeem trust model: rider acts on own order).
      if (riderId && order.riderId && order.riderId !== riderId) {
        return jsonResponse({ error: "Você só pode cancelar seus próprios resgates." }, { status: 403 });
      }
      if (order.accountType !== "rider" || !order.riderId) {
        return jsonResponse({ error: "Este resgate não pode ser cancelado por aqui — contate o suporte." }, { status: 409 });
      }
      // Only in-transit physical orders are self-cancellable. Delivered vouchers,
      // arrived (already at the station) and already-cancelled orders are not.
      if (order.status !== "created") {
        const why = order.status === "fulfilled" ? "já foi entregue" : order.status === "arrived" ? "já chegou ao seu ponto — retire ou fale com o ponto" : "já foi cancelado";
        return jsonResponse({ error: `Não é possível cancelar: o resgate ${why}.` }, { status: 409 });
      }

      const stamp = nowStamp();
      // Refund points (auditable refund ledger entry).
      const pointsAvailable = getAvailablePoints(memory.pointsLedgerEntries, order.riderId);
      memory.pointsLedgerEntries.unshift({
        id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
        riderId: order.riderId,
        accountId: `pts-${order.riderId}`,
        type: "refund",
        points: order.pointsSpent,
        status: "approved",
        sourceType: "marketplace_order",
        sourceId: order.id,
        marketplaceOrderId: order.id,
        balanceAfter: pointsAvailable + order.pointsSpent,
        reasonCode: "MALL_REFUND",
        note: `Cancelamento de ${order.productName ?? "resgate"}`,
        createdBy: "PontoMall",
        createdAt: stamp,
      });

      // Refund the cash part to the prepaid balance, if any was charged.
      const cashRefund = Math.round((order.cashDue ?? 0) * 100) / 100;
      if (cashRefund > 0) {
        const cashAvailable = cashBalanceOf(order.riderId);
        const refundEntry: CashLedgerEntry = {
          id: makeServerId("mcl", memory.cashLedgerEntries.length + 1),
          riderId: order.riderId,
          riderName: order.riderName ?? "",
          type: "refund",
          amountBRL: cashRefund,
          sourceId: order.id,
          balanceAfter: Math.round((cashAvailable + cashRefund) * 100) / 100,
          note: `Estorno de ${order.productName ?? "resgate"}`,
          createdBy: "PontoMall",
          createdAt: stamp,
        };
        memory.cashLedgerEntries.unshift(refundEntry);
      }

      // Restock the item.
      const productIndex = memory.marketplaceProducts.findIndex((item) => item.id === order.productId);
      if (productIndex !== -1) {
        const product = memory.marketplaceProducts[productIndex];
        memory.marketplaceProducts[productIndex] = { ...product, stock: product.stock + 1 };
      }

      memory.marketplaceOrders[index] = { ...order, status: "cancelled" };
      appendServerAudit({
        actor,
        action: "MALL_ORDER_CANCELLED",
        entity: "MarketplaceOrder",
        entityId: order.id,
        detail: `${order.riderName} cancelou ${order.productName}: +${order.pointsSpent} pts${cashRefund > 0 ? ` e R$ ${cashRefund.toFixed(2)}` : ""} estornados.`,
        risk: "Low",
      });
      appendEvent(MARKETPLACE_EVENTS.orderCancelled, { orderId: order.id, accountType: order.accountType, riderId: order.riderId, partnerId: order.partnerId, productId: order.productId, pointsRefunded: order.pointsSpent, cashRefunded: cashRefund }, actor);
      if (order.riderName) {
        await sendPushToRider(order.riderName, "Resgate cancelado", `Devolvemos ${order.pointsSpent} pts${cashRefund > 0 ? ` e R$ ${cashRefund.toFixed(2)}` : ""} para você.`, "/rider-app/mall");
      }
      return jsonResponse({ data: { order: memory.marketplaceOrders[index], balance: pointsAvailable + order.pointsSpent, cashBalance: cashBalanceOf(order.riderId) } });
    }

    case "confirmReceipt": {
      // Partner self-confirms receipt of a physical redemption shipped to its shop.
      const { orderId } = body as { orderId?: string };
      const { sessionFromRequest } = await import("../../lib/auth-session");
      const session = await sessionFromRequest(request);
      const partner = session?.portal === "partner" ? memory.crmPartners.find((p) => p.name === session.organization) : undefined;
      if (!partner) return jsonResponse({ error: "Conta de parceiro não encontrada." }, { status: 404 });
      const index = memory.marketplaceOrders.findIndex((item) => item.id === orderId);
      if (index === -1) return jsonResponse({ error: "Resgate não encontrado." }, { status: 404 });
      const order = memory.marketplaceOrders[index];
      if (order.accountType !== "partner" || order.partnerId !== partner.id) {
        return jsonResponse({ error: "Você só pode confirmar seus próprios resgates." }, { status: 403 });
      }
      if (order.status !== "created" && order.status !== "arrived") {
        return jsonResponse({ error: "Este resgate não pode ser confirmado neste estado." }, { status: 409 });
      }
      const stamp = nowStamp();
      memory.marketplaceOrders[index] = { ...order, status: "fulfilled", pickedUpAt: stamp };
      appendServerAudit({ actor, action: "MALL_PARTNER_RECEIPT_CONFIRMED", entity: "MarketplaceOrder", entityId: order.id, detail: `${partner.name} confirmou recebimento de ${order.productName}.`, risk: "Low" });
      return jsonResponse({ data: memory.marketplaceOrders[index] });
    }

    case "markArrived":
    case "markPickedUp": {
      const { orderId } = body as { orderId?: string };
      const index = memory.marketplaceOrders.findIndex((item) => item.id === orderId);
      if (index === -1) return jsonResponse({ error: "order not found" }, { status: 404 });
      const order = memory.marketplaceOrders[index];
      // High-value orders awaiting review cannot move forward until approved.
      if (order.reviewStatus === "pending") {
        return jsonResponse({ error: "Resgate em análise — aprove a revisão antes de avançar." }, { status: 409 });
      }
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
      appendEvent(body.action === "markArrived" ? MARKETPLACE_EVENTS.orderArrived : MARKETPLACE_EVENTS.orderFulfilled, { orderId: order.id, accountType: order.accountType, riderId: order.riderId, partnerId: order.partnerId, productId: order.productId, station: order.station }, actor);
      if (body.action === "markArrived" && order.riderName) {
        await sendPushToRider(order.riderName, "Seu resgate chegou! 🎁", `「${order.productName}」já está em ${order.station}. Retire quando puder.`, "/rider-app/mall");
      }
      return jsonResponse({ data: memory.marketplaceOrders[index] });
    }

    case "reviewOrder": {
      // HQ/mall operator decides a held high-value redemption.
      const { orderId, decision } = body as { orderId?: string; decision?: string };
      const index = memory.marketplaceOrders.findIndex((item) => item.id === orderId);
      if (index === -1) return jsonResponse({ error: "Resgate não encontrado." }, { status: 404 });
      const order = memory.marketplaceOrders[index];
      if (order.reviewStatus !== "pending") {
        return jsonResponse({ error: "Este resgate não está em análise." }, { status: 409 });
      }
      const stamp = nowStamp();

      if (decision === "approve") {
        const product = memory.marketplaceProducts.find((item) => item.id === order.productId);
        const isVirtual = product?.isVirtual === true;
        if (isVirtual) {
          const voucherCode = `MP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          memory.marketplaceOrders[index] = { ...order, reviewStatus: "approved", status: "fulfilled", pickedUpAt: stamp, voucherCode };
        } else {
          memory.marketplaceOrders[index] = { ...order, reviewStatus: "approved" };
        }
        appendServerAudit({ actor, action: "MALL_REVIEW_APPROVED", entity: "MarketplaceOrder", entityId: order.id, detail: `${order.riderName}: ${order.productName} (${order.pointsSpent} pts) aprovado.`, risk: "Medium" });
        if (order.riderName) {
          await sendPushToRider(order.riderName, "Resgate aprovado ✅", isVirtual ? `Seu código de ${order.productName} já está disponível.` : `「${order.productName}」foi aprovado e seguirá para entrega.`, "/rider-app/mall");
        }
        return jsonResponse({ data: memory.marketplaceOrders[index] });
      }

      // Reject → refund points (+ cash), restock and cancel.
      if (order.accountType === "rider" && order.riderId) {
        const pointsAvailable = getAvailablePoints(memory.pointsLedgerEntries, order.riderId);
        memory.pointsLedgerEntries.unshift({
          id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
          riderId: order.riderId,
          accountId: `pts-${order.riderId}`,
          type: "refund",
          points: order.pointsSpent,
          status: "approved",
          sourceType: "marketplace_order",
          sourceId: order.id,
          marketplaceOrderId: order.id,
          balanceAfter: pointsAvailable + order.pointsSpent,
          reasonCode: "MALL_REVIEW_REJECTED",
          note: `Revisão recusada: ${order.productName ?? "resgate"}`,
          createdBy: actor,
          createdAt: stamp,
        });
        const cashRefund = Math.round((order.cashDue ?? 0) * 100) / 100;
        if (cashRefund > 0) {
          const cashAvailable = cashBalanceOf(order.riderId);
          const refundEntry: CashLedgerEntry = {
            id: makeServerId("mcl", memory.cashLedgerEntries.length + 1),
            riderId: order.riderId,
            riderName: order.riderName ?? "",
            type: "refund",
            amountBRL: cashRefund,
            sourceId: order.id,
            balanceAfter: Math.round((cashAvailable + cashRefund) * 100) / 100,
            note: `Estorno (revisão recusada): ${order.productName ?? ""}`,
            createdBy: actor,
            createdAt: stamp,
          };
          memory.cashLedgerEntries.unshift(refundEntry);
        }
      }
      const productIndex = memory.marketplaceProducts.findIndex((item) => item.id === order.productId);
      if (productIndex !== -1) {
        const product = memory.marketplaceProducts[productIndex];
        memory.marketplaceProducts[productIndex] = { ...product, stock: product.stock + 1 };
      }
      memory.marketplaceOrders[index] = { ...order, status: "cancelled", reviewStatus: "rejected" };
      appendServerAudit({ actor, action: "MALL_REVIEW_REJECTED", entity: "MarketplaceOrder", entityId: order.id, detail: `${order.riderName}: ${order.productName} recusado, ${order.pointsSpent} pts estornados.`, risk: "Medium" });
      appendEvent(MARKETPLACE_EVENTS.orderRejected, { orderId: order.id, accountType: order.accountType, riderId: order.riderId, partnerId: order.partnerId, productId: order.productId, pointsRefunded: order.pointsSpent }, actor);
      if (order.riderName) {
        await sendPushToRider(order.riderName, "Resgate recusado", `Sua solicitação de ${order.productName} não foi aprovada. ${order.pointsSpent} pts foram devolvidos.`, "/rider-app/mall");
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
      // Points are granted only on every Nth completed service (config.
      // partnerServiceCount). Each scan is still recorded (count + anti-fraud);
      // the points-bearing entry lands on the Nth scan. N=1 → every scan earns.
      const n = Math.max(1, Math.floor(config.partnerServiceCount || 1));
      const priorScans = memory.partnerPointsLedgerEntries.filter(
        (entry) => entry.partnerId === partner.id && entry.reasonCode === "PARTNER_QR_SCAN",
      ).length;
      const scanNo = priorScans + 1;
      const earned = scanNo % n === 0;
      const points = earned ? config.partnerServicePoints : 0;
      const availableBefore = getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partner.id);
      const progress = scanNo % n; // 0 when earned
      const remaining = earned ? 0 : n - progress;

      memory.partnerPointsLedgerEntries.unshift({
        id: scanId,
        partnerId: partner.id,
        accountId: `ppts-${partner.id}`,
        type: "earn",
        points,
        status: "approved",
        sourceType: "partner_service_benefit",
        sourceId: scanId,
        balanceAfter: availableBefore + points,
        reasonCode: "PARTNER_QR_SCAN",
        note: earned ? `Validado por ${rider.name} — meta de ${n} serviços atingida: +${points} pts` : `Validado por ${rider.name} — progresso ${progress}/${n}`,
        createdBy: "QR Scan",
        createdAt: nowStamp(),
      });

      appendServerAudit({
        actor,
        action: "PARTNER_QR_SCANNED",
        entity: "PartnerPoints",
        entityId: partner.id,
        detail: `${rider.name} scanned ${partner.name}: scan #${scanNo}, ${earned ? `+${points} pts (meta ${n})` : `progresso ${progress}/${n}`}; ${todayScans + 1}/10 today.`,
        risk: "Low",
      });

      return jsonResponse({ data: { ok: true, partnerName: partner.name, points, earned, remaining, target: n, grantPoints: config.partnerServicePoints } }, { status: 201 });
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
