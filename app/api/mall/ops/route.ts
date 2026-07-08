import { appendInventoryLedger, appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../../lib/server/authz";
import { sessionFromRequest } from "../../../lib/auth-session";
import { pointsRules } from "../../../lib/points";
import type { CashLedgerEntry, CashTopUp, MallBanner, MallCategory, MallCoupon, MallCouponType, PriceChangeRequest, PurchaseOrder, PurchaseOrderItem, RevenueShareEntry, RevenueShareStatement, SupplierStatement, SupplierStatementLine } from "../../../lib/mall-ops";

/**
 * PontoMall operations API — mall back office + supplier supply chain.
 *
 * Visibility model:
 * - pontomall / pontosys sessions: everything.
 * - supplier sessions: only their own price changes, POs and statements.
 * - rider sessions: only the submitPaymentRef action (their own payment).
 */

const COLLECTIONS = [
  "cashTopUps",
  "cashLedgerEntries",
  "inventoryLedgerEntries",
  "mallCategories",
  "mallBanners",
  "mallCoupons",
  "priceChangeRequests",
  "purchaseOrders",
  "supplierStatements",
  "mallPayments",
  "marketplaceProducts",
  "marketplaceOrders",
  "mallRevenueShareEntries",
  "revenueShareStatements",
  "franchises",
  "pontos",
  "franchisePurchaseOrders",
  "stationStockLedgerEntries",
];

export function cashBalanceOf(riderId: string): number {
  let balance = 0;
  for (const entry of memory.cashLedgerEntries) {
    if (entry.riderId !== riderId) continue;
    balance += entry.type === "spend" ? -entry.amountBRL : entry.amountBRL;
  }
  return Math.round(balance * 100) / 100;
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Build/refresh the supplier statements for a natural month. Shared by the
 * `generateStatement` action and the lazy month-close autogen in GET (P1-1).
 * Regenerates only statements still in "draft" — confirmed/disputed/paid are
 * immutable here (a disputed statement must be reopened by HQ first).
 */
function runGenerateSupplierStatements(month: string): SupplierStatement[] {
  const productMap = new Map(memory.marketplaceProducts.map((product) => [product.id, product]));
  const linesBySupplier = new Map<string, SupplierStatementLine[]>();
  // Ownership-pool guard (franchise procurement): a redemption fulfilled
  // from the BUYOUT pool was already settled through its FPO — billing it
  // again here would pay the supplier twice. Orders whose station outbound
  // is 100% buyout are excluded (mixed/consignment stays billable).
  const buyoutOnlyOrders = new Set<string>();
  {
    const consumption = new Map<string, { consignment: number; buyout: number }>();
    for (const entry of memory.stationStockLedgerEntries) {
      if (entry.type !== "outbound" || entry.sourceType !== "mall_order") continue;
      const row = consumption.get(entry.sourceId) ?? { consignment: 0, buyout: 0 };
      row[entry.mode] += Math.abs(entry.qty);
      consumption.set(entry.sourceId, row);
    }
    for (const [orderId, row] of consumption) {
      if (row.buyout > 0 && row.consignment === 0) buyoutOnlyOrders.add(orderId);
    }
  }
  for (const order of memory.marketplaceOrders) {
    // Rider AND Partner redemptions both owe the supplier (P0-1); the
    // fulfilled/arrived scope matches the supplierSettlement read model.
    if (order.status !== "fulfilled" && order.status !== "arrived") continue;
    // Attribute to the FULFILMENT month (P0-3): a redemption picked up (or
    // arrived) in a later month settles in that month, not the order month.
    const fulfilledAt = order.pickedUpAt ?? order.arrivedAt ?? order.createdAt;
    if (!fulfilledAt.startsWith(month)) continue;
    if (buyoutOnlyOrders.has(order.id)) continue;
    const product = productMap.get(order.productId);
    if (!product?.supplierName) continue;
    const lines = linesBySupplier.get(product.supplierName) ?? [];
    lines.push({ orderId: order.id, productId: product.id, productName: product.name, supplyPrice: product.supplyPrice ?? 0, date: fulfilledAt.slice(0, 10) });
    linesBySupplier.set(product.supplierName, lines);
  }
  // Buyout FPOs received this month settle the supplier at the SNAPSHOTTED
  // supply price × received qty (one line per FPO item; supplyPrice holds
  // the line total so statement totals stay a plain sum).
  for (const fpo of memory.franchisePurchaseOrders) {
    if (fpo.mode !== "buyout" || fpo.source !== "supplier" || fpo.status !== "received") continue;
    if (!(fpo.receivedAt ?? "").startsWith(month)) continue;
    const lines = linesBySupplier.get(fpo.supplierName) ?? [];
    for (const item of fpo.items) {
      const receivedQty = Math.min(item.qty, item.receivedQty ?? item.qty);
      if (receivedQty <= 0) continue;
      lines.push({
        orderId: fpo.id,
        productId: item.productId,
        productName: `${item.name} ×${receivedQty}（加盟采购）`,
        supplyPrice: Math.round(receivedQty * (item.supplyPrice ?? 0) * 100) / 100,
        date: (fpo.receivedAt ?? "").slice(0, 10),
      });
    }
    linesBySupplier.set(fpo.supplierName, lines);
  }
  const created: SupplierStatement[] = [];
  for (const [supplier, lines] of linesBySupplier) {
    const id = `mst-${month}-${supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
    const existingIndex = memory.supplierStatements.findIndex((item) => item.id === id);
    const total = Math.round(lines.reduce((sum, line) => sum + line.supplyPrice, 0) * 100) / 100;
    if (existingIndex !== -1) {
      // Regenerate only while still a draft — confirmed/paid statements are immutable.
      if (memory.supplierStatements[existingIndex].status !== "draft") continue;
      memory.supplierStatements[existingIndex] = { ...memory.supplierStatements[existingIndex], lines, total };
      created.push(memory.supplierStatements[existingIndex]);
      continue;
    }
    const statement: SupplierStatement = { id, supplierName: supplier, month, lines, total, status: "draft", createdAt: nowStamp() };
    memory.supplierStatements.unshift(statement);
    created.push(statement);
  }
  return created;
}

/** Build/refresh the franchise revenue-share statements for a natural month.
 *  Shared by `generateRevShareStatement` and the GET autogen (P1-1). */
function runGenerateRevShareStatements(month: string): RevenueShareStatement[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byFranchise = new Map<string, RevenueShareEntry[]>();
  for (const e of memory.mallRevenueShareEntries) {
    if (e.month !== month) continue;
    const arr = byFranchise.get(e.franchise) ?? [];
    arr.push(e);
    byFranchise.set(e.franchise, arr);
  }
  const created: RevenueShareStatement[] = [];
  for (const [franchise, entries] of byFranchise) {
    const id = `rst-${month}-${franchise.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
    const existingIndex = memory.revenueShareStatements.findIndex((s) => s.id === id);
    if (existingIndex !== -1 && memory.revenueShareStatements[existingIndex].status !== "draft") continue;
    const stationMap = new Map<string, { orders: number; stationShareBRL: number }>();
    let franchiseNetTotal = 0;
    let stationShareTotal = 0;
    for (const e of entries) {
      const st = stationMap.get(e.pickupStoreName) ?? { orders: 0, stationShareBRL: 0 };
      st.orders += 1;
      st.stationShareBRL = r2(st.stationShareBRL + e.stationShareBRL);
      stationMap.set(e.pickupStoreName, st);
      franchiseNetTotal = r2(franchiseNetTotal + e.franchiseNetBRL);
      stationShareTotal = r2(stationShareTotal + e.stationShareBRL);
    }
    const statement: RevenueShareStatement = {
      id,
      franchise,
      month,
      stations: [...stationMap.entries()].map(([store, v]) => ({ store, orders: v.orders, stationShareBRL: v.stationShareBRL })),
      orders: entries.length,
      franchiseNetTotal,
      stationShareTotal,
      total: r2(franchiseNetTotal + stationShareTotal),
      status: "draft",
      createdAt: nowStamp(),
    };
    if (existingIndex !== -1) memory.revenueShareStatements[existingIndex] = statement;
    else memory.revenueShareStatements.unshift(statement);
    created.push(statement);
  }
  return created;
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "login required" }, { status: 401 });
  const isOffice = session.portal === "pontomall" || session.portal === "pontosys";
  const supplierName = session.portal === "supplier" ? session.organization || "" : "";
  const scope = await scopeFromRequest(request);
  if (!isOffice && !supplierName && !scope.franchise && !scope.station) return jsonResponse({ error: "forbidden" }, { status: 403 });

  await refreshCollectionsFromDatabase(COLLECTIONS);

  // P1-1 lazy month-close (no cron): when HQ opens the ops console and the
  // PREVIOUS natural month has no statements yet (any status counts as
  // generated — idempotent), draft them now with the same shared logic as the
  // generateStatement / generateRevShareStatement actions.
  if (isOffice) {
    const prev = new Date();
    prev.setUTCDate(1);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const prevMonth = prev.toISOString().slice(0, 7);
    const autoSupplier = memory.supplierStatements.some((s) => s.month === prevMonth) ? 0 : runGenerateSupplierStatements(prevMonth).length;
    const autoRevShare = memory.revenueShareStatements.some((s) => s.month === prevMonth) ? 0 : runGenerateRevShareStatements(prevMonth).length;
    if (autoSupplier > 0 || autoRevShare > 0) {
      appendServerAudit({ actor: session.name || "System", action: "MALL_STATEMENTS_AUTOGEN", entity: "SupplierStatement", entityId: prevMonth, detail: `Fecho automático ${prevMonth}: ${autoSupplier} fornecedores, ${autoRevShare} 加盟商 (draft).`, risk: "Low" });
    }
  }

  // Franchise / station portals: read-only sales revenue-share view. Franchise
  // sees its own entries + monthly statements (can confirm); station sees only
  // the entries for its own Ponto.
  if (!isOffice && (scope.franchise || scope.station)) {
    const entries = memory.mallRevenueShareEntries.filter((e) => (scope.franchise ? e.franchise === scope.franchise : e.pickupStoreName === scope.station));
    const statements = scope.franchise ? memory.revenueShareStatements.filter((s) => s.franchise === scope.franchise) : [];
    return jsonResponse({ data: { scope: scope.franchise ? "franchise" : "station", revShareEntries: entries.slice(0, 500), revShareStatements: statements } });
  }

  const own = <T extends { supplierName: string }>(rows: T[]) => (isOffice ? rows : rows.filter((row) => row.supplierName === supplierName));

  // Sales summary for the office overview (and the supplier's own slice).
  const orders = memory.marketplaceOrders.filter((order) => order.accountType === "rider" && order.status !== "cancelled");
  const productBySupplier = new Map(memory.marketplaceProducts.map((product) => [product.id, product.supplierName ?? ""]));
  const scopedOrders = isOffice ? orders : orders.filter((order) => productBySupplier.get(order.productId) === supplierName);
  const last30 = new Map<string, number>();
  const today = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    last30.set(d.toISOString().slice(0, 10), 0);
  }
  let pointsGmv = 0;
  let cashGmv = 0;
  for (const order of scopedOrders) {
    pointsGmv += order.pointsSpent;
    if (order.paymentStatus === "paid") cashGmv += order.cashDue ?? 0;
    const day = order.createdAt.slice(0, 10);
    if (last30.has(day)) last30.set(day, (last30.get(day) ?? 0) + 1);
  }

  // Office-only enrichments: high-value review queue, Partner redemptions and
  // a top-products leaderboard (across rider + partner, non-cancelled).
  const reviewPending = isOffice ? memory.marketplaceOrders.filter((o) => o.reviewStatus === "pending").length : 0;
  const partnerOrdersList = memory.marketplaceOrders.filter((o) => o.accountType === "partner" && o.status !== "cancelled");
  const partnerOrders = isOffice ? partnerOrdersList.length : 0;
  const partnerPointsSpent = isOffice ? partnerOrdersList.reduce((sum, o) => sum + o.pointsSpent, 0) : 0;
  const topMap = new Map<string, number>();
  if (isOffice) {
    for (const o of memory.marketplaceOrders) {
      if (o.status === "cancelled") continue;
      const key = o.productName ?? o.productId;
      topMap.set(key, (topMap.get(key) ?? 0) + 1);
    }
  }
  const topProducts = [...topMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  // P1-7 aging: office-only backlog counters — records sitting unprocessed for
  // more than 48 hours (createdAt format "YYYY-MM-DD HH:mm").
  const over48h = (ts?: string) => !!ts && Date.now() - new Date(ts.replace(" ", "T")).getTime() > 48 * 3600 * 1000;
  const aging = {
    pricingOver48h: isOffice ? memory.marketplaceProducts.filter((p) => p.status === "pending_pricing" && over48h(p.createdAt)).length : 0,
    priceChangesOver48h: isOffice ? memory.priceChangeRequests.filter((r) => r.status === "pending" && over48h(r.createdAt)).length : 0,
    topUpsOver48h: isOffice ? memory.cashTopUps.filter((t) => t.status === "submitted" && over48h(t.createdAt)).length : 0,
  };

  // Unified external GMV in BRL — single canonical conversion: points are
  // valued at the reference rate (`pointsPerBrlReference` pts ≈ R$1) and added
  // to the cash actually collected. Gives one comparable figure across the
  // points + PIX split (G6). Reference value only, not a cash-out promise.
  const pointsToBrlRate = (memory.mallConfigs.find((c) => c.id === "mall-config")?.pointsPerBrl) || pointsRules.pointsPerBrlReference || 10;
  const gmvBRL = Math.round((cashGmv + (pointsGmv + partnerPointsSpent) / pointsToBrlRate) * 100) / 100;

  return jsonResponse({
    data: {
      categories: [...memory.mallCategories].sort((a, b) => a.sort - b.sort),
      banners: [...memory.mallBanners].sort((a, b) => a.sort - b.sort),
      coupons: isOffice ? [...memory.mallCoupons] : [],
      priceChanges: own(memory.priceChangeRequests),
      purchaseOrders: own(memory.purchaseOrders),
      statements: own(memory.supplierStatements),
      payments: isOffice ? memory.mallPayments : [],
      topUps: isOffice ? memory.cashTopUps : [],
      cashLedger: isOffice ? memory.cashLedgerEntries.slice(0, 300) : [],
      revShareEntries: isOffice ? memory.mallRevenueShareEntries.slice(0, 500) : [],
      revShareStatements: isOffice ? memory.revenueShareStatements : [],
      summary: {
        orders: scopedOrders.length,
        pointsGmv,
        cashGmv: Math.round(cashGmv * 100) / 100,
        gmvBRL,
        pointsToBrlRate,
        pendingPayments: isOffice ? memory.mallPayments.filter((p) => p.status === "submitted").length + memory.cashTopUps.filter((t) => t.status === "submitted").length : 0,
        reviewPending,
        partnerOrders,
        partnerPointsSpent,
        topProducts,
        aging,
        daily: [...last30.entries()].map(([date, count]) => ({ date, count })),
      },
    },
  });
}

type Body = { action?: string } & Record<string, unknown>;

const OFFICE_ACTIONS = new Set([
  "addCategory",
  "updateCategory",
  "deleteCategory",
  "addBanner",
  "updateBanner",
  "deleteBanner",
  "decidePriceChange",
  "createPO",
  "confirmDraftPO",
  "cancelPO",
  "receivePO",
  "generateStatement",
  "payStatement",
  "reopenStatement",
  "generateRevShareStatement",
  "payRevShareStatement",
  "reopenRevShareStatement",
  "confirmPayment",
  "rejectPayment",
  "confirmTopUp",
  "rejectTopUp",
  "adjustCash",
]);
const SUPPLIER_ACTIONS = new Set(["requestPriceChange", "confirmPO", "shipPO", "confirmStatement", "disputeStatement"]);

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action ?? "");
  const session = await sessionFromRequest(request);
  const actor = roleFromRequest(request);

  // Permission gates per actor class. NOTE: plain riders hold the legacy
  // manage_marketplace permission, so office actions must never rely on it.
  if (OFFICE_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_points");
    if (forbidden) return forbidden;
    if (session && session.portal !== "pontomall" && session.portal !== "pontosys") {
      return jsonResponse({ error: "仅商城后台可执行此操作" }, { status: 403 });
    }
  } else if (SUPPLIER_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_supplier_catalog");
    if (forbidden) return forbidden;
  } else if (action === "submitPaymentRef" || action === "requestTopUp" || action === "submitTopUpRef") {
    const forbidden = requirePermission(request, "use_rider_app");
    if (forbidden) return forbidden;
  } else if (action === "setStationShare" || action === "confirmRevShareStatement" || action === "disputeRevShareStatement") {
    // Franchise (or HQ) actions: set station share / confirm or dispute the share statement.
    if (!session || (session.portal !== "franchise" && session.portal !== "pontomall" && session.portal !== "pontosys")) {
      return jsonResponse({ error: "仅加盟商或总部可执行此操作" }, { status: 403 });
    }
  } else {
    return jsonResponse({ error: "unknown action" }, { status: 400 });
  }

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const supplierName = session?.portal === "supplier" ? session.organization || "" : "";

  switch (action) {
    // ---- Merchandising ----------------------------------------------------
    case "addCategory": {
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return jsonResponse({ error: "name is required" }, { status: 400 });
      const category: MallCategory = { id: makeServerId("mcat", memory.mallCategories.length + 1), name, sort: Number(body.sort) || memory.mallCategories.length + 1, active: true };
      memory.mallCategories.push(category);
      return jsonResponse({ data: category }, { status: 201 });
    }
    case "updateCategory": {
      const index = memory.mallCategories.findIndex((item) => item.id === body.categoryId);
      if (index === -1) return jsonResponse({ error: "category not found" }, { status: 404 });
      const current = memory.mallCategories[index];
      memory.mallCategories[index] = {
        ...current,
        ...(body.name !== undefined ? { name: String(body.name).slice(0, 40) } : {}),
        ...(body.sort !== undefined ? { sort: Number(body.sort) || current.sort } : {}),
        ...(body.active !== undefined ? { active: body.active === true } : {}),
      };
      return jsonResponse({ data: memory.mallCategories[index] });
    }
    case "deleteCategory": {
      const index = memory.mallCategories.findIndex((item) => item.id === body.categoryId);
      if (index === -1) return jsonResponse({ error: "category not found" }, { status: 404 });
      const [removed] = memory.mallCategories.splice(index, 1);
      persistDeleteRecord("mallCategories", removed.id);
      return jsonResponse({ data: { ok: true } });
    }
    case "addBanner": {
      const title = String(body.title ?? "").trim().slice(0, 80);
      const imageUrl = String(body.imageUrl ?? "").trim().slice(0, 400);
      if (!title) return jsonResponse({ error: "title is required" }, { status: 400 });
      const banner: MallBanner = {
        id: makeServerId("mban", memory.mallBanners.length + 1),
        title,
        imageUrl,
        href: String(body.href ?? "").slice(0, 300) || undefined,
        sort: Number(body.sort) || memory.mallBanners.length + 1,
        active: true,
      };
      memory.mallBanners.push(banner);
      return jsonResponse({ data: banner }, { status: 201 });
    }
    case "updateBanner": {
      const index = memory.mallBanners.findIndex((item) => item.id === body.bannerId);
      if (index === -1) return jsonResponse({ error: "banner not found" }, { status: 404 });
      const current = memory.mallBanners[index];
      memory.mallBanners[index] = {
        ...current,
        ...(body.title !== undefined ? { title: String(body.title).slice(0, 80) } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: String(body.imageUrl).slice(0, 400) } : {}),
        ...(body.href !== undefined ? { href: String(body.href).slice(0, 300) || undefined } : {}),
        ...(body.sort !== undefined ? { sort: Number(body.sort) || current.sort } : {}),
        ...(body.active !== undefined ? { active: body.active === true } : {}),
      };
      return jsonResponse({ data: memory.mallBanners[index] });
    }
    case "deleteBanner": {
      const index = memory.mallBanners.findIndex((item) => item.id === body.bannerId);
      if (index === -1) return jsonResponse({ error: "banner not found" }, { status: 404 });
      const [removed] = memory.mallBanners.splice(index, 1);
      persistDeleteRecord("mallBanners", removed.id);
      return jsonResponse({ data: { ok: true } });
    }

    case "addCoupon": {
      const title = String(body.title ?? "").trim().slice(0, 60);
      if (!title) return jsonResponse({ error: "title is required" }, { status: 400 });
      const type: MallCouponType = body.type === "percent_off" ? "percent_off" : "points_off";
      const rawValue = Math.floor(Number(body.value) || 0);
      const value = type === "percent_off" ? Math.min(100, Math.max(1, rawValue)) : Math.max(1, rawValue);
      const validTiers = ["member", "bronze", "prata", "ouro", "diamante"] as const;
      const minTier = (validTiers as readonly string[]).includes(String(body.minTier)) ? (String(body.minTier) as MallCoupon["minTier"]) : "member";
      const coupon: MallCoupon = {
        id: makeServerId("cpn", memory.mallCoupons.length + 1),
        title,
        type,
        value,
        minPoints: Math.max(0, Math.floor(Number(body.minPoints) || 0)),
        minTier,
        perRiderLimit: Math.max(0, Math.floor(Number(body.perRiderLimit) || 0)),
        active: true,
        expiresAt: body.expiresAt ? String(body.expiresAt).slice(0, 10) : undefined,
        createdAt: nowStamp(),
        createdBy: actor,
      };
      memory.mallCoupons.push(coupon);
      appendServerAudit({ actor, action: "MALL_COUPON_CREATED", entity: "MallCoupon", entityId: coupon.id, detail: `${coupon.title}: ${type === "percent_off" ? `${value}%` : `-${value} pts`}, minTier ${minTier}, min ${coupon.minPoints} pts.`, risk: "Low" });
      return jsonResponse({ data: coupon }, { status: 201 });
    }
    case "updateCoupon": {
      const index = memory.mallCoupons.findIndex((item) => item.id === body.couponId);
      if (index === -1) return jsonResponse({ error: "coupon not found" }, { status: 404 });
      const current = memory.mallCoupons[index];
      memory.mallCoupons[index] = {
        ...current,
        ...(body.title !== undefined ? { title: String(body.title).slice(0, 60) } : {}),
        ...(body.value !== undefined ? { value: current.type === "percent_off" ? Math.min(100, Math.max(1, Math.floor(Number(body.value) || current.value))) : Math.max(1, Math.floor(Number(body.value) || current.value)) } : {}),
        ...(body.minPoints !== undefined ? { minPoints: Math.max(0, Math.floor(Number(body.minPoints) || 0)) } : {}),
        ...(body.perRiderLimit !== undefined ? { perRiderLimit: Math.max(0, Math.floor(Number(body.perRiderLimit) || 0)) } : {}),
        ...(body.active !== undefined ? { active: body.active === true } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? String(body.expiresAt).slice(0, 10) : undefined } : {}),
      };
      appendServerAudit({ actor, action: "MALL_COUPON_UPDATED", entity: "MallCoupon", entityId: current.id, detail: JSON.stringify(body).slice(0, 160), risk: "Low" });
      return jsonResponse({ data: memory.mallCoupons[index] });
    }
    case "deleteCoupon": {
      const index = memory.mallCoupons.findIndex((item) => item.id === body.couponId);
      if (index === -1) return jsonResponse({ error: "coupon not found" }, { status: 404 });
      const [removed] = memory.mallCoupons.splice(index, 1);
      persistDeleteRecord("mallCoupons", removed.id);
      appendServerAudit({ actor, action: "MALL_COUPON_DELETED", entity: "MallCoupon", entityId: removed.id, detail: removed.title, risk: "Low" });
      return jsonResponse({ data: { ok: true } });
    }

    // ---- Price changes ------------------------------------------------------
    case "requestPriceChange": {
      const product = memory.marketplaceProducts.find((item) => item.id === body.productId);
      if (!product) return jsonResponse({ error: "product not found" }, { status: 404 });
      if (supplierName && product.supplierName !== supplierName) return jsonResponse({ error: "只能调整自己的商品" }, { status: 403 });
      const newPrice = Number(body.newPrice);
      if (!Number.isFinite(newPrice) || newPrice <= 0) return jsonResponse({ error: "newPrice inválido" }, { status: 400 });
      const requestRow: PriceChangeRequest = {
        id: makeServerId("mpc", memory.priceChangeRequests.length + 1),
        productId: product.id,
        productName: product.name,
        supplierName: product.supplierName ?? supplierName,
        oldPrice: product.supplyPrice ?? 0,
        newPrice: Math.round(newPrice * 100) / 100,
        note: String(body.note ?? "").slice(0, 200) || undefined,
        status: "pending",
        createdAt: nowStamp(),
      };
      memory.priceChangeRequests.unshift(requestRow);
      appendServerAudit({ actor, action: "MALL_PRICE_CHANGE_REQUESTED", entity: "PriceChangeRequest", entityId: requestRow.id, detail: `${product.name}: R$${requestRow.oldPrice} → R$${requestRow.newPrice}`, risk: "Low" });
      return jsonResponse({ data: requestRow }, { status: 201 });
    }
    case "decidePriceChange": {
      const index = memory.priceChangeRequests.findIndex((item) => item.id === body.requestId);
      if (index === -1) return jsonResponse({ error: "request not found" }, { status: 404 });
      const row = memory.priceChangeRequests[index];
      if (row.status !== "pending") return jsonResponse({ error: "请求已处理" }, { status: 409 });
      const approve = body.approve === true;
      memory.priceChangeRequests[index] = { ...row, status: approve ? "approved" : "rejected", decidedAt: nowStamp(), decidedBy: actor, decisionNote: String(body.note ?? "").slice(0, 200) || undefined };
      if (approve) {
        const productIndex = memory.marketplaceProducts.findIndex((item) => item.id === row.productId);
        if (productIndex !== -1) {
          memory.marketplaceProducts[productIndex] = { ...memory.marketplaceProducts[productIndex], supplyPrice: row.newPrice };
        }
      }
      appendServerAudit({ actor, action: approve ? "MALL_PRICE_CHANGE_APPROVED" : "MALL_PRICE_CHANGE_REJECTED", entity: "PriceChangeRequest", entityId: row.id, detail: `${row.productName}: R$${row.oldPrice} → R$${row.newPrice}`, risk: "Medium" });
      return jsonResponse({ data: memory.priceChangeRequests[index] });
    }

    // ---- Purchase orders ----------------------------------------------------
    case "createPO": {
      const supplier = String(body.supplierName ?? "").trim();
      const rawItems = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
      const items: PurchaseOrderItem[] = [];
      for (const raw of rawItems) {
        const product = memory.marketplaceProducts.find((item) => item.id === raw.productId);
        const qty = Math.floor(Number(raw.qty) || 0);
        if (!product || qty <= 0) continue;
        items.push({ productId: product.id, name: product.name, qty, supplyPrice: product.supplyPrice ?? 0 });
      }
      if (!supplier || items.length === 0) return jsonResponse({ error: "supplierName e items são obrigatórios" }, { status: 400 });
      const po: PurchaseOrder = {
        id: makeServerId("mpo", memory.purchaseOrders.length + 1),
        supplierName: supplier,
        items,
        totalCost: Math.round(items.reduce((sum, item) => sum + item.qty * item.supplyPrice, 0) * 100) / 100,
        note: String(body.note ?? "").slice(0, 200) || undefined,
        status: "ordered",
        createdAt: nowStamp(),
        createdBy: actor,
      };
      memory.purchaseOrders.unshift(po);
      appendServerAudit({ actor, action: "MALL_PO_CREATED", entity: "PurchaseOrder", entityId: po.id, detail: `${supplier}: ${items.length} itens, R$${po.totalCost}`, risk: "Low" });
      return jsonResponse({ data: po }, { status: 201 });
    }
    case "confirmPO":
    case "shipPO": {
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      if (supplierName && po.supplierName !== supplierName) return jsonResponse({ error: "只能操作自己的补货单" }, { status: 403 });
      if (action === "confirmPO") {
        if (po.status !== "ordered") return jsonResponse({ error: "状态不允许确认" }, { status: 409 });
        memory.purchaseOrders[index] = { ...po, status: "confirmed", confirmedAt: nowStamp() };
      } else {
        if (po.status !== "confirmed") return jsonResponse({ error: "请先确认补货单" }, { status: 409 });
        memory.purchaseOrders[index] = { ...po, status: "shipped", shippedAt: nowStamp(), shipNote: String(body.shipNote ?? "").slice(0, 200) || undefined };
      }
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }
    case "receivePO": {
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      if (po.status !== "shipped") return jsonResponse({ error: "只有已发货的补货单可入库" }, { status: 409 });
      for (const item of po.items) {
        const productIndex = memory.marketplaceProducts.findIndex((product) => product.id === item.productId);
        if (productIndex !== -1) {
          memory.marketplaceProducts[productIndex] = { ...memory.marketplaceProducts[productIndex], stock: memory.marketplaceProducts[productIndex].stock + item.qty };
          appendInventoryLedger({ productId: item.productId, productName: item.name, type: "po_receive", qty: item.qty, stockAfter: memory.marketplaceProducts[productIndex].stock, sourceId: po.id, createdBy: actor });
        }
      }
      memory.purchaseOrders[index] = { ...po, status: "received", receivedAt: nowStamp(), receivedBy: actor };
      appendServerAudit({ actor, action: "MALL_PO_RECEIVED", entity: "PurchaseOrder", entityId: po.id, detail: `${po.supplierName}: +${po.items.reduce((sum, item) => sum + item.qty, 0)} unidades em estoque`, risk: "Low" });
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }
    case "confirmDraftPO": {
      // P1-2: promote an auto-replenish draft to a real order (same permission
      // class as createPO — office only via OFFICE_ACTIONS).
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      if (po.status !== "draft") return jsonResponse({ error: "只有补货草稿可确认下单" }, { status: 409 });
      memory.purchaseOrders[index] = { ...po, status: "ordered" };
      appendServerAudit({ actor, action: "MALL_PO_DRAFT_CONFIRMED", entity: "PurchaseOrder", entityId: po.id, detail: `${po.supplierName}: rascunho → ordered, ${po.items.reduce((sum, item) => sum + item.qty, 0)} un, R$${po.totalCost}`, risk: "Low" });
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }
    case "cancelPO": {
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      // "draft" (auto-replenish) POs are cancellable like any not-yet-received PO.
      if (po.status === "received") return jsonResponse({ error: "已入库的补货单不能取消" }, { status: 409 });
      memory.purchaseOrders[index] = { ...po, status: "cancelled" };
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }

    // ---- Statements -----------------------------------------------------------
    case "generateStatement": {
      const month = /^\d{4}-\d{2}$/.test(String(body.month)) ? String(body.month) : new Date().toISOString().slice(0, 7);
      const created = runGenerateSupplierStatements(month);
      appendServerAudit({ actor, action: "MALL_STATEMENTS_GENERATED", entity: "SupplierStatement", entityId: month, detail: `${created.length} fornecedores, mês ${month}`, risk: "Low" });
      return jsonResponse({ data: { created: created.length, statements: created } });
    }
    case "confirmStatement": {
      const index = memory.supplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.supplierStatements[index];
      if (supplierName && statement.supplierName !== supplierName) return jsonResponse({ error: "只能确认自己的对账单" }, { status: 403 });
      if (statement.status !== "draft") return jsonResponse({ error: "对账单已确认过" }, { status: 409 });
      memory.supplierStatements[index] = { ...statement, status: "confirmed", confirmedAt: nowStamp(), pixKey: String(body.pixKey ?? statement.pixKey ?? "").slice(0, 120) || undefined };
      return jsonResponse({ data: memory.supplierStatements[index] });
    }
    case "payStatement": {
      const index = memory.supplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.supplierStatements[index];
      if (statement.status !== "confirmed") return jsonResponse({ error: "供应商确认后才能付款" }, { status: 409 });
      memory.supplierStatements[index] = { ...statement, status: "paid", paidAt: nowStamp(), paidBy: actor, receiptNote: String(body.receiptNote ?? "").slice(0, 200) || undefined };
      appendServerAudit({ actor, action: "MALL_STATEMENT_PAID", entity: "SupplierStatement", entityId: statement.id, detail: `${statement.supplierName} ${statement.month}: R$${statement.total}`, risk: "Medium" });
      return jsonResponse({ data: memory.supplierStatements[index] });
    }
    case "disputeStatement": {
      // P1-4: a supplier contests its own draft/confirmed statement. Paid
      // statements are immutable and cannot be disputed.
      const index = memory.supplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.supplierStatements[index];
      if (supplierName && statement.supplierName !== supplierName) return jsonResponse({ error: "只能争议自己的对账单" }, { status: 403 });
      if (statement.status !== "draft" && statement.status !== "confirmed") return jsonResponse({ error: "已付款或已在争议中的对账单不可争议" }, { status: 409 });
      const note = String(body.note ?? "").trim().slice(0, 200);
      if (!note) return jsonResponse({ error: "informe o motivo da contestação" }, { status: 400 });
      memory.supplierStatements[index] = { ...statement, status: "disputed", disputeNote: note };
      appendServerAudit({ actor, action: "MALL_STATEMENT_DISPUTED", entity: "SupplierStatement", entityId: statement.id, detail: `${statement.supplierName} ${statement.month}: ${note}`, risk: "Medium" });
      return jsonResponse({ data: memory.supplierStatements[index] });
    }
    case "reopenStatement": {
      // P1-4: HQ resolves a dispute — disputed → draft (regenerable). The
      // disputeNote is kept for history; confirmation is invalidated.
      const index = memory.supplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.supplierStatements[index];
      if (statement.status !== "disputed") return jsonResponse({ error: "只有争议中的对账单可重新打开" }, { status: 409 });
      memory.supplierStatements[index] = { ...statement, status: "draft", confirmedAt: undefined };
      appendServerAudit({ actor, action: "MALL_STATEMENT_REOPENED", entity: "SupplierStatement", entityId: statement.id, detail: `${statement.supplierName} ${statement.month}: disputed → draft`, risk: "Medium" });
      return jsonResponse({ data: memory.supplierStatements[index] });
    }

    // ---- Hybrid payments ----------------------------------------------------
    case "submitPaymentRef": {
      const index = memory.mallPayments.findIndex((item) => item.orderId === body.orderId && item.status !== "confirmed");
      if (index === -1) return jsonResponse({ error: "payment not found" }, { status: 404 });
      const reference = String(body.reference ?? "").trim().slice(0, 120);
      if (!reference) return jsonResponse({ error: "informe o comprovante/código da transferência" }, { status: 400 });
      memory.mallPayments[index] = { ...memory.mallPayments[index], reference, status: "submitted", submittedAt: nowStamp() };
      const orderIndex = memory.marketplaceOrders.findIndex((item) => item.id === body.orderId);
      if (orderIndex !== -1) memory.marketplaceOrders[orderIndex] = { ...memory.marketplaceOrders[orderIndex], paymentStatus: "submitted" };
      return jsonResponse({ data: memory.mallPayments[index] });
    }
    case "confirmPayment":
    case "rejectPayment": {
      const index = memory.mallPayments.findIndex((item) => item.id === body.paymentId);
      if (index === -1) return jsonResponse({ error: "payment not found" }, { status: 404 });
      const payment = memory.mallPayments[index];
      if (payment.status === "confirmed") return jsonResponse({ error: "已核销" }, { status: 409 });
      const confirmed = action === "confirmPayment";
      memory.mallPayments[index] = { ...payment, status: confirmed ? "confirmed" : "rejected", decidedAt: nowStamp(), decidedBy: actor, note: String(body.note ?? "").slice(0, 200) || undefined };
      const orderIndex = memory.marketplaceOrders.findIndex((item) => item.id === payment.orderId);
      if (orderIndex !== -1) {
        memory.marketplaceOrders[orderIndex] = { ...memory.marketplaceOrders[orderIndex], paymentStatus: confirmed ? "paid" : "pending" };
      }
      appendServerAudit({ actor, action: confirmed ? "MALL_PAYMENT_CONFIRMED" : "MALL_PAYMENT_REJECTED", entity: "MallPayment", entityId: payment.id, detail: `${payment.riderName} · ${payment.productName} · R$${payment.amountBRL}`, risk: "Medium" });
      return jsonResponse({ data: memory.mallPayments[index] });
    }

    // ---- Cash balance top-ups (PIX, manual review) -------------------------
    case "requestTopUp": {
      const rider = memory.riders.find((item) => item.id === body.riderId);
      if (!rider) return jsonResponse({ error: "rider not found" }, { status: 404 });
      const amount = Math.round(Number(body.amountBRL) * 100) / 100;
      if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
        return jsonResponse({ error: "valor inválido (R$ 1 a R$ 5.000)" }, { status: 400 });
      }
      const config = memory.mallConfigs.find((item) => item.id === "mall-config");
      const topUp: CashTopUp = {
        id: makeServerId("mtu", memory.cashTopUps.length + 1),
        riderId: rider.id,
        riderName: rider.name,
        amountBRL: amount,
        pixKey: config?.pixKey ?? "",
        status: "pending",
        createdAt: nowStamp(),
      };
      memory.cashTopUps.unshift(topUp);
      return jsonResponse({ data: topUp }, { status: 201 });
    }
    case "submitTopUpRef": {
      const index = memory.cashTopUps.findIndex((item) => item.id === body.topUpId && item.status !== "confirmed");
      if (index === -1) return jsonResponse({ error: "top-up not found" }, { status: 404 });
      const reference = String(body.reference ?? "").trim().slice(0, 120);
      if (!reference) return jsonResponse({ error: "informe o comprovante da transferência" }, { status: 400 });
      memory.cashTopUps[index] = { ...memory.cashTopUps[index], reference, status: "submitted", submittedAt: nowStamp() };
      return jsonResponse({ data: memory.cashTopUps[index] });
    }
    case "confirmTopUp":
    case "rejectTopUp": {
      const index = memory.cashTopUps.findIndex((item) => item.id === body.topUpId);
      if (index === -1) return jsonResponse({ error: "top-up not found" }, { status: 404 });
      const topUp = memory.cashTopUps[index];
      if (topUp.status === "confirmed") return jsonResponse({ error: "已入账，不可重复操作" }, { status: 409 });
      const confirmed = action === "confirmTopUp";
      memory.cashTopUps[index] = { ...topUp, status: confirmed ? "confirmed" : "rejected", decidedAt: nowStamp(), decidedBy: actor, note: String(body.note ?? "").slice(0, 200) || undefined };
      if (confirmed) {
        const balance = cashBalanceOf(topUp.riderId);
        const entry: CashLedgerEntry = {
          id: makeServerId("mcl", memory.cashLedgerEntries.length + 1),
          riderId: topUp.riderId,
          riderName: topUp.riderName,
          type: "topup",
          amountBRL: topUp.amountBRL,
          sourceId: topUp.id,
          balanceAfter: Math.round((balance + topUp.amountBRL) * 100) / 100,
          note: topUp.reference ? `PIX ref ${topUp.reference}` : undefined,
          createdBy: actor,
          createdAt: nowStamp(),
        };
        memory.cashLedgerEntries.unshift(entry);
      }
      appendServerAudit({ actor, action: confirmed ? "MALL_TOPUP_CONFIRMED" : "MALL_TOPUP_REJECTED", entity: "CashTopUp", entityId: topUp.id, detail: `${topUp.riderName} R$${topUp.amountBRL.toFixed(2)}${topUp.reference ? ` ref ${topUp.reference}` : ""}`, risk: "Medium" });
      return jsonResponse({ data: memory.cashTopUps[index] });
    }
    case "adjustCash": {
      // Manual correction (refund / adjustment) — always leaves a ledger record.
      const rider = memory.riders.find((item) => item.id === body.riderId);
      if (!rider) return jsonResponse({ error: "rider not found" }, { status: 404 });
      const amount = Math.round(Number(body.amountBRL) * 100) / 100;
      const note = String(body.note ?? "").trim().slice(0, 200);
      if (!Number.isFinite(amount) || amount === 0 || !note) {
        return jsonResponse({ error: "amountBRL (≠0) e note são obrigatórios" }, { status: 400 });
      }
      const balance = cashBalanceOf(rider.id);
      if (balance + amount < 0) return jsonResponse({ error: `余额不足以扣减（当前 R$ ${balance.toFixed(2)}）` }, { status: 409 });
      const entry: CashLedgerEntry = {
        id: makeServerId("mcl", memory.cashLedgerEntries.length + 1),
        riderId: rider.id,
        riderName: rider.name,
        type: amount > 0 ? "refund" : "adjust",
        amountBRL: Math.abs(amount) * (amount > 0 ? 1 : 1),
        sourceId: `manual-${Date.now()}`,
        balanceAfter: Math.round((balance + amount) * 100) / 100,
        note,
        createdBy: actor,
        createdAt: nowStamp(),
      };
      // For negative adjustments store as spend-like entry with type adjust.
      if (amount < 0) entry.amountBRL = -Math.abs(amount);
      memory.cashLedgerEntries.unshift(entry);
      appendServerAudit({ actor, action: "MALL_CASH_ADJUSTED", entity: "CashLedger", entityId: entry.id, detail: `${rider.name} ${amount > 0 ? "+" : ""}${amount.toFixed(2)} · ${note}`, risk: "Medium" });
      return jsonResponse({ data: entry });
    }

    // ---- Sales revenue share (two-level: product → 加盟商 → 站点) ----------
    case "setStationShare": {
      const franchiseName = session?.portal === "franchise" ? (session.franchise || session.organization || "") : String(body.franchise ?? "");
      if (!franchiseName) return jsonResponse({ error: "加盟商未识别" }, { status: 400 });
      const value = Math.max(0, Math.round((Number(body.stationShareBRL) || 0) * 100) / 100);
      const index = memory.franchises.findIndex((f) => f.name === franchiseName);
      if (index === -1) return jsonResponse({ error: "加盟商不存在" }, { status: 404 });
      memory.franchises[index] = { ...memory.franchises[index], stationShareBRL: value };
      appendServerAudit({ actor, action: "MALL_STATION_SHARE_SET", entity: "Franchise", entityId: memory.franchises[index].id, detail: `${franchiseName} 站点分成 R$${value}/单`, risk: "Low" });
      return jsonResponse({ data: memory.franchises[index] });
    }
    case "generateRevShareStatement": {
      const month = /^\d{4}-\d{2}$/.test(String(body.month)) ? String(body.month) : new Date().toISOString().slice(0, 7);
      const created = runGenerateRevShareStatements(month);
      appendServerAudit({ actor, action: "MALL_REVSHARE_STATEMENTS_GENERATED", entity: "RevenueShareStatement", entityId: month, detail: `${created.length} 加盟商, ${month}`, risk: "Low" });
      return jsonResponse({ data: { created: created.length, statements: created } });
    }
    case "confirmRevShareStatement": {
      const index = memory.revenueShareStatements.findIndex((s) => s.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "对账单不存在" }, { status: 404 });
      const st = memory.revenueShareStatements[index];
      const franchiseName = session?.portal === "franchise" ? (session.franchise || session.organization || "") : st.franchise;
      if (st.franchise !== franchiseName) return jsonResponse({ error: "只能确认本加盟商对账单" }, { status: 403 });
      if (st.status !== "draft") return jsonResponse({ error: "对账单已确认" }, { status: 409 });
      memory.revenueShareStatements[index] = { ...st, status: "confirmed", confirmedAt: nowStamp() };
      return jsonResponse({ data: memory.revenueShareStatements[index] });
    }
    case "payRevShareStatement": {
      const index = memory.revenueShareStatements.findIndex((s) => s.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "对账单不存在" }, { status: 404 });
      const st = memory.revenueShareStatements[index];
      if (st.status !== "confirmed") return jsonResponse({ error: "加盟商确认后才能付款" }, { status: 409 });
      for (let i = 0; i < memory.mallRevenueShareEntries.length; i += 1) {
        const e = memory.mallRevenueShareEntries[i];
        if (e.franchise === st.franchise && e.month === st.month) memory.mallRevenueShareEntries[i] = { ...e, status: "settled" };
      }
      memory.revenueShareStatements[index] = { ...st, status: "paid", paidAt: nowStamp(), paidBy: actor, note: String(body.note ?? "").slice(0, 200) || undefined };
      appendServerAudit({ actor, action: "MALL_REVSHARE_PAID", entity: "RevenueShareStatement", entityId: st.id, detail: `${st.franchise} ${st.month}: R$${st.total}`, risk: "Medium" });
      return jsonResponse({ data: memory.revenueShareStatements[index] });
    }
    case "disputeRevShareStatement": {
      // P1-4: a franchise contests its own draft/confirmed share statement.
      const index = memory.revenueShareStatements.findIndex((s) => s.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "对账单不存在" }, { status: 404 });
      const st = memory.revenueShareStatements[index];
      const franchiseName = session?.portal === "franchise" ? (session.franchise || session.organization || "") : st.franchise;
      if (st.franchise !== franchiseName) return jsonResponse({ error: "只能争议本加盟商对账单" }, { status: 403 });
      if (st.status !== "draft" && st.status !== "confirmed") return jsonResponse({ error: "已付款或已在争议中的对账单不可争议" }, { status: 409 });
      const note = String(body.note ?? "").trim().slice(0, 200);
      if (!note) return jsonResponse({ error: "请填写争议原因" }, { status: 400 });
      memory.revenueShareStatements[index] = { ...st, status: "disputed", disputeNote: note };
      appendServerAudit({ actor, action: "MALL_REVSHARE_STATEMENT_DISPUTED", entity: "RevenueShareStatement", entityId: st.id, detail: `${st.franchise} ${st.month}: ${note}`, risk: "Medium" });
      return jsonResponse({ data: memory.revenueShareStatements[index] });
    }
    case "reopenRevShareStatement": {
      // P1-4: HQ only — disputed → draft (regenerable); disputeNote kept.
      const index = memory.revenueShareStatements.findIndex((s) => s.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "对账单不存在" }, { status: 404 });
      const st = memory.revenueShareStatements[index];
      if (st.status !== "disputed") return jsonResponse({ error: "只有争议中的对账单可重新打开" }, { status: 409 });
      memory.revenueShareStatements[index] = { ...st, status: "draft", confirmedAt: undefined };
      appendServerAudit({ actor, action: "MALL_REVSHARE_STATEMENT_REOPENED", entity: "RevenueShareStatement", entityId: st.id, detail: `${st.franchise} ${st.month}: disputed → draft`, risk: "Medium" });
      return jsonResponse({ data: memory.revenueShareStatements[index] });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
