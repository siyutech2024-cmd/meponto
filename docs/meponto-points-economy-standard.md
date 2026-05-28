# MePonto Points Economy Standard

## 1. Purpose

This document is the system-wide source of truth for MePonto points. Every module that earns, displays, spends, refunds, expires, reviews, or analyzes points must follow this standard.

MePonto points are a rider member incentive and loyalty unit. Riders earn points through verified rider activity, MePonto missions, and approved campaigns. Riders can also scan and pay points to approved offline Partner service points. Partners that receive points from rider service payments can redeem those points in the MePonto points mall. Suppliers provide products or stock, but do not receive, hold, or spend points.

Points are not salary, cash balance, debt, employment compensation, or a guaranteed monetary right. They are a controlled platform benefit operated through ledger records, fraud limits, and marketplace redemption rules.

## 1.1 Normative Scope

This standard applies to:

```txt
- Rider app points display and earning opportunities.
- Partner offline service points payment.
- Points review and adjustment back office.
- Marketplace catalog, redemption, refund, and fulfillment.
- Gamification missions and campaigns.
- Finance/audit reporting when points have settlement or partner impact.
- Analytics and read models that expose points balance, pending points, or redemption behavior.
```

Modules may add local UI or rollout rules, but they cannot change the accounting, limits, fraud controls, ledger behavior, or redemption principles without updating this standard.

## 2. Core Principles

```txt
1. Ledger first: points are never changed by directly updating a balance field.
2. One rider, one points account.
3. Every earn, spend, refund, expiry, or adjustment must have a source and audit trail.
4. Partner service payments must be verified by both rider and partner context.
5. Marketplace redemption must reserve inventory and debit points in one controlled flow.
6. Limits exist to prevent abuse, duplicate claims, partner collusion, and artificial service volume.
7. Rider-facing balances come from read models, not private ledger tables.
8. The same rules apply across rider app, partner, marketplace, operations, finance, and analytics.
```

## 3. Points Account

Each rider member has one active points account tied to the unified MePonto/PontoSys identity.

| Field | Rule |
| --- | --- |
| Owner | Rider member identity |
| Currency | MePonto points |
| Balance source | `rider_points_read_model` projected from `points_ledger` |
| Negative balance | Not allowed |
| Transfer between riders | Not allowed in v1 |
| Cash withdrawal | Not allowed |
| Manual adjustment | Admin-only, audited, reason required |
| Expiry | Points expire 12 months after earning unless campaign rules define a shorter expiry |

Expiry notices should be sent 30 days and 7 days before expiration through in-app notification and Android push when available.

## 4. Earning Sources

### 4.1 Rider Activity

| Source | Base Rule | Limit |
| --- | --- | --- |
| Completed eligible delivery/order | 5 points per eligible completion | Max 150 points/day |
| Daily active mission | 30 points when mission target is reached | 1 time/day |
| Weekly reliability mission | 120 points for meeting weekly criteria | 1 time/week |
| Night coverage mission | 40 points for verified night mission | Max 5 times/week |
| Safety/training completion | 80 points per approved module | 1 time/module |
| Incident support cooperation | 20 points after valid support flow completion | No points for fraudulent or unsafe behavior |

Eligibility requires the rider member to be active, not suspended, and operating through an approved Ponto/community flow.

### 4.2 Offline Partner Service Payment

Offline Partners are service points. When a rider member uses an eligible offline service, the rider can scan the Partner QR or use a one-time code to pay points to the Partner.

Eligible examples:

| Partner Category | Examples | Payment Rule |
| --- | --- | --- |
| Fuel | Fuel partner offer | Rider pays 1 point per R$ 1 eligible service value, capped by rules |
| Maintenance | Oil change, tire, brake, battery | Rider pays 1 point per R$ 1 eligible service value, capped by rules |
| Phone/data | Mobile plan or approved top-up | Rider pays 1 point per R$ 1 eligible service value, capped by rules |
| Equipment | Helmet, raincoat, delivery box | Rider pays 1 point per R$ 1 eligible service value, capped by rules |
| Vehicle service | Rental support, inspection, repair | Rider pays 1 point per R$ 1 eligible service value, capped by rules |

