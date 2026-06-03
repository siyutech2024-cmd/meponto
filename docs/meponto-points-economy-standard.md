# MePonto Points Economy Standard

## 1. Purpose

This document is the system-wide source of truth for MePonto points. Every module that earns, displays, spends, refunds, expires, reviews, or analyzes points must follow this standard.

MePonto points are a rider and Partner incentive unit. Riders earn points through verified rider activity, MePonto missions, approved campaigns, and controlled referral programs. Partners earn fixed points when they deliver verified member-benefit services. Riders do not pay Partners with points: riders pay Partners directly in cash/PIX/card and receive MePonto member discounts. Partners can redeem earned points in PontoMall. Suppliers provide products or stock, but do not receive, hold, or spend points.

Points are not salary, cash balance, debt, employment compensation, or a guaranteed monetary right. They are a controlled platform benefit operated through ledger records, fraud limits, and PontoMall redemption rules.

## 1.1 Normative Scope

This standard applies to:

```txt
- Rider app points display and earning opportunities.
- Partner offline member-benefit service validation.
- Points review and adjustment back office.
- PontoMall catalog, redemption, refund, and fulfillment.
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
4. Partner services are member-benefit validations, not point payments.
5. PontoMall redemption must reserve inventory and debit points in one controlled flow.
6. Limits exist to prevent abuse, duplicate claims, partner collusion, and artificial service volume.
7. Rider-facing balances come from read models, not private ledger tables.
8. The same rules apply across PontoSys rider, partner, PontoMall, operations, finance, and analytics.
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

## 3.1 Rule Set Versioning

All points rules must belong to a versioned rule set.

| Rule | Requirement |
| --- | --- |
| Active version | Exactly one active rule set per rollout scope |
| Effective dates | Every rule set must define `effective_from`; scheduled rule sets can define future activation |
| Historical ledger | Existing ledger records must not be recalculated after rule changes |
| Approval | High-impact changes require Super Admin plus Finance/Risk approval |
| Audit | Every rule change must capture old value, new value, reason, approver, and timestamp |
| Rollback | Rollback creates a new rule set version; it must not mutate historical rule rows |

The active beta rule set is `points-rules-v1-beta`. Future rule edits must be reviewed as a rule diff before activation.

## 4. Earning Sources

### 4.1 Rider Activity

| Source | Base Rule | Limit |
| --- | --- | --- |
| Completed eligible delivery/order | Configurable v1 default: 2 points per reconciled completion | Max 80 points/day |
| TSH online service hours | Configurable v1 default: 8 points per eligible online hour after 4h minimum | Max 80 points/day |
| AR acceptance rate | Configurable v1 default: 12 points when AR is 95% or higher | Max 60 points/day |
| CAA eligible orders | Configurable v1 default: 6 points per reconciled CAA order | Max 90 points/day |
| Rider registration welcome | Configurable v1 default: 20 points after member registration | One time only, starts pending |
| Daily active mission | 30 points when mission target is reached | 1 time/day |
| Weekly reliability mission | 120 points for meeting weekly criteria | 1 time/week |
| Night coverage mission | 40 points for verified night mission | Max 5 times/week |
| Safety/training completion | 80 points per approved module | 1 time/module |
| Incident support cooperation | 20 points after valid support flow completion | No points for fraudulent or unsafe behavior |

Eligibility requires the rider member to be active, not suspended, and operating through an approved Ponto/community flow.

Rider performance point rules must be configurable in the Points Economy rule set, not hard-coded in a page. Each rule must define points per unit, daily cap, minimum eligible value, pending days, score weight, effective dates, and audit metadata.

99 source-platform imports must follow the daily import standard:

| Rule | Requirement |
| --- | --- |
| Business date | Use the date inside the 99 export rows, not the upload timestamp |
| Import cadence | Daily upload contains the previous business day's data |
| Required files | Performance, earnings, and account statement exports |
| Rider matching | 99 rider ID first, CPF second, phone third |
| OL gate | Registered riders start at tier 1; only riders who joined OL become tier 2 and produce 99 performance records |
| Idempotency | Re-importing the same business date must replace the draft read model and must not duplicate points |
| Ledger posting | Import creates candidate points/read models first; points ledger posting requires approval or pending-release rules |

Performance score v1 weights:

| Metric | Default weight | Guardrail |
| --- | --- | --- |
| Completed orders | 28% | Only completed and reconciled orders count |
| TSH | 24% | Must match platform online logs and Ponto shift windows |
| AR | 28% | Bonus starts at 95%; traceable safety refusals should not penalize |
| CAA orders | 20% | Requires source-platform reconciliation and duplicate protection |

### 4.2 Offline Partner Member Benefit

Offline Partners are service points. When a rider member uses an eligible offline service, the Partner app scans the rider's unique MePonto member QR. The rider pays the Partner directly in cash/PIX/card and receives the MePonto member discount if eligible. The Partner earns a fixed number of points for the verified service type.

Eligible examples:

| Partner Category | Examples | Rider Benefit | Partner Earn Rule |
| --- | --- | --- | --- |
| Fuel | Fuel partner offer | R$ 5 discount or configured % discount | 30 fixed points |
| Maintenance | Oil change, tire, brake, battery | R$ 20 discount | 100 fixed points |
| Phone/data | Mobile plan or approved top-up | R$ 5 discount | 30 fixed points |
| Equipment | Helmet, raincoat, delivery box | R$ 20 discount or configured % discount | 80 fixed points |
| Vehicle service | Rental support, inspection, repair | R$ 30 discount | 120 fixed points |

Campaigns may give the rider separate platform bonus points for using approved services, but Partners must not directly grant rider points.

`1 BRL = 10 points` is a reference value for marketplace positioning and benefit design. It is not a cash-conversion promise and it is not used to calculate Partner service earnings automatically.

### 4.3 Referral Earning

Registration welcome points and referral points must be configured in the Points Economy acquisition rule set. Registration welcome points are intentionally low-value and pending; referral points are allowed only after real activation:

| Referrer | Invited party | Trigger | Suggested v1 reward |
| --- | --- | --- | --- |
| Platform | Rider registration | Rider completes member registration and passes duplicate identity/device checks | 20 points |
| Rider | Rider | Invited rider completes first valid activity period | 200 points |
| Rider | Partner | Invited Partner is approved and completes first real service batch | 500 points |
| Partner | Partner | Invited Partner is approved and completes first real service batch | 500-1000 points |

Registration welcome points must be one-time per CPF, phone, device, PIX/account, and member identity. Registration alone must not release referral points. New-account and referral points start as pending for at least 7 days.

Suppliers are brand or supply-chain providers. They can provide products, stock, catalog items, or procurement pricing, but they do not have a points account and cannot receive or redeem points.

## 4.4 Pending Release And Review

Pending points must use release rules by source type:

| Flow | Default pending | Release | Review trigger |
| --- | --- | --- | --- |
| Registration welcome | 7 days | Auto if no duplicate identity/device risk | Duplicate CPF, phone, device, PIX/account, or suspicious registration cluster |
| Performance earning | 1 day | Auto after platform reconciliation | Source mismatch, cancelled order, abnormal TSH, low-integrity AR, or duplicate CAA |
| Partner service benefit | 3 days | Auto if no partner/rider risk flag | Duplicate receipt, repeated pattern, location mismatch, inactive/high-risk partner |
| Referral activation | 14 days | Manual or controlled auto-release after activation proof | Registration-only invite, same identity cluster, missing real activity |
| Manual adjustment | 0 days | Manual approval only | Missing reason, approver, or linked operational evidence |

Pending points cannot be redeemed. If a pending earn is rejected, it must remain visible in audit/review history and must not affect available balance.

## 5. Partner Service Restrictions

Partner member-benefit services must use a controlled confirmation flow.

```txt
Required confirmation:
- Partner must be Active and allowed to register member-benefit services.
- Partner app must scan the rider's unique member QR.
- Rider must be tier 2 or higher to receive Partner discounts.
- Partner must submit service category, cash amount, timestamp, and receipt/reference.
- System must validate rider, partner, category, amount, and limit rules.
- Rider pays Partner directly outside MePonto points.
- Partner points are fixed by service type and start pending before release.
```

Hard limits:

| Limit | Rule |
| --- | --- |
| Minimum tier for discount | Tier 2 or higher |
| Rider same service type | Max 1 per day unless service rule defines a longer cooldown |
| Fuel/phone service cooldown | 1 day |
| Maintenance cooldown | 7 days |
| Vehicle/equipment cooldown | 30 days |
| Partner same service type | Per-category daily cap |
| Receipt reuse | Blocked |
| Suspended partner | Cannot register benefit services |
| Suspended rider | Cannot earn or redeem points |
| Refunded/invalid service | Partner points must be rejected or reversed |

Risk holds:

| Trigger | Result |
| --- | --- |
| Repeated rider/Partner pattern | Pending review |
| Partner service volume above category norm | Pending review |
| Partner risk status is Review | Pending review |
| Missing receipt/reference | Rejected or pending, based on category rule |
| Rider and partner device/location mismatch | Pending review |

## 6. PontoMall Redemption

Points can be redeemed in PontoMall for approved products, supplies, services, or coupons.

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
- Products outside approved PontoMall catalog
```

