# Slot Enrollment Module Contract

## 1. Module Identity

```txt
Module name: slot-enrollment
Owner: Rider operations / Ponto operations / Franchise operations
Status: beta
Route: /slot-enrollment
Feature flag: slot_enrollment_beta
Business purpose: Let riders apply for weekly slots, let Pontos review local capacity, let franchises confirm operating commitments, and let headquarters read aggregated slot planning data.
```

## 2. Users And Permissions

```txt
Allowed roles: Rider, Leader, Ponto Manager, Regional Manager, Franchise operator, Super Admin.
Denied roles: Anonymous users, Suppliers, Partners without slot scope.
Required scopes: slot.apply, slot.ponto_review, slot.franchise_confirm, slot.summary.read, slot.audit.read.
Sensitive actions: Rider application, Ponto approval/rejection, franchise confirmation, over-capacity approval, cancellation after confirmation.
Approval flow: Rider submits. Ponto Manager/Leader reviews. Franchise confirms. Headquarters reads weekly summary and exceptions.
```

## 3. Data Boundary

```txt
Private data owned by this module: slot definitions, slot capacity, slot enrollment records, approval states, audit metadata, weekly slot summary projection.
Read-only data consumed from other modules: Rider identity, OL tier status, Ponto identity, franchise identity, leader assignment, performance/risk indicators.
Data this module exposes to others: slot_weekly_summary_read_model, rider_slot_schedule_read_model, slot approval events, capacity and fill-rate projections.
Retention policy: Slot applications and approval audit records should be retained for operational dispute review and source-platform reconciliation.
LGPD sensitivity: Medium/high because slot choices reveal rider working patterns and location/time commitments.
```

Rule:

```txt
This module cannot directly change rider private profile, franchise settlement, points balance, or 99 imported performance rows. It publishes slot events and read models for other modules to consume.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/slots` | Read weekly slots, enrollments, workflow, and HQ summary | `slot.summary.read` or scoped operator permission | Demo API currently returns beta mock data. |
| POST | `/api/slots` | Submit rider slot application | `slot.apply` | Demo API validates tier 2+ and capacity. |
| POST | Future `/api/slots/:slotId/review` | Ponto approves or rejects enrollment | `slot.ponto_review` | Must write audit and event. |
| POST | Future `/api/slots/:slotId/confirm` | Franchise confirms approved enrollment | `slot.franchise_confirm` | Must be idempotent and capacity-safe. |
| GET | Future `/api/slots/summary` | Headquarters aggregate read model | `slot.summary.read` | No private cross-module writes. |

## 5. Events

Outbound events:

| Event | Version | Producer | Consumers | Payload Owner |
| --- | --- | --- | --- |
| `slot.enrollment.submitted.v1` | v1 | Slot Enrollment | Ponto operations, audit, notifications | Slot Enrollment |
| `slot.enrollment.ponto_approved.v1` | v1 | Slot Enrollment | Franchise operations, rider app, audit | Slot Enrollment |
| `slot.enrollment.rejected.v1` | v1 | Slot Enrollment | Rider app, audit | Slot Enrollment |
| `slot.enrollment.franchise_confirmed.v1` | v1 | Slot Enrollment | Headquarters, rider app, analytics | Slot Enrollment |
| `slot.summary.generated.v1` | v1 | Slot Enrollment | Master admin dashboard, franchise dashboard | Slot Enrollment |

Inbound events:

| Event | Version | Expected Action |
| --- | --- | --- |
| `rider.ol_joined.v1` | v1 | Allow rider to apply for production slots after tier-2 activation. |
| `rider.suspended.v1` | v1 | Block new applications and flag existing applications for review. |
| `source_99.import.confirmed.v1` | v1 | Reconcile scheduled slots with actual previous-day TSH and performance. |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy? Indirectly.
Ledger tables or records: None in v1. Slot completion can later feed performance/points candidate rules through Points Economy, but this module must not write points ledger directly.
Compensation behavior: Slot confirmation is an operational commitment, not salary or guaranteed payment.
Audit requirement: Submit, approve, reject, confirm, cancel, overbook, and capacity changes require audit records.
```

## 7. Rule Engine Impact

```txt
Configurable rules: Slot capacity, eligible rider tier, cutoff time, same-day change limit, overbook rule, priority slot marking, cancellation rules, review SLA.
Rule owner: Operations / Franchise / Risk.
Effective time: Rules should be versioned by week and Ponto/franchise rollout scope.
City/site/franchise differences: Allowed through scoped rule variants, while audit and event behavior remains global.
```

## 8. Read Models And Analytics

```txt
Dashboards: Weekly fill rate, Ponto review queue, franchise confirmation queue, priority slot coverage, HQ aggregate summary.
Read models: slot_weekly_summary_read_model, rider_slot_schedule_read_model, ponto_slot_review_queue, franchise_slot_confirmation_queue.
Projection refresh: Immediate for rider app and operations dashboard after application/review/confirmation.
KPIs: Fill rate, priority slot coverage, Ponto approval time, franchise confirmation time, cancellation rate, no-show rate, slot-to-99-TSH reconciliation.
```

## 9. Localization

```txt
Chinese copy complete: Current beta operator page includes Chinese copy object and Chinese weekday/status labels.
English copy complete: Current beta operator page includes English copy object.
Portuguese copy complete: Current beta operator page and rider app card include Portuguese-facing labels.
User-facing API errors localized: Required before production APIs.
Empty/loading/error states localized: Required before production APIs.
Brand terms checked: MePonto / PontoSys.
Single-language exception approved: Source demo weekday labels use Chinese to match provided scheduling reference image.
```

## 10. Rollout Plan

```txt
Initial status: beta.
Beta users: Internal operations, one Ponto, one franchise, selected tier-2+ riders.
Rollback plan: Disable slot_enrollment_beta and keep exported summary/read-model audit for manual planning.
Monitoring: Capacity overflow, duplicate rider applications, pending review age, confirmation delay, no-show reconciliation.
Success criteria: Riders can apply, Pontos can review, franchises can confirm, and headquarters can see weekly aggregate data without duplicate or over-capacity enrollment.
```