Campaigns may give the rider separate platform bonus points for using approved services, but Partners must not directly grant rider points.

Suppliers are brand or supply-chain providers. They can provide products, stock, catalog items, or procurement pricing, but they do not have a points account and cannot receive or redeem points.

## 5. Partner Service Restrictions

Partner service payments must use a controlled confirmation flow.

```txt
Required confirmation:
- Partner must be Active and allowed to accept points.
- Rider must scan partner QR or provide a one-time code.
- Partner must submit service category, amount, timestamp, and receipt/reference.
- System must validate rider, partner, category, amount, and limit rules.
- Rider points are debited and Partner points are credited only after validation. Risky payments start as pending.
```

Hard limits:

| Limit | Rule |
| --- | --- |
| Per partner transaction | Max 300 points |
| Per rider per partner per day | Max 500 points |
| Per rider all partners per day | Max 800 points |
| Per rider per month from partners | Max 6,000 points |
| Same category cooldown | No duplicate same-partner same-category claim within 2 hours |
| Receipt reuse | Blocked |
| Suspended partner | Cannot accept points |
| Suspended rider | Cannot earn or redeem points |
| Refunded service | Points must be reversed |

Risk holds:

| Trigger | Result |
| --- | --- |
| Amount above partner category average by 3x | Pending review |
| More than 3 services from same rider/partner in 24h | Pending review |
| Partner risk status is Review | Pending review |
| Missing receipt/reference | Rejected or pending, based on category rule |
| Rider and partner device/location mismatch | Pending review |

## 6. Marketplace Redemption

Points can be redeemed in the MePonto points mall for approved products, supplies, services, or coupons.

Allowed product types:

```txt
- Rider equipment
- Maintenance coupons
- Fuel coupons
- Phone/data benefits
- Safety items
- Training or community benefits
- Partner service vouchers
```

Not allowed in v1:

```txt
- Cash withdrawal
- PIX conversion
- Transfer to another rider
- Gambling, alcohol, or restricted goods
- Products outside approved marketplace catalog
```

Redemption flow:

```txt
1. Rider opens marketplace catalog.
2. Marketplace reads rider points balance through read model.
3. Rider chooses item.
4. System checks points balance, eligibility, inventory, city/Ponto availability, and fraud limits.
5. Transaction creates marketplace order, points_ledger spend, inventory reserve if needed, audit log, and event outbox record.
6. Fulfillment confirms pickup, delivery, coupon issue, or partner voucher use.
7. If canceled before fulfillment, points are refunded and inventory is released.
```

## 7. Redemption Limits

| Limit | Rule |
| --- | --- |
| Daily redemption count | Max 3 orders/day |
| Daily redemption points | Max 5,000 points/day |
| Monthly redemption points | Max 20,000 points/month |
| High-value item | Items above 8,000 points require extra verification |
| New rider account | First 7 days can redeem max 2,000 points total |
| Fraud hold | Redemption disabled while account is under fraud review |

The marketplace can define product-specific rules such as city availability, Ponto pickup only, required rider tier, or one-per-month limits.

## 8. Points Ledger

All points activity must write to `points_ledger`.

```txt
points_ledger
- id
- rider_id
- account_id
- type: earn / spend / refund / expire / reverse / adjust / hold / release
- points
- status: pending / approved / rejected / reversed
- source_type: delivery / mission / partner_service / marketplace_order / admin_adjustment / expiry
- source_id
- partner_id
- marketplace_order_id
- campaign_id
- expires_at
- balance_after
- reason_code
- created_by
- created_at
- approved_by
- approved_at
```

Balance rules:

```txt
- Approved earn/refund/release increases available balance.
- Approved spend/expire/reverse decreases available balance.
- Pending earn appears separately as pending points.
- Pending points cannot be redeemed.
- Rejected points do not affect available balance.
- balance_after must be calculated inside the same transaction as the ledger write.
```

## 9. Events

All events must be versioned.

| Event | Producer | Consumers |
| --- | --- | --- |
| `points.earned.v1` | Points | Rider app, analytics, gamification |
| `points.pending_created.v1` | Points | Rider app, risk, partner |
| `points.reversed.v1` | Points | Rider app, partner, audit |
| `points.expired.v1` | Points | Rider app, analytics |
| `marketplace.order.created.v1` | Marketplace | Points, inventory, notification |
| `marketplace.order.fulfilled.v1` | Marketplace | Rider app, analytics, partner |
| `marketplace.order.cancelled.v1` | Marketplace | Points, inventory, notification |
| `partner.service.confirmed.v1` | Partner | Points, CRM, analytics |
| `partner.service.rejected.v1` | Partner/Risk | Points, CRM, rider app |

## 10. Permissions And Scopes

| Actor | Scope |
| --- | --- |
| Rider | `member.points.read`, `marketplace.redeem` |
| Partner staff | `partner.service.create`, `partner.points.accept_payment` |
| Partner manager | `partner.points.view`, `partner.service.review` |
| Operations | `points.review`, `points.adjust_limited` |
| Finance | `points.audit`, `marketplace.settlement.view` |
| Super Admin | `points.adjust`, `marketplace.manage_catalog` |

Manual points adjustments require reason code, before/after balance, approver identity, and audit record.

## 11. Fraud And Abuse Controls

Fraud signals:

```txt
- Same receipt/reference used more than once.
- Unusual partner/rider frequency.
- Service amount outside category norms.
- Rider and partner location mismatch.
- Partner issuing points mainly to a small repeated rider group.
- High earn followed by immediate high-value redemption.
- Many rejected services from the same partner.
```

Controls:

```txt
- Pending status for risky earns.
- Automatic reversal for refunded partner services.
- Temporary redemption hold during review.
- Partner issuing limit by category and month.
- Rider monthly partner earning cap.
- Admin review queue for risk holds.
- Audit export for finance and operations.
```

## 12. Rider App Display Rules

The rider app should show:

```txt
- Available points
- Pending points
- Points expiring soon
- Latest points activity
- Missions and earning opportunities
- Marketplace redemption entry
- Partner service points status
```

The rider app must not expose internal fraud scores, partner private notes, or ledger internals.

## 13. Example Scenarios

### Partner Maintenance Service

```txt
Rider changes tire at an active Partner.
Service amount: R$ 120.
Payment: rider pays 120 points.
Limits: under 300 transaction cap and under daily cap.
Result: rider points_ledger spend approved, partner_points_ledger earn approved, partner.service.paid.v1 emitted.
```

### Risky Partner Service

```txt
Rider attempts to pay R$ 900 repair service in points.
Payment would be 900 points, but transaction cap is 300.
Amount is above category average.
Result: 300 points pending, review required, partner.service.payment_pending.v1 emitted.
```

### Marketplace Redemption

```txt
Rider has 2,840 available points.
Rider redeems helmet coupon for 1,600 points.
System creates marketplace_order, points_ledger spend, inventory/coupon reserve, audit log, and marketplace.order.created.v1.
Available balance becomes 1,240 points.
```

## 14. Rollout

```txt
Phase 1: Rider app shows available/pending points, static rules, and marketplace entry.
Phase 2: Partner service QR/OTP payment, pending holds, Partner points balance, and review queue.
Phase 3: Marketplace catalog, rider/Partner redemption, inventory reserve, points spend, refund, and fulfillment.
Phase 4: Campaign multipliers, tier benefits, partner settlement analytics, and gamification.
```

Feature flags:

```txt
points.enabled
points.partner_service_earn.enabled
marketplace.enabled
marketplace.redemption.enabled
points.expiry.enabled
points.risk_review.enabled
```
