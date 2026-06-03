# Partner Points Issuance Contract

## 1. Module Identity

```txt
Module name: partner-points
Owner: Partner / CRM / Risk / Points owner
Status: disabled
Route: Future partner app or partner portal surface.
Feature flag: points.partner_service_earn.enabled
Business purpose: Allow approved offline Partner service points to scan rider member QR, grant member cash discounts, and earn fixed Partner points by service type under strict limits and review controls. Suppliers do not participate in points accounts.
Authoritative points rules: docs/meponto-points-economy-standard.md
```

## 2. Users And Permissions

```txt
Allowed roles: Partner staff, Partner manager, Operations, Risk, Finance.
Required scopes: partner.service.create, partner.points.view, partner.service.review, points.review, points.audit.
Sensitive actions: Service confirmation, rider member QR lookup, Partner points credit, receipt/reference capture, rejection, reversal.
Approval flow: Risky or limit-sensitive requests become pending and require Operations/Risk review.
```

## 3. Data Boundary

```txt
Private data owned by this module: Partner service confirmation draft, receipt/reference metadata, member-benefit service status.
Read-only data consumed from other modules: Rider member identity, rider tier, partner status/risk/category, points rule limits, prior partner benefit summary.
Data this module exposes to others: partner.service.confirmed.v1, partner.service.review_pending.v1, partner.service.rejected.v1, partner benefit read model.
```

Rule:

```txt
Partners cannot grant rider points directly and cannot receive rider points as payment. They scan rider member QR, grant configured cash discounts, and earn fixed Partner points for eligible services. Suppliers cannot hold or redeem points.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| POST | Future `/api/partner/services` | Submit eligible member-benefit service | `partner.service.create` | Requires rider QR identity, category, cash amount, receipt/reference, timestamp. |
| POST | Future `/api/partner/services/:id/confirm` | Confirm member-benefit service | `partner.service.create` | Partner app scan context required. |
| POST | Future `/api/partner/services/:id/reject` | Reject invalid service | `partner.service.review` | Must include reason. |
| GET | Future `/api/partner/points-summary` | Read Partner received points and review status | `partner.points.view` | No rider private ledger exposure. |

## 5. Events

| Event | Version | Producer | Consumers |
| --- | --- | --- | --- |
| `partner.service.confirmed.v1` | v1 | Partner Points | Points Economy, CRM, analytics |
| `partner.service.review_pending.v1` | v1 | Partner Points/Risk | Points Economy, risk, operations |
| `partner.service.rejected.v1` | v1 | Partner Points/Risk | Points Economy, CRM, rider app |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy? Yes, through rider discounts and Partner points credit.
Ledger tables or records: partner_points_ledger earn/spend/refund through Points Economy. Rider cash payment happens directly with Partner and is not a points debit.
Compensation behavior: Partner service points are not cash payout. They can be redeemed in marketplace according to standard rules.
Audit requirement: Every submitted service, rider confirmation, approval, rejection, and reversal must be audited.
```

## 7. Rollout Plan

```txt
Initial status: disabled.
Beta users: Selected active partners and selected rider members.
Rollback plan: Disable points.partner_service_earn.enabled.
Success criteria: Partner member-benefit services obey rider tier, service type, category, receipt, location, frequency, and review limits from the points economy standard.
```
