import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../../lib/server/authz";
import { sessionFromRequest } from "../../../lib/auth-session";
import type { MallBanner, MallCategory, PriceChangeRequest, PurchaseOrder, PurchaseOrderItem, SupplierStatement, SupplierStatementLine } from "../../../lib/mall-ops";

/**
 * PontoMall operations API — mall back office + supplier supply chain.
 *
 * Visibility model:
 * - pontomall / pontosys sessions: everything.
 * - supplier sessions: only their own price changes, POs and statements.
 * - rider sessions: only the submitPaymentRef action (their own payment).
 */

const COLLECTIONS = [
  "mallCategories",
  "mallBanners",
  "priceChangeRequests",
  "purchaseOrders",
  "supplierStatements",
  "mallPayments",
  "marketplaceProducts",
  "marketplaceOrders",
];

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "login required" }, { status: 401 });
  const isOffice = session.portal === "pontomall" || session.portal === "pontosys";
  const supplierName = session.portal === "supplier" ? session.organization || "" : "";
  if (!isOffice && !supplierName) return jsonResponse({ error: "forbidden" }, { status: 403 });

  await refreshCollectionsFromDatabase(COLLECTIONS);

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

  return jsonResponse({
    data: {
      categories: [...memory.mallCategories].sort((a, b) => a.sort - b.sort),
      banners: [...memory.mallBanners].sort((a, b) => a.sort - b.sort),
      priceChanges: own(memory.priceChangeRequests),
      purchaseOrders: own(memory.purchaseOrders),
      statements: own(memory.supplierStatements),
      payments: isOffice ? memory.mallPayments : [],
      summary: {
        orders: scopedOrders.length,
        pointsGmv,
        cashGmv: Math.round(cashGmv * 100) / 100,
        pendingPayments: isOffice ? memory.mallPayments.filter((p) => p.status === "submitted").length : 0,
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
  "cancelPO",
  "receivePO",
  "generateStatement",
  "payStatement",
  "confirmPayment",
  "rejectPayment",
]);
const SUPPLIER_ACTIONS = new Set(["requestPriceChange", "confirmPO", "shipPO", "confirmStatement"]);

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
  } else if (action === "submitPaymentRef") {
    const forbidden = requirePermission(request, "use_rider_app");
    if (forbidden) return forbidden;
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
        }
      }
      memory.purchaseOrders[index] = { ...po, status: "received", receivedAt: nowStamp(), receivedBy: actor };
      appendServerAudit({ actor, action: "MALL_PO_RECEIVED", entity: "PurchaseOrder", entityId: po.id, detail: `${po.supplierName}: +${po.items.reduce((sum, item) => sum + item.qty, 0)} unidades em estoque`, risk: "Low" });
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }
    case "cancelPO": {
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      if (po.status === "received") return jsonResponse({ error: "已入库的补货单不能取消" }, { status: 409 });
      memory.purchaseOrders[index] = { ...po, status: "cancelled" };
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }

    // ---- Statements -----------------------------------------------------------
    case "generateStatement": {
      const month = /^\d{4}-\d{2}$/.test(String(body.month)) ? String(body.month) : new Date().toISOString().slice(0, 7);
      const productMap = new Map(memory.marketplaceProducts.map((product) => [product.id, product]));
      const linesBySupplier = new Map<string, SupplierStatementLine[]>();
      for (const order of memory.marketplaceOrders) {
        if (order.accountType !== "rider" || (order.status !== "fulfilled" && order.status !== "arrived")) continue;
        if (!order.createdAt.startsWith(month)) continue;
        const product = productMap.get(order.productId);
        if (!product?.supplierName) continue;
        const lines = linesBySupplier.get(product.supplierName) ?? [];
        lines.push({ orderId: order.id, productId: product.id, productName: product.name, supplyPrice: product.supplyPrice ?? 0, date: order.createdAt.slice(0, 10) });
        linesBySupplier.set(product.supplierName, lines);
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

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
