import type { MarketplaceOrder } from "../../points";
import { selectRows, upsertRows } from "./core";

/**
 * M2 / Wave 1 repository: marketplace_orders. Core columns are typed; the
 * long tail of optional legacy fields rides in the `extra` jsonb column so
 * schema changes stay rare (phase2 draft §2).
 */
const CORE_KEYS = new Set([
  "id", "accountType", "riderId", "partnerId", "productId", "productName",
  "riderName", "pointsSpent", "cashDue", "status", "paymentStatus",
  "reviewStatus", "couponId", "couponDiscount", "pickupStoreId", "station",
  "franchise", "voucherCode", "createdAt", "arrivedAt", "pickedUpAt",
]);

type OrderRow = {
  id: string; account_type: string; rider_id: string | null; partner_id: string | null;
  product_id: string; product_name: string; rider_name: string; points_spent: number;
  cash_due: number | null; status: string; payment_status: string | null;
  review_status: string | null; coupon_id: string | null; coupon_discount: number | null;
  pickup_store_id: string | null; station: string; franchise: string;
  voucher_code: string | null; idempotency_key: string | null; created_at: string;
  arrived_at: string | null; picked_up_at: string | null; extra: Record<string, unknown>;
};

export function orderToRow(o: MarketplaceOrder): Omit<OrderRow, "idempotency_key"> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(o as unknown as Record<string, unknown>)) {
    if (!CORE_KEYS.has(key) && value !== undefined) extra[key] = value;
  }
  return {
    id: o.id, account_type: o.accountType ?? "rider", rider_id: o.riderId ?? null,
    partner_id: o.partnerId ?? null, product_id: o.productId,
    product_name: o.productName ?? "", rider_name: o.riderName ?? "",
    points_spent: Math.max(0, o.pointsSpent ?? 0), cash_due: o.cashDue ?? null,
    status: o.status, payment_status: o.paymentStatus ?? null,
    review_status: o.reviewStatus ?? null, coupon_id: o.couponId ?? null,
    coupon_discount: o.couponDiscount ?? null, pickup_store_id: o.pickupStoreId ?? null,
    station: o.station ?? "", franchise: o.franchise ?? "",
    voucher_code: o.voucherCode ?? null, created_at: o.createdAt ?? "",
    arrived_at: o.arrivedAt ?? null, picked_up_at: o.pickedUpAt ?? null, extra,
  };
}

export function rowToOrder(r: OrderRow): MarketplaceOrder {
  return {
    ...(r.extra as Partial<MarketplaceOrder>),
    id: r.id, accountType: r.account_type as MarketplaceOrder["accountType"],
    riderId: r.rider_id ?? undefined, partnerId: r.partner_id ?? undefined,
    productId: r.product_id, productName: r.product_name || undefined,
    riderName: r.rider_name || undefined, pointsSpent: Number(r.points_spent),
    cashDue: r.cash_due === null ? undefined : Number(r.cash_due),
    status: r.status as MarketplaceOrder["status"],
    paymentStatus: (r.payment_status ?? undefined) as MarketplaceOrder["paymentStatus"],
    reviewStatus: (r.review_status ?? undefined) as MarketplaceOrder["reviewStatus"],
    couponId: r.coupon_id ?? undefined,
    couponDiscount: r.coupon_discount === null ? undefined : Number(r.coupon_discount),
    pickupStoreId: r.pickup_store_id ?? undefined, station: r.station || undefined,
    franchise: r.franchise || undefined, voucherCode: r.voucher_code ?? undefined,
    createdAt: r.created_at, arrivedAt: r.arrived_at ?? undefined,
    pickedUpAt: r.picked_up_at ?? undefined,
  };
}

/** Dual-write target: mirror new/changed legacy orders (upsert by id). */
export async function upsertOrders(orders: MarketplaceOrder[]): Promise<void> {
  await upsertRows("marketplace_orders", orders.map(orderToRow), "id");
}

export async function ordersByRider(riderId: string): Promise<MarketplaceOrder[]> {
  const rows = await selectRows<OrderRow>("marketplace_orders", {
    where: { rider_id: riderId },
    orderBy: { column: "created_at", ascending: false },
  });
  return rows.map(rowToOrder);
}
