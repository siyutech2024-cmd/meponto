import { getAvailablePartnerPoints, getAvailablePoints, type PointsAccountType } from "../../../lib/points";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

export function GET() {
  return jsonResponse({ data: memory.marketplaceOrders });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_marketplace");
  if (forbidden) return forbidden;

  const body = await request.json();
  const accountType: PointsAccountType = body.accountType === "partner" ? "partner" : "rider";
  const riderId = typeof body.riderId === "string" ? body.riderId : undefined;
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : undefined;
  const productId = typeof body.productId === "string" ? body.productId : "";
  const rider = riderId ? memory.riders.find((item) => item.id === riderId) : undefined;
  const partner = partnerId ? memory.crmPartners.find((item) => item.id === partnerId) : undefined;
  const product = memory.marketplaceProducts.find((item) => item.id === productId && item.status === "active");

  if (!productId || (accountType === "rider" && !riderId) || (accountType === "partner" && !partnerId)) {
    return jsonResponse({ error: "productId plus riderId or partnerId are required" }, { status: 400 });
  }
  if (accountType === "rider" && !rider) return jsonResponse({ error: "Rider not found" }, { status: 404 });
  if (accountType === "partner" && !partner) return jsonResponse({ error: "Partner not found" }, { status: 404 });
  if (accountType === "partner" && partner?.category === "Supplier") {
    return jsonResponse({ error: "Suppliers do not participate in points accounts" }, { status: 400 });
  }
  if (!product) return jsonResponse({ error: "Product not found" }, { status: 404 });
  if (product.stock <= 0) return jsonResponse({ error: "Product out of stock" }, { status: 409 });
  if (product.audience !== "both" && product.audience !== accountType) {
    return jsonResponse({ error: "Product not available for this account type" }, { status: 409 });
  }

  const available = accountType === "partner" && partnerId ? getAvailablePartnerPoints(memory.partnerPointsLedgerEntries, partnerId) : getAvailablePoints(memory.pointsLedgerEntries, riderId ?? "");
  if (available < product.pointsPrice) {
    return jsonResponse({ error: "Insufficient points", available, required: product.pointsPrice }, { status: 409 });
  }

  const createdAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const order = {
    id: makeServerId("mko", memory.marketplaceOrders.length + 1),
    accountType,
    riderId,
    partnerId,
    productId,
    pointsSpent: product.pointsPrice,
    status: "created" as const,
    createdAt,
  };
  memory.marketplaceOrders.unshift(order);
  let ledger;
  if (accountType === "partner" && partnerId) {
    ledger = {
      id: makeServerId("ppts", memory.partnerPointsLedgerEntries.length + 1),
      partnerId,
      accountId: `ppts-${partnerId}`,
      type: "spend" as const,
      points: product.pointsPrice,
      status: "approved" as const,
      sourceType: "marketplace_order" as const,
      sourceId: order.id,
      marketplaceOrderId: order.id,
      balanceAfter: available - product.pointsPrice,
      reasonCode: "MARKETPLACE_REDEMPTION",
      note: product.name,
      createdBy: "Marketplace",
      createdAt,
    };
    memory.partnerPointsLedgerEntries.unshift(ledger);
  } else {
    ledger = {
      id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
      riderId: riderId ?? "",
      accountId: `pts-${riderId}`,
      type: "spend" as const,
      points: product.pointsPrice,
      status: "approved" as const,
      sourceType: "marketplace_order" as const,
      sourceId: order.id,
      marketplaceOrderId: order.id,
      balanceAfter: available - product.pointsPrice,
      reasonCode: "MARKETPLACE_REDEMPTION",
      note: product.name,
      createdBy: "Marketplace",
      createdAt,
      approvedBy: "Marketplace",
      approvedAt: createdAt,
    };
    memory.pointsLedgerEntries.unshift(ledger);
  }
  memory.marketplaceProducts = memory.marketplaceProducts.map((item) => (item.id === product.id ? { ...item, stock: item.stock - 1 } : item));
  appendServerAudit({
    actor: "Marketplace",
    action: "MARKETPLACE_ORDER_CREATED",
    entity: "MarketplaceOrder",
    entityId: order.id,
    detail: `${accountType === "partner" ? partner?.name : rider?.name} redeemed ${product.name} for ${product.pointsPrice} points.`,
    risk: product.pointsPrice >= 8000 ? "Medium" : "Low",
  });

  return jsonResponse({ data: { order, ledger } }, { status: 201 });
}
