# MePonto Module Contract Template

Copy this template when adding a new module.

## 1. Module Identity

```txt
Module name:
Owner:
Status: disabled | beta | active | deprecated
Route:
Feature flag:
Business purpose:
```

## 2. Users And Permissions

```txt
Allowed roles:
Denied roles:
Required scopes:
Sensitive actions:
Approval flow:
```

## 3. Data Boundary

```txt
Private data owned by this module:
Read-only data consumed from other modules:
Data this module exposes to others:
Retention policy:
LGPD sensitivity:
```

Rule:

```txt
This module cannot directly modify another module's private data.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET |  |  |  |  |
| POST |  |  |  |  |

## 5. Events

Outbound events:

| Event | Version | Producer | Consumers | Payload Owner |
| --- | --- | --- | --- | --- |
| `module.event.created.v1` | v1 |  |  |  |

Inbound events:

| Event | Version | Expected Action |
| --- | --- | --- |
|  |  |  |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy?
Ledger tables or records:
Compensation behavior:
Audit requirement:
```

## 7. Rule Engine Impact

```txt
Configurable rules:
Rule owner:
Effective time:
City/site/franchise differences:
```

## 8. Read Models And Analytics

```txt
Dashboards:
Read models:
Projection refresh:
KPIs:
```

## 9. Localization

```txt
Chinese copy complete:
English copy complete:
Portuguese copy complete:
```

## 10. Rollout Plan

```txt
Initial status:
Beta users:
Rollback plan:
Monitoring:
Success criteria:
```
