# Points Economy Module Contract

## 1. Module Identity

```txt
Module name: points-economy
Owner: Product / Finance / Risk / PontoMall owner
Status: disabled
Route: No direct public route in v1; exposed through rider app, partner, marketplace, and admin surfaces.
Feature flag: points.enabled
Business purpose: Provide the unified rules, ledger behavior, read models, events, limits, expiry, review, and audit model for MePonto points across the entire ecosystem.
Authoritative standard: docs/meponto-points-economy-standard.md
```

## 2. Users And Permissions

```txt
Allowed roles: Rider, Partner staff, Partner manager, Operations, Finance, Super Admin.
Denied roles: Anonymous users and any role without scoped points permission.
Required scopes: member.points.read, partner.service.create, partner.points.view, points.review, points.audit, points.adjust.
Sensitive actions: Points reveal, Partner member-benefit credit, approval/rejection, reversal, expiry, manual adjustment, redemption hold.
Approval flow: Manual adjustment requires reason, approver, before/after balance, and audit record. Partner risky earns require review before approval.
```

## 3. Data Boundary

```txt
Private data owned by this module: points_ledger, points account state, pending points state, expiry schedule, risk/review state, points audit metadata.
Read-only data consumed from other modules: Rider profile, partner status/risk/category, marketplace order status, inventory reservation status, mission completion, incident/training completion signals.
Data this module exposes to others: rider_points_read_model, partner_points_read_model, pending points projection, expiry projection, points events.
Retention policy: Ledger and audit records are permanent business records unless legal retention rules define otherwise.
LGPD sensitivity: Medium/high because points activity can reveal rider behavior, location-linked partner services, and benefit usage.
```

Rule:

```txt
No module may directly update a rider or Partner points balance. All changes must create ledger records through the points economy service boundary. Suppliers do not have points accounts.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET | Future `/api/points/accounts/:riderId` | Read points balance projection | `member.points.read` or operator equivalent | Read model only. |
| POST | Future `/api/points/earn-requests` | Create rider earn request from mission, activity, referral, campaign, or admin adjustment | Scoped producer permission | Partner service benefits can create Partner fixed-point earns, not rider payment debits. |
| POST | Future `/api/points/redemptions` | Debit points for marketplace order | `marketplace.redeem` | Must run with marketplace order transaction. |
| POST | Future `/api/points/refunds` | Refund points for cancelled redemption | `marketplace.refund` | Must link to original spend ledger. |
| POST | Future `/api/points/reviews/:id/approve` | Approve pending points | `points.review` | Requires audit reason. |
| POST | Future `/api/points/adjustments` | Manual adjustment | `points.adjust` | Super Admin or approved finance/risk role only. |

## 5. Events

Outbound events:

| Event | Version | Producer | Consumers | Payload Owner |
| --- | --- | --- | --- | --- |
| `points.earned.v1` | v1 | Points Economy | Rider app, marketplace, analytics, gamification | Points Economy |
| `points.pending_created.v1` | v1 | Points Economy | Rider app, risk, partner | Points Economy |
| `points.spent.v1` | v1 | Points Economy | PontoMall, rider app, analytics | Points Economy |
| `points.refunded.v1` | v1 | Points Economy | PontoMall, rider app, analytics | Points Economy |
| `points.reversed.v1` | v1 | Points Economy | Rider app, partner, audit | Points Economy |
| `points.expired.v1` | v1 | Points Economy | Rider app, analytics | Points Economy |

Inbound events:

| Event | Version | Expected Action |
| --- | --- | --- |
| `partner.service.confirmed.v1` | v1 | Create fixed Partner points earn after verified member-benefit service. |
| `partner.service.review_pending.v1` | v1 | Hold Partner service points for review. |
| `partner.service.rejected.v1` | v1 | Reject or reverse pending partner points. |
| `marketplace.order.created.v1` | v1 | Debit points when redemption is accepted. |
| `marketplace.order.cancelled.v1` | v1 | Refund points when eligible. |
| `mission.completed.v1` | v1 | Create mission earn request when eligible. |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy? Yes. It owns the points ledger behavior.
Ledger tables or records: points_ledger, rider_points_read_model, pending points projection, expiry schedule, audit logs.
Compensation behavior: Points are not salary/cash. Riders pay Partners directly for discounted services; Partner fixed-point rewards and marketplace redemptions can affect commercial reporting.
Audit requirement: Every earn, spend, refund, reverse, expire, hold, release, and adjustment requires source and audit metadata.
```

## 7. Rule Engine Impact

```txt
Configurable rules: Rule set versions, earn amounts, registration welcome points, completed order points, TSH points, AR threshold/bonus, CAA order points, Partner service fixed points, pending release rules, rider tier eligibility, service-type limits, referral activation rules, marketplace redemption limits, campaign multipliers, expiry, review thresholds.
Rule owner: Product / Finance / Risk.
Effective time: Rules must be versioned with effective_from and effective_to. Historical ledger rows must keep the rule version used at creation and must not be recalculated after rule changes.
City/site/franchise differences: Allowed only as scoped rule variants; base ledger and fraud behavior stays global.
```

## 8. Read Models And Analytics

```txt
Dashboards: Points health, rule set versions, acquisition rule config, rider performance rule config, pending release config, redemption limit config, Partner received points, pending review, redemption behavior, expiry liability, abuse signals.
Read models: rider_points_read_model, rider_acquisition_points_read_model, rider_performance_points_read_model, partner_points_read_model, pending_points_read_model, expiring_points_read_model, rule_set_read_model, redemption_limit_read_model, partner_benefit_service_summary, marketplace_redemption_summary.
Projection refresh: Near-real-time for rider app and marketplace; batch analytics can lag.
KPIs: Rider earn rate, registration welcome conversion, referral activation rate, order/TSH/AR/CAA contribution mix, Partner benefit usage, Partner redemption rate, pending approval time, auto-release rate, reversal rate, fraud hold rate, expiry rate, rule-change frequency, Partner benefit concentration.
```

## 9. Localization

```txt
Chinese copy complete: Standard and product rules reviewed in Chinese.
English copy complete: Contract and standard are English source of truth.
Portuguese copy complete: Rider-facing and partner-facing UI copy required before production.
```

## 10. Rollout Plan

```txt
Initial status: disabled.
Beta users: Internal operations, selected riders, selected partners.
Rollback plan: Disable points.enabled or sub-flags for partner earn, marketplace redemption, expiry, or review.
Monitoring: Ledger balance integrity, duplicate source detection, review queue, redemption failures, event outbox health.
Success criteria: All point balances reconcile from ledger, Partner benefit services are limited/reviewable, suppliers are excluded from points accounts, and marketplace redemption can spend/refund rider and Partner points safely.
```