Redemption flow:

```txt
1. Rider opens PontoMall catalog.
2. PontoMall reads rider points balance through read model.
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
| Same product monthly limit | Max 1 redemption of the same product per account per month unless campaign rules override |
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
| Partner staff | `partner.service.create`, `partner.points.view` |
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
Rider pays Partner directly after MePonto member discount.
Partner app scans rider member QR and selects maintenance.
Result: partner_points_ledger earn pending for 100 points, partner.service.confirmed.v1 emitted.
```

### Risky Partner Service

```txt
Partner attempts to register repeated high-value repair services for the same rider.
Service is above normal frequency.
Result: Partner points remain pending, review required, partner.service.review_pending.v1 emitted.
```

### PontoMall Redemption

```txt
Rider has 2,840 available points.
Rider redeems helmet coupon for 1,600 points.
System creates marketplace_order, points_ledger spend, inventory/coupon reserve, audit log, and marketplace.order.created.v1.
Available balance becomes 1,240 points.
```

## 14. Rollout

```txt
Phase 1: Rider app shows available/pending points, static rules, and PontoMall entry.
Phase 2: Partner app scans rider member QR, registers benefit service, Partner points balance, and review queue.
Phase 3: PontoMall catalog, rider/Partner redemption, inventory reserve, points spend, refund, and fulfillment.
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
