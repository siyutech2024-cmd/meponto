import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../../lib/server/authz";
import { sessionFromRequest } from "../../../lib/auth-session";
import { appendEvent, PROCUREMENT_EVENTS } from "../../../lib/server/events";
import { postFranchiseDeposit, franchiseDepositBalance } from "../../../lib/server/franchise-deposit";
import { postStationStock } from "../../../lib/server/station-stock";
import { defaultMallConfig } from "../../../lib/mall";
import {
  FPO_TRANSITIONS,
  fpoTotal,
  projectStationStock,
  round2,
  type FpoItem,
  type FpoMode,
  type FpoStatus,
  type FranchiseDepositTopUp,
  type FranchisePurchaseOrder,
  type ProcurementDiscrepancy,
} from "../../../lib/procurement";

/**
 * Franchise procurement API — 加盟商选货 → 订货 → 到站 full chain
 * (docs/franchise-procurement-full-chain-plan.md).
 *
 * Actor model (per plan §2 — write actions are single-entry):
 * - franchise portal:  create/cancel own FPOs, request deposit top-ups.
 * - pontomall portal:  the ONLY office writer (approve/reject/cancel, HQ
 *   confirm/ship, exception close, stock adjust/transfer, config, top-ups).
 * - supplier portal:   confirm/ship/arrive own direct-ship FPOs.
 * - ponto portal:      receive goods into own station stock.
 * - pontosys portal:   read-only full visibility (GET only).
 */

const COLLECTIONS = [
  "franchisePurchaseOrders",
  "stationStockLedgerEntries",
  "franchiseDepositLedgerEntries",
  "franchiseDepositTopUps",
  "procurementDiscrepancies",
  "marketplaceProducts",
  "mallConfigs",
  "franchises",
  "pontos",
];

const FRANCHISE_ACTIONS = new Set(["createFPO", "cancelFPO", "requestDepositTopUp"]);
const OFFICE_ACTIONS = new Set([
  "approveFPO",
  "rejectFPO",
  "cancelFPO",
  "confirmFPO",
  "shipFPO",
  "arriveFPO",
  "receiveFPO",
  "closeExceptionFPO",
  "adjustStationStock",
  "transferStock",
  "setProcurementConfig",
  "setProductProcurement",
  "confirmDepositTopUp",
  "rejectDepositTopUp",
  "resolveDiscrepancy",
]);
const SUPPLIER_ACTIONS = new Set(["confirmFPO", "shipFPO", "arriveFPO"]);
const STATION_ACTIONS = new Set(["receiveFPO"]);

function mallConfig() {
  return memory.mallConfigs.find((item) => item.id === "mall-config") ?? defaultMallConfig;
}

function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

type ApiError = { error: string; errorKey?: string };
const err = (status: number, error: string, errorKey?: string) =>
  jsonResponse<ApiError>({ error, errorKey }, { status });

function catalogProducts() {
  return memory.marketplaceProducts
    // Virtual goods skip logistics entirely — they can never be stocked at a station.
    .filter((product) => product.status === "active" && product.isVirtual !== true && (product.procurementMode ?? "off") !== "off")
    .map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      imageUrl: product.imageUrl,
      supplierName: product.supplierName ?? "",
      procurementMode: product.procurementMode ?? "off",
      supplyPrice: product.supplyPrice ?? 0,
      franchiseBuyoutPrice: product.franchiseBuyoutPrice ?? 0,
      minOrderQty: Math.max(1, product.minOrderQty ?? 1),
      maxOrderQty: product.maxOrderQty ?? 0,
      stock: product.stock,
    }));
}

function stockBuckets(filter?: { franchise?: string; stationName?: string }) {
  const stationsOfFranchise = filter?.franchise
    ? new Set(memory.pontos.filter((p) => p.franchise === filter.franchise).map((p) => p.id))
    : null;
  return [...projectStationStock(memory.stationStockLedgerEntries).values()].filter((bucket) => {
    if (filter?.stationName && bucket.stationName !== filter.stationName) return false;
    if (stationsOfFranchise && !stationsOfFranchise.has(bucket.stationId)) return false;
    return true;
  });
}

const PROCUREMENT_CONFIG_KEYS = [
  "procurementEnabled",
  "procurementFrozen",
  "procurementAutoApproveBRL",
  "procurementMaxOrderBRL",
  "procurementShipTimeoutDays",
  "stationStockEnforcement",
] as const;

function configSnapshot() {
  const config = mallConfig();
  return {
    procurementEnabled: config.procurementEnabled === true,
    procurementFrozen: config.procurementFrozen === true,
    procurementAutoApproveBRL: config.procurementAutoApproveBRL ?? 0,
    procurementMaxOrderBRL: config.procurementMaxOrderBRL ?? 0,
    procurementShipTimeoutDays: config.procurementShipTimeoutDays ?? 7,
    stationStockEnforcement: config.stationStockEnforcement === true,
  };
}

