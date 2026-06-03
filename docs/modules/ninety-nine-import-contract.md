# 99 Daily Import Module Contract

## 1. Module Identity

```txt
Module name: ninety-nine-import
Owner: Operations / Rider lifecycle / Points economy owner
Status: beta
Route: /ninety-nine-import
Feature flag: ninety_nine_daily_import_beta
Business purpose: Import previous-day 99 source-platform files into PontoSys daily performance read models, wallet read models, and controlled points candidates.
```

## 2. Users And Permissions

```txt
Allowed roles: Super Admin, Regional Manager, Operations, Finance, Risk.
Denied roles: Riders, Partners, Suppliers, anonymous users.
Required scopes: import.99.upload, import.99.preview, import.99.approve, points.review for point posting.
Sensitive actions: Upload source files, approve import batch, replace same-day read model, create point candidates, approve ledger posting.
Approval flow: Batch preview can be prepared by Operations. Ledger posting requires Super Admin or scoped Finance/Risk approval when exceptions exist.
```

## 3. Data Boundary

```txt
Private data owned by this module: 99 import batch metadata, source file manifests, row-level import audit, rider matching preview, daily 99 performance read model.
Read-only data consumed from other modules: Rider identity, OL membership status, points rule set, points pending-release rules.
Data this module exposes to others: rider_99_daily_performance_read_model, rider_99_wallet_read_model, import exception report, point candidate feed.
Retention policy: Raw import row audit should be retained for reconciliation and dispute handling. Production retention must follow LGPD and finance policy.
LGPD sensitivity: High because CPF, phone, income, performance, and platform activity are imported.
```

Rule:

```txt
This module cannot directly change points balance, rider private profile ownership, or finance settlement. It can only create controlled read models and candidate records for downstream services.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/ninety-nine-import` | Read source definitions, rules, batch preview, and sample rows | `import.99.preview` | Demo API currently returns static beta data. |
| POST | Future `/api/ninety-nine-import/batches` | Upload and validate three source files | `import.99.upload` | Must create source file IDs and row audit. |
| POST | Future `/api/ninety-nine-import/batches/:id/confirm` | Confirm preview and publish daily read model | `import.99.approve` | Must be idempotent by business date. |
| POST | Future `/api/ninety-nine-import/batches/:id/post-points` | Send point candidates to Points Economy | `points.review` | Must not bypass points ledger service. |

## 5. Events

Outbound events:

| Event | Version | Producer | Consumers | Payload Owner |
| --- | --- | --- | --- |
| `source_99.import.previewed.v1` | v1 | 99 Daily Import | Operations, audit, analytics | 99 Daily Import |
| `source_99.import.confirmed.v1` | v1 | 99 Daily Import | Rider read models, points economy, analytics | 99 Daily Import |
| `source_99.import.exception_found.v1` | v1 | 99 Daily Import | Risk, Operations | 99 Daily Import |
| `source_99.points_candidates.created.v1` | v1 | 99 Daily Import | Points Economy | 99 Daily Import |

Inbound events:

| Event | Version | Expected Action |
| --- | --- | --- |
| `rider.ol_joined.v1` | v1 | Mark rider eligible for tier-2 99 performance generation. |
| `points.ruleset.activated.v1` | v1 | Use the active points rule set for future candidate calculations. |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy? Yes, indirectly.
Ledger tables or records: This module must not write points ledger rows directly. It creates candidate records that Points Economy can approve, hold, reject, or post.
Compensation behavior: 99 earnings are source-platform income data for read models and reconciliation, not MePonto payroll.
Audit requirement: Every file upload, validation warning, batch replacement, approval, and candidate handoff requires audit metadata.
```

## 7. Rule Engine Impact

```txt
Configurable rules: Required source files, expected columns, business-date policy, rider matching priority, OL tier gate, exception thresholds, duplicate handling, point candidate calculation.
Rule owner: Operations / Product / Finance / Risk.
Effective time: Import rule set must use the same active rule version as Points Economy for the business date.
City/site/franchise differences: Allowed for eligibility and rollout scope, but idempotency and ledger controls are global.
```

## 8. Read Models And Analytics

```txt
Dashboards: 99 daily import status, source file completeness, match rate, exception count, OL eligibility blocks, estimated point candidates.
Read models: rider_99_daily_performance_read_model, rider_99_wallet_read_model, rider_99_import_exception_read_model.
Projection refresh: After batch confirmation; re-import replaces same business date projections.
KPIs: Import success rate, rider match rate, OL-ineligible rows, missing earnings/performance rows, point candidate total, approval time, exception resolution time.
```

## 9. Localization

```txt
Chinese copy complete: Current beta UI includes Chinese review copy.
English copy complete: Current beta UI includes English copy object and technical labels.
Portuguese copy complete: Current beta UI includes Portuguese copy object for operator-facing text.
User-facing API errors localized: Required before production upload endpoints.
Empty/loading/error states localized: Required before production upload endpoints.
Brand terms checked: MePonto / PontoSys.
Single-language exception approved: None for operator UI; source column names preserve 99 export labels.
```

## 10. Rollout Plan

```txt
Initial status: beta.
Beta users: Internal Operations and Finance/Risk reviewers.
Rollback plan: Disable ninety_nine_daily_import_beta; remove candidate handoff while preserving imported audit records.
Monitoring: Import batch failures, missing required source files, duplicate business date replacements, high exception rate, point candidate mismatch.
Success criteria: Daily previous-day imports produce stable read models, never duplicate points, block tier-1 riders, and preserve raw source audit for reconciliation.
```
