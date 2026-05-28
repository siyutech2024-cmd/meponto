# Marketplace Module Contract

## 1. Module Identity

```txt
Module name: marketplace
Owner: Marketplace / Supply Chain / Product
Status: disabled
Route: /marketplace
Feature flag: marketplace.enabled
Business purpose: Let rider members and eligible offline Partners redeem MePonto points for approved products, coupons, partner services, equipment, supplies, and benefits. Suppliers provide products/stock but do not redeem points.
Authoritative points rules: docs/meponto-points-economy-standard.md
```

## 2. Users And Permissions

```txt
Allowed roles: Rider, Partner manager, Operations, Finance, Super Admin, future Partner fulfillment staff.
Required scopes: marketplace.read, marketplace.redeem, marketplace.manage_products, marketplace.manage_orders, marketplace.fulfill, marketplace.refund.
Sensitive actions: Redemption, refund, inventory reservation, coupon issuance, fulfillment, order cancellation.
Approval flow: High-value redemptions, fraud-held riders, and manual refunds require review.
```

## 3. Data Boundary

```txt
Private data owned by this module: Catalog, marketplace orders, redemption requests, fulfillment status, coupon/voucher issuance state.
Read-only data consumed from other modules: Rider profile, rider points read model, Partner points read model, inventory availability, partner availability, supplier catalog/stock.
Data this module exposes to others: Marketplace order events, redemption status read models, fulfillment status.
```

Rule:

```txt
Marketplace cannot directly modify rider or Partner points balance. It must request points spend/refund through the points economy boundary and follow docs/meponto-points-economy-standard.md. Supplier accounts are excluded from points redemption.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET | Future `/api/marketplace/catalog` | Read available products | `marketplace.read` | Must filter by city, Ponto, rider eligibility, and stock. |
| POST | Future `/api/marketplace/orders` | Create redemption order | `marketplace.redeem` | Must reserve inventory/coupon and debit points in one controlled flow. |
| POST | Future `/api/marketplace/orders/:id/cancel` | Cancel order | `marketplace.refund` | Must refund points when eligible and release inventory. |
| POST | Future `/api/marketplace/orders/:id/fulfill` | Fulfill order | `marketplace.fulfill` | Pickup, delivery, coupon, or partner voucher completion. |

## 5. Events

| Event | Version | Producer | Consumers |
| --- | --- | --- | --- |
| `marketplace.order.created.v1` | v1 | Marketplace | Points, inventory, notification, analytics |
| `marketplace.order.fulfilled.v1` | v1 | Marketplace | Rider app, points, analytics, partner |
| `marketplace.order.cancelled.v1` | v1 | Marketplace | Points, inventory, notification |
| `marketplace.redemption.failed.v1` | v1 | Marketplace | Rider app, support, analytics |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy? Yes.
Ledger tables or records: points_ledger spend/refund through points economy; inventory_ledger reserve/deduct/release through inventory boundary.
Compensation behavior: No direct cash payout; partner vouchers may affect future partner settlement reporting.
Audit requirement: Every redemption, cancellation, refund, and fulfillment must be audited.
```

## 7. Rollout Plan

```txt
Initial status: disabled.
Beta users: Internal operators and selected riders.
Rollback plan: Disable marketplace.enabled or marketplace.redemption.enabled.
Success criteria: Orders reconcile with points ledger, inventory reservation, and rider-visible redemption status.
```