export async function GET(request: Request) {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const session = await sessionFromRequest(request);
  const portal = session?.portal ?? (process.env.NODE_ENV !== "production" ? new URL(request.url).searchParams.get("portal") ?? "" : "");

  if (portal === "pontomall" || portal === "pontosys") {
    const forbidden = requirePermission(request, portal === "pontomall" ? "manage_points" : "view_analytics");
    if (forbidden) return forbidden;
    return jsonResponse({
      data: {
        viewer: portal === "pontomall" ? "office" : "readonly",
        config: configSnapshot(),
        catalog: catalogProducts(),
        // Full product list for the office product-procurement editor.
        products: memory.marketplaceProducts.map((product) => ({
          id: product.id,
          name: product.name,
          status: product.status,
          isVirtual: product.isVirtual === true,
          supplierName: product.supplierName ?? "",
          supplyPrice: product.supplyPrice ?? 0,
          procurementMode: product.procurementMode ?? "off",
          franchiseBuyoutPrice: product.franchiseBuyoutPrice ?? 0,
          minOrderQty: Math.max(1, product.minOrderQty ?? 1),
          maxOrderQty: product.maxOrderQty ?? 0,
        })),
        fpos: memory.franchisePurchaseOrders.slice(0, 500),
        stock: stockBuckets(),
        stockLedger: memory.stationStockLedgerEntries.slice(0, 500),
        depositLedger: memory.franchiseDepositLedgerEntries.slice(0, 500),
        topUps: memory.franchiseDepositTopUps.slice(0, 200),
        discrepancies: memory.procurementDiscrepancies.slice(0, 300),
        franchises: memory.franchises.map((f) => ({ name: f.name, depositBalance: round2(f.depositBalance ?? 0) })),
        stations: memory.pontos.map((p) => ({ id: p.id, name: p.name, franchise: p.franchise ?? "" })),
      },
    });
  }

  if (portal === "franchise") {
    const forbidden = requirePermission(request, "manage_procurement");
    if (forbidden) return forbidden;
    const franchise = session?.franchise || session?.organization || (process.env.NODE_ENV !== "production" ? new URL(request.url).searchParams.get("franchise") ?? "" : "");
    if (!franchise) return err(403, "Franchise scope missing", "fpErrForbidden");
    return jsonResponse({
      data: {
        viewer: "franchise",
        config: configSnapshot(),
        catalog: catalogProducts(),
        stations: memory.pontos
          .filter((p) => p.franchise === franchise && (p.status ?? "approved") === "approved")
          .map((p) => ({ id: p.id, name: p.name, bairro: p.bairro })),
        fpos: memory.franchisePurchaseOrders.filter((fpo) => fpo.franchise === franchise).slice(0, 300),
        stock: stockBuckets({ franchise }),
        depositBalance: franchiseDepositBalance(franchise),
        depositLedger: memory.franchiseDepositLedgerEntries.filter((entry) => entry.franchise === franchise).slice(0, 200),
        topUps: memory.franchiseDepositTopUps.filter((topUp) => topUp.franchise === franchise).slice(0, 100),
        discrepancies: memory.procurementDiscrepancies.filter((d) => d.franchise === franchise).slice(0, 200),
      },
    });
  }

  if (portal === "ponto") {
    const forbidden = requirePermission(request, "manage_slots");
    if (forbidden) return forbidden;
    const station = session?.station || session?.organization || (process.env.NODE_ENV !== "production" ? new URL(request.url).searchParams.get("station") ?? "" : "");
    if (!station) return err(403, "Station scope missing", "fpErrForbidden");
    return jsonResponse({
      data: {
        viewer: "station",
        config: configSnapshot(),
        fpos: memory.franchisePurchaseOrders.filter((fpo) => fpo.stationName === station).slice(0, 300),
        stock: stockBuckets({ stationName: station }),
        discrepancies: memory.procurementDiscrepancies.filter((d) => d.stationName === station).slice(0, 200),
      },
    });
  }

  if (portal === "supplier") {
    const forbidden = requirePermission(request, "manage_supplier_catalog");
    if (forbidden) return forbidden;
    const supplierName = session?.organization ?? "";
    return jsonResponse({
      data: {
        viewer: "supplier",
        config: configSnapshot(),
        fpos: memory.franchisePurchaseOrders
          .filter((fpo) => fpo.source === "supplier" && fpo.supplierName === supplierName && fpo.status !== "submitted")
          .slice(0, 300),
      },
    });
  }

  return err(403, "Forbidden", "fpErrForbidden");
}

type Body = { action?: string } & Record<string, unknown>;

function findFpo(body: Body): { index: number; fpo?: FranchisePurchaseOrder } {
  const index = memory.franchisePurchaseOrders.findIndex((item) => item.id === body.fpoId);
  return { index, fpo: index === -1 ? undefined : memory.franchisePurchaseOrders[index] };
}

