import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../../lib/server/authz";
import { sessionFromRequest } from "../../../lib/auth-session";
import { appendEvent, PROCUREMENT_EVENTS } from "../../../lib/server/events";
import {
  PROCUREMENT_FEE_PCT,
  type ProcurementFeeEntry,
  type ProcurementSupplierStatement,
  type ProcurementSupplierStatementLine,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "../../../lib/mall-ops";

/**
 * Franchise direct procurement (加盟商直采分销) — V1.
 *
 * Business decisions (fixed for V1):
 * - Platform commission is a FIXED 8% on top of the distribution price: the
 *   franchise pays goodsTotal × 1.08, the supplier receives the full
 *   goodsTotal, the platform keeps the 8% (append-only ProcurementFeeEntry).
 * - PREPAID: the franchise transfers (PIX) to the platform first; HQ manually
 *   confirms the transfer before the supplier may confirm/ship (guards live
 *   in /api/mall/ops confirmPO/shipPO).
 * - Supplier ships DIRECTLY to the franchise; goods never enter platform
 *   stock (no `product.stock` delta, no inventory ledger — status only).
 * - The supplier sets the distribution price; HQ approves distributability.
 * - Feature flag: MallConfig.franchiseProcurementEnabled (default false,
 *   toggled via the mall `setConfig` action).
 *
 * Visibility model (GET):
 * - franchise sessions: flag, approved catalog, own POs, platform PIX key.
 * - supplier sessions: own distribution settings, own franchise POs, own
 *   procurement statements.
 * - pontomall / pontosys (HQ): approvals queue, all franchise POs, the
 *   commission ledger and all procurement statements.
 */

const COLLECTIONS = [
  "marketplaceProducts",
  "purchaseOrders",
  "procurementFeeEntries",
  "procurementSupplierStatements",
  "mallConfigs",
];

const r2 = (n: number) => Math.round(n * 100) / 100;

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function mallConfig() {
  return memory.mallConfigs.find((item) => item.id === "mall-config");
}

function procurementEnabled(): boolean {
  return mallConfig()?.franchiseProcurementEnabled === true;
}

/** True when a product is orderable by franchises (supplier opted in AND HQ approved). */
function orderable(product: { distributable?: boolean; distributionApproved?: boolean; wholesalePrice?: number }): boolean {
  return product.distributable === true && product.distributionApproved === true && (product.wholesalePrice ?? 0) > 0;
}

/**
 * Build/refresh the procurement supplier statements for a natural month —
 * franchise POs RECEIVED in the month × distribution price. Idempotent
 * (same runGenerate* pattern as the supplier/rev-share statements): only
 * statements still in "draft" are regenerated; confirmed/disputed/paid are
 * immutable here.
 */
function runGenerateProcurementStatements(month: string): ProcurementSupplierStatement[] {
  const linesBySupplier = new Map<string, ProcurementSupplierStatementLine[]>();
  for (const po of memory.purchaseOrders) {
    if (po.buyerType !== "franchise" || po.status !== "received") continue;
    if (!po.receivedAt || !po.receivedAt.startsWith(month)) continue;
    const lines = linesBySupplier.get(po.supplierName) ?? [];
    lines.push({
      poId: po.id,
      franchise: po.franchise ?? "",
      goodsTotal: po.goodsTotal ?? po.totalCost,
      units: po.items.reduce((sum, item) => sum + item.qty, 0),
      receivedAt: po.receivedAt.slice(0, 10),
    });
    linesBySupplier.set(po.supplierName, lines);
  }
  const created: ProcurementSupplierStatement[] = [];
  for (const [supplier, lines] of linesBySupplier) {
    const id = `pst-${month}-${supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
    const total = r2(lines.reduce((sum, line) => sum + line.goodsTotal, 0));
    const existingIndex = memory.procurementSupplierStatements.findIndex((item) => item.id === id);
    if (existingIndex !== -1) {
      if (memory.procurementSupplierStatements[existingIndex].status !== "draft") continue;
      memory.procurementSupplierStatements[existingIndex] = { ...memory.procurementSupplierStatements[existingIndex], lines, total };
      created.push(memory.procurementSupplierStatements[existingIndex]);
      continue;
    }
    const statement: ProcurementSupplierStatement = { id, supplierName: supplier, month, lines, total, status: "draft", createdAt: nowStamp() };
    memory.procurementSupplierStatements.unshift(statement);
    created.push(statement);
  }
  return created;
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "login required" }, { status: 401 });

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const enabled = procurementEnabled();
  const isOffice = session.portal === "pontomall" || session.portal === "pontosys";

  if (isOffice) {
    return jsonResponse({
      data: {
        enabled,
        pendingApprovals: memory.marketplaceProducts.filter((p) => p.distributable === true && p.distributionApproved !== true),
        allPOs: memory.purchaseOrders.filter((po) => po.buyerType === "franchise"),
        feeEntries: memory.procurementFeeEntries.slice(0, 500),
        statements: memory.procurementSupplierStatements,
      },
    });
  }

  if (session.portal === "supplier") {
    const supplierName = session.organization || "";
    return jsonResponse({
      data: {
        myDistribution: memory.marketplaceProducts
          .filter((p) => p.supplierName === supplierName)
          .map((p) => ({
            productId: p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            distributable: p.distributable === true,
            wholesalePrice: p.wholesalePrice,
            distributionApproved: p.distributionApproved === true,
            supplyPrice: p.supplyPrice,
            deliveryCycleDays: p.deliveryCycleDays,
          })),
        procurementPOs: memory.purchaseOrders.filter((po) => po.buyerType === "franchise" && po.supplierName === supplierName),
        statements: memory.procurementSupplierStatements.filter((s) => s.supplierName === supplierName),
      },
    });
  }

  if (session.portal === "franchise") {
    const franchiseName = session.franchise || session.organization || "";
    // Catalog is only exposed while the flag is on (createProcurementPO
    // enforces the same gate server-side).
    const catalog = enabled
      ? memory.marketplaceProducts
          .filter((p) => orderable(p))
          .map((p) => ({
            productId: p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            category: p.category,
            supplierName: p.supplierName,
            wholesalePrice: p.wholesalePrice,
            feePct: PROCUREMENT_FEE_PCT,
            deliveryCycleDays: p.deliveryCycleDays,
          }))
      : [];
    return jsonResponse({
      data: {
        enabled,
        catalog,
        myPOs: memory.purchaseOrders.filter((po) => po.buyerType === "franchise" && po.franchise === franchiseName),
        pixKey: mallConfig()?.pixKey ?? "",
      },
    });
  }

  return jsonResponse({ error: "forbidden" }, { status: 403 });
}

type Body = { action?: string } & Record<string, unknown>;

const HQ_ACTIONS = new Set(["approveDistribution", "confirmProcurementPayment", "generateProcurementStatement", "payProcurementStatement", "reopenProcurementStatement"]);
const SUPPLIER_ACTIONS = new Set(["setDistributable", "confirmProcurementStatement", "disputeProcurementStatement"]);
const FRANCHISE_ACTIONS = new Set(["createProcurementPO", "receiveProcurementPO"]);

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action ?? "");
  const session = await sessionFromRequest(request);
  const actor = roleFromRequest(request);

  // Permission gates per actor class (mirrors /api/mall/ops): HQ actions use
  // the shared manage_points authority + office portal; supplier actions use
  // manage_supplier_catalog + own-record scoping; franchise actions require a
  // franchise portal session (no bespoke auth — Hard Rule #5).
  if (HQ_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_points");
    if (forbidden) return forbidden;
    if (session && session.portal !== "pontomall" && session.portal !== "pontosys") {
      return jsonResponse({ error: "仅总部/商城后台可执行此操作" }, { status: 403 });
    }
  } else if (SUPPLIER_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_supplier_catalog");
    if (forbidden) return forbidden;
  } else if (FRANCHISE_ACTIONS.has(action)) {
    if (!session || session.portal !== "franchise") {
      return jsonResponse({ error: "仅加盟商可执行此操作" }, { status: 403 });
    }
  } else {
    return jsonResponse({ error: "unknown action" }, { status: 400 });
  }

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const supplierName = session?.portal === "supplier" ? session.organization || "" : "";
  const franchiseName = session?.portal === "franchise" ? session.franchise || session.organization || "" : "";

  switch (action) {
    // ---- Distribution settings (supplier) + eligibility approval (HQ) ------
    case "setDistributable": {
      const index = memory.marketplaceProducts.findIndex((item) => item.id === body.productId);
      if (index === -1) return jsonResponse({ error: "product not found" }, { status: 404 });
      const product = memory.marketplaceProducts[index];
      if (supplierName && product.supplierName !== supplierName) return jsonResponse({ error: "只能设置自己的商品" }, { status: 403 });
      const distributable = body.distributable === true;
      const rawPrice = body.wholesalePrice === undefined ? undefined : Number(body.wholesalePrice);
      if (rawPrice !== undefined && (!Number.isFinite(rawPrice) || rawPrice <= 0)) {
        return jsonResponse({ error: "wholesalePrice inválido (> 0)" }, { status: 400 });
      }
      const wholesalePrice = rawPrice !== undefined ? r2(rawPrice) : product.wholesalePrice;
      if (distributable && !(typeof wholesalePrice === "number" && wholesalePrice > 0)) {
        return jsonResponse({ error: "开启分销需要有效的分销价 (wholesalePrice > 0)" }, { status: 400 });
      }
      // Any change resets HQ approval — the listing must be re-reviewed.
      memory.marketplaceProducts[index] = { ...product, distributable, wholesalePrice, distributionApproved: false };
      appendEvent(PROCUREMENT_EVENTS.distributionUpdated, { productId: product.id, supplierName: product.supplierName ?? supplierName, distributable, wholesalePrice }, actor);
      appendServerAudit({ actor, action: "SUPPLIER_DISTRIBUTION_UPDATED", entity: "MarketplaceProduct", entityId: product.id, detail: `${product.name}: distributable=${distributable}, 分销价 R$${wholesalePrice ?? 0} — 待总部重审`, risk: "Low" });
      return jsonResponse({ data: memory.marketplaceProducts[index] });
    }
    case "approveDistribution": {
      const index = memory.marketplaceProducts.findIndex((item) => item.id === body.productId);
      if (index === -1) return jsonResponse({ error: "product not found" }, { status: 404 });
      const product = memory.marketplaceProducts[index];
      const approve = body.approve === true;
      if (approve && !(product.distributable === true && (product.wholesalePrice ?? 0) > 0)) {
        return jsonResponse({ error: "商品未开启分销或分销价无效,无法批准" }, { status: 409 });
      }
      memory.marketplaceProducts[index] = { ...product, distributionApproved: approve };
      appendEvent(PROCUREMENT_EVENTS.distributionApproved, { productId: product.id, supplierName: product.supplierName ?? "", approve }, actor);
      appendServerAudit({ actor, action: approve ? "PROCUREMENT_DISTRIBUTION_APPROVED" : "PROCUREMENT_DISTRIBUTION_REJECTED", entity: "MarketplaceProduct", entityId: product.id, detail: `${product.name} (${product.supplierName ?? "-"}): 分销资格${approve ? "通过" : "驳回"} · 分销价 R$${product.wholesalePrice ?? 0}`, risk: "Medium" });
      return jsonResponse({ data: memory.marketplaceProducts[index] });
    }

    // ---- Franchise procurement POs ------------------------------------------
    case "createProcurementPO": {
      if (!procurementEnabled()) return jsonResponse({ error: "加盟商直采未开启 (franchiseProcurementEnabled)" }, { status: 403 });
      if (!franchiseName) return jsonResponse({ error: "加盟商未识别" }, { status: 400 });
      const rawItems = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
      if (rawItems.length === 0) return jsonResponse({ error: "items é obrigatório" }, { status: 400 });
      const bySupplier = new Map<string, PurchaseOrderItem[]>();
      for (const raw of rawItems) {
        const product = memory.marketplaceProducts.find((item) => item.id === raw.productId);
        const qty = Math.floor(Number(raw.qty) || 0);
        if (!product || qty <= 0) return jsonResponse({ error: "item inválido (productId/qty)" }, { status: 400 });
        if (!orderable(product)) return jsonResponse({ error: `商品不可直采(未开启分销或未经总部审批): ${product.name}` }, { status: 400 });
        if (!product.supplierName) return jsonResponse({ error: `商品缺少供应商: ${product.name}` }, { status: 400 });
        const items = bySupplier.get(product.supplierName) ?? [];
        // `supplyPrice` on the PO item stores the DISTRIBUTION price snapshot.
        items.push({ productId: product.id, name: product.name, qty, supplyPrice: product.wholesalePrice ?? 0 });
        bySupplier.set(product.supplierName, items);
      }
      const pos: PurchaseOrder[] = [];
      for (const [supplier, items] of bySupplier) {
        const goodsTotal = r2(items.reduce((sum, item) => sum + item.qty * item.supplyPrice, 0));
        const feeBRL = r2(goodsTotal * (PROCUREMENT_FEE_PCT / 100));
        const po: PurchaseOrder = {
          id: makeServerId("fpo", memory.purchaseOrders.length + 1),
          supplierName: supplier,
          items,
          totalCost: goodsTotal,
          status: "ordered",
          createdAt: nowStamp(),
          createdBy: actor,
          buyerType: "franchise",
          franchise: franchiseName,
          goodsTotal,
          feeBRL,
          paymentStatus: "pending",
        };
        memory.purchaseOrders.unshift(po);
        pos.push(po);
        appendEvent(PROCUREMENT_EVENTS.poCreated, { poId: po.id, franchise: franchiseName, supplierName: supplier, goodsTotal, feeBRL, feePct: PROCUREMENT_FEE_PCT }, actor);
      }
      const goodsTotal = r2(pos.reduce((sum, po) => sum + (po.goodsTotal ?? 0), 0));
      const feeBRL = r2(pos.reduce((sum, po) => sum + (po.feeBRL ?? 0), 0));
      appendServerAudit({ actor, action: "PROCUREMENT_PO_CREATED", entity: "PurchaseOrder", entityId: pos.map((po) => po.id).join(","), detail: `${franchiseName}: ${pos.length} PO(s), 货款 R$${goodsTotal} + 佣金 R$${feeBRL} (${PROCUREMENT_FEE_PCT}%)`, risk: "Low" });
      return jsonResponse({ data: { pos, goodsTotal, feeBRL, payableTotal: r2(goodsTotal + feeBRL), pixKey: mallConfig()?.pixKey ?? "" } }, { status: 201 });
    }
    case "confirmProcurementPayment": {
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      if (po.buyerType !== "franchise") return jsonResponse({ error: "仅加盟商直采单需要预付确认" }, { status: 409 });
      if (po.status === "cancelled") return jsonResponse({ error: "已取消的直采单不能确认到账" }, { status: 409 });
      if (po.paymentStatus === "paid") return jsonResponse({ error: "该直采单已确认到账" }, { status: 409 });
      memory.purchaseOrders[index] = { ...po, paymentStatus: "paid" };
      // Append-only commission ledger (Hard Rule #4): accrue the 8% fee now.
      const entry: ProcurementFeeEntry = {
        id: makeServerId("pfe", memory.procurementFeeEntries.length + 1),
        poId: po.id,
        franchise: po.franchise ?? "",
        supplierName: po.supplierName,
        goodsTotal: po.goodsTotal ?? po.totalCost,
        feePct: PROCUREMENT_FEE_PCT,
        feeBRL: po.feeBRL ?? r2((po.goodsTotal ?? po.totalCost) * (PROCUREMENT_FEE_PCT / 100)),
        month: new Date().toISOString().slice(0, 7),
        status: "accrued",
        createdAt: nowStamp(),
      };
      memory.procurementFeeEntries.unshift(entry);
      appendEvent(PROCUREMENT_EVENTS.poPaid, { poId: po.id, franchise: entry.franchise, supplierName: po.supplierName, goodsTotal: entry.goodsTotal, feeBRL: entry.feeBRL }, actor);
      appendServerAudit({ actor, action: "PROCUREMENT_PAYMENT_CONFIRMED", entity: "PurchaseOrder", entityId: po.id, detail: `${entry.franchise} → ${po.supplierName}: PIX 到账 R$${r2(entry.goodsTotal + entry.feeBRL)} (货款 ${entry.goodsTotal} + 佣金 ${entry.feeBRL})`, risk: "Medium" });
      return jsonResponse({ data: { po: memory.purchaseOrders[index], feeEntry: entry } });
    }
    case "receiveProcurementPO": {
      const index = memory.purchaseOrders.findIndex((item) => item.id === body.poId);
      if (index === -1) return jsonResponse({ error: "PO not found" }, { status: 404 });
      const po = memory.purchaseOrders[index];
      if (po.buyerType !== "franchise" || po.franchise !== franchiseName) return jsonResponse({ error: "只能收自己的直采单" }, { status: 403 });
      if (po.status !== "shipped") return jsonResponse({ error: "只有已发货的直采单可确认收货" }, { status: 409 });
      // V1 boundary: goods go supplier → franchise directly. NO platform stock
      // delta and NO inventory-ledger entry — this is a status-only receipt.
      memory.purchaseOrders[index] = { ...po, status: "received", receivedAt: nowStamp(), receivedBy: actor };
      appendEvent(PROCUREMENT_EVENTS.poReceived, { poId: po.id, franchise: franchiseName, supplierName: po.supplierName, goodsTotal: po.goodsTotal ?? po.totalCost }, actor);
      appendServerAudit({ actor, action: "PROCUREMENT_PO_RECEIVED", entity: "PurchaseOrder", entityId: po.id, detail: `${franchiseName} 收货 ${po.supplierName} 直采单(不入平台库存)`, risk: "Low" });
      return jsonResponse({ data: memory.purchaseOrders[index] });
    }

    // ---- Monthly procurement supplier statements -----------------------------
    case "generateProcurementStatement": {
      const month = /^\d{4}-\d{2}$/.test(String(body.month)) ? String(body.month) : new Date().toISOString().slice(0, 7);
      const created = runGenerateProcurementStatements(month);
      appendServerAudit({ actor, action: "PROCUREMENT_STATEMENTS_GENERATED", entity: "ProcurementSupplierStatement", entityId: month, detail: `${created.length} fornecedores, mês ${month} (直采)`, risk: "Low" });
      return jsonResponse({ data: { created: created.length, statements: created } });
    }
    case "confirmProcurementStatement": {
      const index = memory.procurementSupplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.procurementSupplierStatements[index];
      if (supplierName && statement.supplierName !== supplierName) return jsonResponse({ error: "只能确认自己的对账单" }, { status: 403 });
      if (statement.status !== "draft") return jsonResponse({ error: "对账单已确认过" }, { status: 409 });
      memory.procurementSupplierStatements[index] = { ...statement, status: "confirmed", confirmedAt: nowStamp(), pixKey: String(body.pixKey ?? statement.pixKey ?? "").slice(0, 120) || undefined };
      return jsonResponse({ data: memory.procurementSupplierStatements[index] });
    }
    case "disputeProcurementStatement": {
      // Supplier contests its own draft/confirmed statement (mirrors the
      // supplier-statement disputeStatement in /api/mall/ops). Paid statements
      // are immutable and cannot be disputed.
      const index = memory.procurementSupplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.procurementSupplierStatements[index];
      if (supplierName && statement.supplierName !== supplierName) return jsonResponse({ error: "只能争议自己的对账单" }, { status: 403 });
      if (statement.status !== "draft" && statement.status !== "confirmed") return jsonResponse({ error: "已付款或已在争议中的对账单不可争议" }, { status: 409 });
      const note = String(body.note ?? "").trim().slice(0, 200);
      if (!note) return jsonResponse({ error: "informe o motivo da contestação" }, { status: 400 });
      memory.procurementSupplierStatements[index] = { ...statement, status: "disputed", disputeNote: note };
      appendServerAudit({ actor, action: "PROCUREMENT_STATEMENT_DISPUTED", entity: "ProcurementSupplierStatement", entityId: statement.id, detail: `${statement.supplierName} ${statement.month}: ${note}`, risk: "Medium" });
      return jsonResponse({ data: memory.procurementSupplierStatements[index] });
    }
    case "reopenProcurementStatement": {
      // HQ resolves a dispute — disputed → draft (regenerable via
      // runGenerateProcurementStatements, which only touches drafts). The
      // disputeNote is kept for history; confirmation is invalidated.
      const index = memory.procurementSupplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.procurementSupplierStatements[index];
      if (statement.status !== "disputed") return jsonResponse({ error: "只有争议中的对账单可重新打开" }, { status: 409 });
      memory.procurementSupplierStatements[index] = { ...statement, status: "draft", confirmedAt: undefined };
      appendServerAudit({ actor, action: "PROCUREMENT_STATEMENT_REOPENED", entity: "ProcurementSupplierStatement", entityId: statement.id, detail: `${statement.supplierName} ${statement.month}: disputed → draft`, risk: "Medium" });
      return jsonResponse({ data: memory.procurementSupplierStatements[index] });
    }
    case "payProcurementStatement": {
      const index = memory.procurementSupplierStatements.findIndex((item) => item.id === body.statementId);
      if (index === -1) return jsonResponse({ error: "statement not found" }, { status: 404 });
      const statement = memory.procurementSupplierStatements[index];
      if (statement.status !== "confirmed") return jsonResponse({ error: "供应商确认后才能付款" }, { status: 409 });
      // Settle the commission ledger entries of every PO in this statement.
      const poIds = new Set(statement.lines.map((line) => line.poId));
      for (let i = 0; i < memory.procurementFeeEntries.length; i += 1) {
        const entry = memory.procurementFeeEntries[i];
        if (poIds.has(entry.poId) && entry.status === "accrued") memory.procurementFeeEntries[i] = { ...entry, status: "settled" };
      }
      memory.procurementSupplierStatements[index] = { ...statement, status: "paid", paidAt: nowStamp(), paidBy: actor, receiptNote: String(body.receiptNote ?? "").slice(0, 200) || undefined };
      appendEvent(PROCUREMENT_EVENTS.poSettled, { statementId: statement.id, supplierName: statement.supplierName, month: statement.month, total: statement.total, poIds: [...poIds] }, actor);
      appendServerAudit({ actor, action: "PROCUREMENT_STATEMENT_PAID", entity: "ProcurementSupplierStatement", entityId: statement.id, detail: `${statement.supplierName} ${statement.month}: R$${statement.total} (直采货款)`, risk: "Medium" });
      return jsonResponse({ data: memory.procurementSupplierStatements[index] });
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