function assertTransition(fpo: FranchisePurchaseOrder, next: FpoStatus): boolean {
  return FPO_TRANSITIONS[fpo.status]?.includes(next) ?? false;
}

function updateFpo(index: number, patch: Partial<FranchisePurchaseOrder>) {
  memory.franchisePurchaseOrders[index] = { ...memory.franchisePurchaseOrders[index], ...patch };
  return memory.franchisePurchaseOrders[index];
}

/** Refund every remaining buyout Real for an FPO (idempotent per reason key). */
function refundBuyout(fpo: FranchisePurchaseOrder, amountBRL: number, reasonKey: string, actor: string) {
  if (fpo.mode !== "buyout" || amountBRL <= 0) return null;
  const result = postFranchiseDeposit({
    franchise: fpo.franchise,
    type: "order_refund",
    amountBRL: round2(amountBRL),
    sourceType: "fpo",
    sourceId: `${fpo.id}:${reasonKey}`,
    note: `FPO ${fpo.id} ${reasonKey}`,
    createdBy: actor,
  });
  return result.ok ? result.entry : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action ?? "");
  const session = await sessionFromRequest(request);
  const actor = roleFromRequest(request);
  const portal = session?.portal ?? "";

  const isFranchiseActor = portal === "franchise";
  const isOfficeActor = portal === "pontomall";
  const isSupplierActor = portal === "supplier";
  const isStationActor = portal === "ponto";

  // ---- permission gates (write actions have exactly one owning portal class) ----
  if (isOfficeActor && OFFICE_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_points");
    if (forbidden) return forbidden;
  } else if (isFranchiseActor && FRANCHISE_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_procurement");
    if (forbidden) return forbidden;
  } else if (isSupplierActor && SUPPLIER_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_supplier_catalog");
    if (forbidden) return forbidden;
  } else if (isStationActor && STATION_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_slots");
    if (forbidden) return forbidden;
  } else if (!session && process.env.NODE_ENV !== "production") {
    // Local tooling without a portal session falls back to pure RBAC.
    const forbidden = requirePermission(request, OFFICE_ACTIONS.has(action) ? "manage_points" : "manage_procurement");
    if (forbidden) return forbidden;
  } else {
    return err(403, "This portal cannot perform this action", "fpErrForbidden");
  }

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const config = mallConfig();

  // Emergency stop blocks every write except turning the freeze off.
  if (config.procurementFrozen === true && action !== "setProcurementConfig") {
    return err(423, "Procurement is frozen", "fpErrFrozen");
  }

  const supplierName = isSupplierActor ? session?.organization ?? "" : "";
  const franchiseName = isFranchiseActor
    ? session?.franchise || session?.organization || ""
    : process.env.NODE_ENV !== "production" && !session
      ? String(body.franchise ?? "")
      : "";
  const stationScope = isStationActor ? session?.station || session?.organization || "" : "";

  switch (action) {
    // ---- Franchise: 选货下单 -------------------------------------------------
    case "createFPO": {
      if (config.procurementEnabled !== true) return err(409, "Procurement is not enabled", "fpErrFlagOff");
      if (!franchiseName || !memory.franchises.some((f) => f.name === franchiseName)) {
        return err(403, "Unknown franchise", "fpErrForbidden");
      }
      const station = memory.pontos.find((p) => p.id === body.stationId);
      if (!station || station.franchise !== franchiseName || (station.status ?? "approved") !== "approved") {
        return err(403, "Station does not belong to this franchise", "fpErrStationNotOwned");
      }
      const mode: FpoMode = body.mode === "buyout" ? "buyout" : "consignment";
      const rawItems = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
      if (rawItems.length === 0) return err(400, "items are required", "fpErrQtyRange");

      // Validate every line and snapshot prices before anything is written.
      const lines: Array<{ item: FpoItem; supplier: string }> = [];
      for (const raw of rawItems) {
        const product = memory.marketplaceProducts.find((item) => item.id === raw.productId);
        const qty = Math.trunc(Number(raw.qty) || 0);
        if (!product || product.status !== "active" || product.isVirtual === true) return err(409, "Product unavailable", "fpErrNotFound");
        const allowed = product.procurementMode ?? "off";
        if (allowed === "off" || (allowed !== "both" && allowed !== mode)) {
          return err(409, `Mode ${mode} not allowed for ${product.name}`, "fpErrModeNotAllowed");
        }
        const minQty = Math.max(1, product.minOrderQty ?? 1);
        const maxQty = product.maxOrderQty ?? 0;
        if (qty < minQty || (maxQty > 0 && qty > maxQty)) {
          return err(409, `Quantity out of range for ${product.name}`, "fpErrQtyRange");
        }
        const unitPrice = mode === "buyout" ? round2(product.franchiseBuyoutPrice ?? 0) : round2(product.supplyPrice ?? 0);
        if (mode === "buyout" && unitPrice <= 0) return err(409, `No buyout price for ${product.name}`, "fpErrModeNotAllowed");
        lines.push({
          item: { productId: product.id, name: product.name, qty, unitPrice, supplyPrice: round2(product.supplyPrice ?? 0) },
          supplier: product.supplierName || "HQ",
        });
      }

      // Split the cart by supplier — one FPO per supplier leg.
      const groups = new Map<string, FpoItem[]>();
      for (const line of lines) {
        const list = groups.get(line.supplier) ?? [];
        list.push(line.item);
        groups.set(line.supplier, list);
      }

      const maxOrder = config.procurementMaxOrderBRL ?? 0;
      const totals = [...groups.values()].map((items) => fpoTotal(items));
      if (maxOrder > 0 && totals.some((total) => total > maxOrder)) {
        return err(409, "Order exceeds the per-FPO cap", "fpErrQtyRange");
      }
      const grandTotal = round2(totals.reduce((sum, total) => sum + total, 0));
      if (mode === "buyout" && franchiseDepositBalance(franchiseName) < grandTotal) {
        return err(409, "Insufficient deposit balance", "fpErrInsufficientBalance");
      }

      const autoApprove = (config.procurementAutoApproveBRL ?? 0) > 0;
      const created: FranchisePurchaseOrder[] = [];
      for (const [supplier, items] of groups) {
        const total = fpoTotal(items);
        const fpo: FranchisePurchaseOrder = {
          id: makeServerId("fpo", memory.franchisePurchaseOrders.length + created.length + 1),
          franchise: franchiseName,
          stationId: station.id,
          stationName: station.name,
          supplierName: supplier,
          source: supplier === "HQ" ? "hq" : "supplier",
          mode,
          items,
          totalBRL: total,
          status: "submitted",
          note: String(body.note ?? "").slice(0, 200) || undefined,
          createdAt: nowStamp(),
          createdBy: actor,
        };
        if (mode === "buyout") {
          const debit = postFranchiseDeposit({
            franchise: franchiseName,
            type: "order_debit",
            amountBRL: -total,
            sourceType: "fpo",
            sourceId: fpo.id,
            note: `FPO ${fpo.id} → ${station.name}`,
            createdBy: actor,
          });
          if (!debit.ok) {
            // Roll earlier legs back with compensating refunds (append-only).
            for (const prior of created) refundBuyout(prior, prior.totalBRL, "split-rollback", actor);
            for (const prior of created) {
              const priorIndex = memory.franchisePurchaseOrders.findIndex((item) => item.id === prior.id);
              if (priorIndex !== -1) updateFpo(priorIndex, { status: "cancelled", cancelledAt: nowStamp(), cancelReason: "split rollback" });
            }
            return err(409, "Insufficient deposit balance", "fpErrInsufficientBalance");
          }
          fpo.depositLedgerIds = [debit.entry.id];
        }
        if (autoApprove && total <= (config.procurementAutoApproveBRL ?? 0)) {
          fpo.status = "approved";
          fpo.autoApproved = true;
          fpo.approvedAt = nowStamp();
          fpo.approvedBy = "auto";
        }
        memory.franchisePurchaseOrders.unshift(fpo);
        created.push(fpo);
        appendEvent(PROCUREMENT_EVENTS.fpoCreated, { fpoId: fpo.id, franchise: franchiseName, stationId: station.id, mode, supplier, totalBRL: total, autoApproved: fpo.autoApproved === true }, actor);
        if (fpo.status === "approved") appendEvent(PROCUREMENT_EVENTS.fpoApproved, { fpoId: fpo.id, auto: true }, actor);
        appendServerAudit({ actor, action: "FPO_CREATED", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: `${franchiseName} → ${station.name} · ${supplier} · ${mode} · R$${total}`, risk: mode === "buyout" ? "Medium" : "Low" });
      }
      return jsonResponse({ data: created }, { status: 201 });
    }

    case "cancelFPO": {
      const { index, fpo } = findFpo(body);
      if (!fpo) return err(404, "FPO not found", "fpErrNotFound");
      const reason = String(body.reason ?? "").slice(0, 200);
      if (isFranchiseActor) {
        if (fpo.franchise !== franchiseName) return err(403, "Not your order", "fpErrForbidden");
        if (fpo.status !== "submitted") return err(409, "Only submitted orders can be cancelled", "fpErrBadStatus");
      } else {
        // Office cancel — approved/confirmed require a reason; shipped must use closeExceptionFPO.
        if (!["submitted", "approved", "confirmed"].includes(fpo.status)) return err(409, "Status not cancellable", "fpErrBadStatus");
        if (fpo.status !== "submitted" && !reason) return err(400, "Reason required", "fpErrReasonRequired");
      }
      if (!assertTransition(fpo, "cancelled")) return err(409, "Illegal transition", "fpErrBadStatus");
      refundBuyout(fpo, fpo.totalBRL, "cancel", actor);
      const updated = updateFpo(index, { status: "cancelled", cancelledAt: nowStamp(), cancelReason: reason || undefined });
      appendEvent(PROCUREMENT_EVENTS.fpoCancelled, { fpoId: fpo.id, by: isFranchiseActor ? "franchise" : "office", reason }, actor);
      appendServerAudit({ actor, action: "FPO_CANCELLED", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: reason || "franchise cancel", risk: fpo.mode === "buyout" ? "Medium" : "Low" });
      return jsonResponse({ data: updated });
    }

    // ---- Office: 审批 --------------------------------------------------------
    case "approveFPO":
    case "rejectFPO": {
      const { index, fpo } = findFpo(body);
      if (!fpo) return err(404, "FPO not found", "fpErrNotFound");
      const next: FpoStatus = action === "approveFPO" ? "approved" : "rejected";
      if (!assertTransition(fpo, next)) return err(409, "Only submitted orders can be decided", "fpErrBadStatus");
      if (next === "rejected") refundBuyout(fpo, fpo.totalBRL, "reject", actor);
      const updated = updateFpo(index, next === "approved"
        ? { status: next, approvedAt: nowStamp(), approvedBy: actor }
        : { status: next, rejectedAt: nowStamp(), cancelReason: String(body.reason ?? "").slice(0, 200) || undefined });
      appendEvent(next === "approved" ? PROCUREMENT_EVENTS.fpoApproved : PROCUREMENT_EVENTS.fpoRejected, { fpoId: fpo.id }, actor);
      appendServerAudit({ actor, action: next === "approved" ? "FPO_APPROVED" : "FPO_REJECTED", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: `${fpo.franchise} · R$${fpo.totalBRL}`, risk: "Medium" });
      return jsonResponse({ data: updated });
    }

    // ---- Supplier / HQ warehouse: 确认与发货 ---------------------------------
    case "confirmFPO":
    case "shipFPO": {
      const { index, fpo } = findFpo(body);
      if (!fpo) return err(404, "FPO not found", "fpErrNotFound");
      if (isSupplierActor && (fpo.source !== "supplier" || fpo.supplierName !== supplierName)) {
        return err(403, "Not your order", "fpErrForbidden");
      }
      if (isOfficeActor && fpo.source !== "hq" && action === "confirmFPO") {
        // Office may still operate supplier legs for support, but log it loudly.
        appendServerAudit({ actor, action: "FPO_OFFICE_OVERRIDE", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: `office ${action} on supplier leg`, risk: "Medium" });
      }
      if (action === "confirmFPO") {
        if (!assertTransition(fpo, "confirmed")) return err(409, "Approve the order first", "fpErrBadStatus");
        const updated = updateFpo(index, { status: "confirmed", confirmedAt: nowStamp() });
        appendEvent(PROCUREMENT_EVENTS.fpoConfirmed, { fpoId: fpo.id }, actor);
        return jsonResponse({ data: updated });
      }
      if (!assertTransition(fpo, "shipped")) return err(409, "Confirm the order first", "fpErrBadStatus");
      if (fpo.source === "hq") {
        // Central-warehouse legs consume global stock at ship time.
        for (const item of fpo.items) {
          const product = memory.marketplaceProducts.find((p) => p.id === item.productId);
          if (!product || product.stock < item.qty) return err(409, `Insufficient central stock for ${item.name}`, "fpErrStockShort");
        }
        for (const item of fpo.items) {
          const productIndex = memory.marketplaceProducts.findIndex((p) => p.id === item.productId);
          memory.marketplaceProducts[productIndex] = { ...memory.marketplaceProducts[productIndex], stock: memory.marketplaceProducts[productIndex].stock - item.qty };
        }
      }
      const updated = updateFpo(index, { status: "shipped", shippedAt: nowStamp(), shipNote: String(body.shipNote ?? "").slice(0, 200) || undefined });
      appendEvent(PROCUREMENT_EVENTS.fpoShipped, { fpoId: fpo.id, source: fpo.source }, actor);
      appendServerAudit({ actor, action: "FPO_SHIPPED", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: `${fpo.supplierName} → ${fpo.stationName}`, risk: "Low" });
      return jsonResponse({ data: updated });
    }

    case "arriveFPO": {
      const { index, fpo } = findFpo(body);
      if (!fpo) return err(404, "FPO not found", "fpErrNotFound");
      if (isSupplierActor && (fpo.source !== "supplier" || fpo.supplierName !== supplierName)) return err(403, "Not your order", "fpErrForbidden");
      if (!assertTransition(fpo, "arrived")) return err(409, "Only shipped orders can arrive", "fpErrBadStatus");
      const updated = updateFpo(index, { status: "arrived", arrivedAt: nowStamp() });
      appendEvent(PROCUREMENT_EVENTS.fpoArrived, { fpoId: fpo.id }, actor);
      return jsonResponse({ data: updated });
    }

    // ---- Station: 收货入库（差异自动登记,买断短装自动退款） --------------------
    case "receiveFPO": {
      const { index, fpo } = findFpo(body);
      if (!fpo) return err(404, "FPO not found", "fpErrNotFound");
      if (isStationActor && fpo.stationName !== stationScope) return err(403, "Not your station", "fpErrForbidden");
      if (fpo.status !== "shipped" && fpo.status !== "arrived") return err(409, "Order is not receivable", "fpErrBadStatus");

      const receivedMap = new Map<string, number>();
      for (const raw of Array.isArray(body.received) ? (body.received as Array<Record<string, unknown>>) : []) {
        receivedMap.set(String(raw.productId), Math.max(0, Math.trunc(Number(raw.receivedQty) || 0)));
      }

      const items = fpo.items.map((item) => ({ ...item, receivedQty: receivedMap.has(item.productId) ? receivedMap.get(item.productId)! : item.qty }));
      let refundTotal = 0;
      for (const item of items) {
        const inboundQty = Math.min(item.qty, item.receivedQty ?? item.qty);
        if (inboundQty > 0) {
          postStationStock({
            stationId: fpo.stationId,
            stationName: fpo.stationName,
            productId: item.productId,
            productName: item.name,
            mode: fpo.mode,
            type: "inbound",
            qty: inboundQty,
            sourceType: "fpo",
            sourceId: fpo.id,
            createdBy: actor,
          });
        }
        const received = item.receivedQty ?? item.qty;
        if (received !== item.qty) {
          const kind = received < item.qty ? "short" : "excess";
          const shortQty = Math.max(0, item.qty - received);
          const refundBRL = fpo.mode === "buyout" && kind === "short" ? round2(shortQty * item.unitPrice) : 0;
          refundTotal = round2(refundTotal + refundBRL);
          const discrepancy: ProcurementDiscrepancy = {
            id: makeServerId("fpd", memory.procurementDiscrepancies.length + 1),
            fpoId: fpo.id,
            franchise: fpo.franchise,
            stationId: fpo.stationId,
            stationName: fpo.stationName,
            productId: item.productId,
            productName: item.name,
            mode: fpo.mode,
            orderedQty: item.qty,
            receivedQty: received,
            kind,
            resolution: refundBRL > 0 ? "refunded" : "pending",
            refundBRL: refundBRL > 0 ? refundBRL : undefined,
            note: String(body.note ?? "").slice(0, 200) || undefined,
            createdAt: nowStamp(),
          };
          memory.procurementDiscrepancies.unshift(discrepancy);
        }
      }
      if (refundTotal > 0) refundBuyout(fpo, refundTotal, "short", actor);

      const updated = updateFpo(index, {
        status: "received",
        items,
        arrivedAt: fpo.arrivedAt ?? nowStamp(),
        receivedAt: nowStamp(),
        receivedBy: isStationActor ? stationScope : actor,
      });
      appendEvent(PROCUREMENT_EVENTS.fpoReceived, { fpoId: fpo.id, stationId: fpo.stationId, mode: fpo.mode, refundBRL: refundTotal }, actor);
      appendServerAudit({ actor, action: "FPO_RECEIVED", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: `${fpo.stationName} 入库${refundTotal > 0 ? ` · 短装退款 R$${refundTotal}` : ""}`, risk: refundTotal > 0 ? "Medium" : "Low" });
      return jsonResponse({ data: updated });
    }

    // ---- Office: 在途异常结单 -------------------------------------------------
    case "closeExceptionFPO": {
      const { index, fpo } = findFpo(body);
      if (!fpo) return err(404, "FPO not found", "fpErrNotFound");
      const reason = String(body.reason ?? "").slice(0, 200);
      if (!reason) return err(400, "Reason required", "fpErrReasonRequired");
      if (fpo.status !== "shipped") return err(409, "Only shipped orders can be exception-closed", "fpErrBadStatus");
      for (const item of fpo.items) {
        memory.procurementDiscrepancies.unshift({
          id: makeServerId("fpd", memory.procurementDiscrepancies.length + 1),
          fpoId: fpo.id,
          franchise: fpo.franchise,
          stationId: fpo.stationId,
          stationName: fpo.stationName,
          productId: item.productId,
          productName: item.name,
          mode: fpo.mode,
          orderedQty: item.qty,
          receivedQty: 0,
          kind: "writeoff",
          resolution: "writeoff",
          note: reason,
          createdAt: nowStamp(),
          resolvedAt: nowStamp(),
          resolvedBy: actor,
        });
      }
      refundBuyout(fpo, fpo.totalBRL, "exception", actor);
      const updated = updateFpo(index, { status: "cancelled", cancelledAt: nowStamp(), cancelReason: `exception: ${reason}` });
      appendEvent(PROCUREMENT_EVENTS.fpoCancelled, { fpoId: fpo.id, by: "office", exception: true, reason }, actor);
      appendServerAudit({ actor, action: "FPO_EXCEPTION_CLOSED", entity: "FranchisePurchaseOrder", entityId: fpo.id, detail: reason, risk: "High" });
      return jsonResponse({ data: updated });
    }

    // ---- Office: 库存调整与调拨 -----------------------------------------------
    case "adjustStationStock": {
      const station = memory.pontos.find((p) => p.id === body.stationId);
      const product = memory.marketplaceProducts.find((p) => p.id === body.productId);
      const qty = Math.trunc(Number(body.qty) || 0);
      const reason = String(body.reason ?? "").slice(0, 200);
      const mode: FpoMode = body.mode === "buyout" ? "buyout" : "consignment";
      if (!station || !product) return err(404, "Station or product not found", "fpErrNotFound");
      if (!reason) return err(400, "Reason required", "fpErrReasonRequired");
      const posted = postStationStock({
        stationId: station.id,
        stationName: station.name,
        productId: product.id,
        productName: product.name,
        mode,
        type: "adjust",
        qty,
        sourceType: "manual",
        sourceId: makeServerId("adj", memory.stationStockLedgerEntries.length + 1),
        note: reason,
        createdBy: actor,
      });
      if (!posted.ok) return err(409, "Adjustment would make stock negative", "fpErrStockShort");
      appendServerAudit({ actor, action: "STATION_STOCK_ADJUSTED", entity: "StationStock", entityId: `${station.id}:${product.id}`, detail: `${mode} ${qty > 0 ? "+" : ""}${qty} · ${reason}`, risk: "Medium" });
      return jsonResponse({ data: posted.entry }, { status: 201 });
    }

    case "transferStock": {
      const from = memory.pontos.find((p) => p.id === body.fromStationId);
      const to = memory.pontos.find((p) => p.id === body.toStationId);
      const product = memory.marketplaceProducts.find((p) => p.id === body.productId);
      const qty = Math.trunc(Number(body.qty) || 0);
      const mode: FpoMode = body.mode === "buyout" ? "buyout" : "consignment";
      if (!from || !to || !product) return err(404, "Station or product not found", "fpErrNotFound");
      if (from.id === to.id || qty <= 0) return err(400, "Invalid transfer", "fpErrQtyRange");
      const token = makeServerId("trf", memory.stationStockLedgerEntries.length + 1);
      const out = postStationStock({ stationId: from.id, stationName: from.name, productId: product.id, productName: product.name, mode, type: "transfer_out", qty: -qty, sourceType: "transfer", sourceId: token, createdBy: actor });
      if (!out.ok) return err(409, "Insufficient stock at origin station", "fpErrStockShort");
      postStationStock({ stationId: to.id, stationName: to.name, productId: product.id, productName: product.name, mode, type: "transfer_in", qty, sourceType: "transfer", sourceId: token, createdBy: actor });
      appendServerAudit({ actor, action: "STATION_STOCK_TRANSFERRED", entity: "StationStock", entityId: token, detail: `${from.name} → ${to.name} · ${product.name} ×${qty} (${mode})`, risk: "Medium" });
      return jsonResponse({ data: { token } }, { status: 201 });
    }

    // ---- Office: 配置 ----------------------------------------------------------
    case "setProcurementConfig": {
      const index = memory.mallConfigs.findIndex((item) => item.id === "mall-config");
      const current = index === -1 ? { ...defaultMallConfig } : memory.mallConfigs[index];
      const next = { ...current, updatedAt: nowStamp(), updatedBy: actor };
      for (const key of PROCUREMENT_CONFIG_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "procurementEnabled" || key === "procurementFrozen" || key === "stationStockEnforcement") {
          next[key] = body[key] === true;
        } else {
          const value = Number(body[key]);
          next[key] = Number.isFinite(value) && value >= 0 ? round2(value) : current[key];
        }
      }
      if (index === -1) memory.mallConfigs.unshift(next);
      else memory.mallConfigs[index] = next;
      appendServerAudit({ actor, action: "PROCUREMENT_CONFIG_UPDATED", entity: "MallConfig", entityId: "mall-config", detail: PROCUREMENT_CONFIG_KEYS.filter((key) => body[key] !== undefined).map((key) => `${key}=${String(body[key])}`).join(", "), risk: "Medium" });
      return jsonResponse({ data: configSnapshot() });
    }

    case "setProductProcurement": {
      const index = memory.marketplaceProducts.findIndex((item) => item.id === body.productId);
      if (index === -1) return err(404, "Product not found", "fpErrNotFound");
      const current = memory.marketplaceProducts[index];
      const modeValue = body.procurementMode;
      const nextMode = modeValue === "off" || modeValue === "consignment" || modeValue === "buyout" || modeValue === "both" ? modeValue : current.procurementMode ?? "off";
      const price = Number(body.franchiseBuyoutPrice);
      const minQty = Math.trunc(Number(body.minOrderQty));
      const maxQty = Math.trunc(Number(body.maxOrderQty));
      memory.marketplaceProducts[index] = {
        ...current,
        procurementMode: nextMode,
        franchiseBuyoutPrice: Number.isFinite(price) && price >= 0 ? round2(price) : current.franchiseBuyoutPrice,
        minOrderQty: Number.isFinite(minQty) && minQty >= 1 ? minQty : current.minOrderQty,
        maxOrderQty: Number.isFinite(maxQty) && maxQty >= 0 ? maxQty : current.maxOrderQty,
      };
      appendServerAudit({ actor, action: "PRODUCT_PROCUREMENT_UPDATED", entity: "MarketplaceProduct", entityId: current.id, detail: `mode=${nextMode}`, risk: "Low" });
      return jsonResponse({ data: memory.marketplaceProducts[index] });
    }

    // ---- 预存充值闭环 -----------------------------------------------------------
    case "requestDepositTopUp": {
      if (config.procurementEnabled !== true) return err(409, "Procurement is not enabled", "fpErrFlagOff");
      const amount = round2(Number(body.amountBRL));
      const pixRef = String(body.pixRef ?? "").trim().slice(0, 80);
      if (!Number.isFinite(amount) || amount <= 0) return err(400, "Invalid amount", "fpErrAmountInvalid");
      if (!pixRef) return err(400, "PIX reference required", "fpErrReasonRequired");
      if (!franchiseName) return err(403, "Franchise scope missing", "fpErrForbidden");
      const topUp: FranchiseDepositTopUp = {
        id: makeServerId("fdt", memory.franchiseDepositTopUps.length + 1),
        franchise: franchiseName,
        amountBRL: amount,
        pixRef,
        status: "submitted",
        createdAt: nowStamp(),
        createdBy: actor,
      };
      memory.franchiseDepositTopUps.unshift(topUp);
      appendServerAudit({ actor, action: "DEPOSIT_TOPUP_REQUESTED", entity: "FranchiseDepositTopUp", entityId: topUp.id, detail: `${franchiseName} R$${amount}`, risk: "Low" });
      return jsonResponse({ data: topUp }, { status: 201 });
    }

    case "confirmDepositTopUp":
    case "rejectDepositTopUp": {
      const index = memory.franchiseDepositTopUps.findIndex((item) => item.id === body.topUpId);
      if (index === -1) return err(404, "Top-up not found", "fpErrNotFound");
      const topUp = memory.franchiseDepositTopUps[index];
      if (topUp.status !== "submitted") return err(409, "Top-up already decided", "fpErrBadStatus");
      if (action === "confirmDepositTopUp") {
        const posted = postFranchiseDeposit({ franchise: topUp.franchise, type: "topup", amountBRL: topUp.amountBRL, sourceType: "topup", sourceId: topUp.id, note: `PIX ${topUp.pixRef}`, createdBy: actor });
        if (!posted.ok) return err(409, "Ledger posting failed", "fpErrBadStatus");
      }
      memory.franchiseDepositTopUps[index] = { ...topUp, status: action === "confirmDepositTopUp" ? "confirmed" : "rejected", decidedAt: nowStamp(), decidedBy: actor, decisionNote: String(body.note ?? "").slice(0, 200) || undefined };
      appendServerAudit({ actor, action: action === "confirmDepositTopUp" ? "DEPOSIT_TOPUP_CONFIRMED" : "DEPOSIT_TOPUP_REJECTED", entity: "FranchiseDepositTopUp", entityId: topUp.id, detail: `${topUp.franchise} R$${topUp.amountBRL}`, risk: "Medium" });
      return jsonResponse({ data: memory.franchiseDepositTopUps[index] });
    }

    case "resolveDiscrepancy": {
      const index = memory.procurementDiscrepancies.findIndex((item) => item.id === body.discrepancyId);
      if (index === -1) return err(404, "Discrepancy not found", "fpErrNotFound");
      const current = memory.procurementDiscrepancies[index];
      if (current.resolution !== "pending") return err(409, "Already resolved", "fpErrBadStatus");
      const resolution = body.resolution === "reship" || body.resolution === "writeoff" || body.resolution === "closed" ? body.resolution : "closed";
      memory.procurementDiscrepancies[index] = { ...current, resolution, note: String(body.note ?? "").slice(0, 200) || current.note, resolvedAt: nowStamp(), resolvedBy: actor };
      appendServerAudit({ actor, action: "DISCREPANCY_RESOLVED", entity: "ProcurementDiscrepancy", entityId: current.id, detail: `${current.productName} ${current.kind} → ${resolution}`, risk: "Low" });
      return jsonResponse({ data: memory.procurementDiscrepancies[index] });
    }

    default:
      return err(400, "unknown action", "fpErrNotFound");
  }
}
