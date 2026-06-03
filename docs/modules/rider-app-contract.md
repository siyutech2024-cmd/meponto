# MePonto Member Experience Module Contract

## 1. Module Identity

```txt
Module name: MePonto
Owner: Rider community / Leader / Mobile owner
Status: beta
Route: /rider-app
Feature flag: meponto_member.beta_enabled
Business purpose: Give rider members an Android-first MePonto home experience for wallet visibility, points visibility, community readiness, Ponto context, Leader support, push notifications, incident entry, and safety status without creating a separate login system or implying an employment contract.
Authoritative points rules: docs/meponto-points-economy-standard.md
```

## 2. Users And Permissions

```txt
Allowed roles: Rider member end user in future mobile auth; internal operators can preview through PontoSys during beta.
Denied roles: None at preview level; production writes must require scoped member identity.
Required scopes: member.self.read, member.status.confirm, member.incident.create for future write APIs.
Sensitive actions: SOS, incident submit, location sharing, wallet visibility, points visibility, benefit visibility, push notification delivery.
Approval flow: Production auth, Android push, location, and SOS flows require product and security approval before active status.
```

## 3. Data Boundary

```txt
Private data owned by this module: MePonto member session state, mobile status confirmation draft state, device readiness signal.
Read-only data consumed from other modules: Member profile read model, Ponto read model, Leader contact, support case summary, wallet/settlement read model, points read model, benefit ledger read model, partner location/benefit read model, marketplace entry/read model.
Data this module exposes to others: Future member status confirmation events, incident create requests, safety pulse events, push notification delivery/read events.
Retention policy: Device/session telemetry should be short-lived unless promoted to audit or incident evidence.
LGPD sensitivity: High for location, CPF/PIX, phone, and emergency context. Current beta screen does not reveal CPF/PIX.
```

Rule:

```txt
This module cannot directly modify another module's private data.
```

## 4. APIs

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET | `/rider-app` | Internal beta preview UI | PontoSys preview access | Static/demo read-only page in current implementation. |
| GET | `/api/mobile` | Existing mobile workflow read model | Internal operator access | Used as adjacent mobile operations context. |
| POST | Future `/api/rider-app/status-confirmations` | Member availability/status confirmation | `member.status.confirm` | Must emit a versioned event and audit sensitive context. |
| POST | Future `/api/rider-app/incidents` | Member incident/SOS intake | `member.incident.create` | Must route through Incident API or Integration Gateway. |
| POST | Future `/api/rider-app/push-token` | Register Android push token | `member.device.register` | Must store device tokens through the notification module with LGPD controls. |
| GET | Future `/api/rider-app/notifications` | Read member notifications | `member.notification.read` | Should merge push notifications and in-app chat notices through a read model. |
| GET | Future `/api/rider-app/wallet` | Read rider-visible wallet, pending settlement, and points | `member.wallet.read` | Read-only projection from finance/points ledgers; no direct ledger mutation. |
| GET | Future `/api/rider-app/points` | Read available points, pending points, expiring points, missions, and marketplace entry | `member.points.read` | Must follow `docs/meponto-points-economy-standard.md`. |
| GET | Future `/api/rider-app/partners-map` | Read nearby active Partner points, service type, member discount, and navigation destination | `member.benefits.read` | Read-only projection from CRM and Partner Points; no direct Partner private notes or fraud data. |

## 5. Events

Outbound events:

| Event | Version | Producer | Consumers | Payload Owner |
| --- | --- | --- | --- | --- |
| `meponto_member.status_confirmed.v1` | v1 | MePonto | Dispatch, Leader, Analytics | MePonto |
| `meponto_member.safety_pulse.created.v1` | v1 | MePonto | Leader, Risk, Incident | MePonto |
| `meponto_member.incident.requested.v1` | v1 | MePonto | Incident, Support, In-App Chat | MePonto |
| `meponto_member.notification.read.v1` | v1 | MePonto | Notifications, Analytics | MePonto |

Inbound events:

| Event | Version | Expected Action |
| --- | --- | --- |
| `incident.status.updated.v1` | v1 | Update rider-visible incident status/read model. |
| `leader.assignment.updated.v1` | v1 | Refresh rider support contact. |
| `notification.created.v1` | v1 | Render push/in-app notification in the member inbox. |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy? Current beta: no writes. Future benefit views read from ledger read models only.
Ledger tables or records: None created by the beta screen.
Compensation behavior: No compensation changes.
Audit requirement: Wallet reveal, points reveal, benefit reveal, and any future payout-related action must be audited.
```

## 7. Rule Engine Impact

```txt
Configurable rules: Member status confirmation, night coverage pulse interval, SOS escalation target.
Rule owner: Operations / Risk.
Effective time: Future rules must support city/site/franchise differences.
City/site/franchise differences: Ponto and city rules can vary by rollout scope.
```

## 8. Read Models And Analytics

```txt
Dashboards: Mobile Operations, Leader roster, Finance read model health, Points read model health, MePonto beta health, notification delivery health.
Read models: Member profile, Ponto assignment, wallet balance, pending settlement, points balance, pending points, expiring points, mission progress, Partner map pins, Partner benefit summary, marketplace entry, incident summary, benefit ledger summary, member notification inbox.
Projection refresh: Demo uses static data; production should use near-real-time projections for wallet, points, Partner availability, mission progress, notifications, and safety status.
KPIs: Wallet view rate, points view rate, Partner map open rate, navigation click rate, withdrawal intent, mission completion, SOS response time, incident submit success, push delivery/open rate, and in-app chat usage.
```

## 9. Localization

```txt
Chinese copy complete: Product direction reviewed in Chinese; rider-facing beta body copy is currently Portuguese-first.
English copy complete: Pending full member copy review.
Portuguese copy complete: Yes for beta preview body copy.
```

## 10. Rollout Plan

```txt
Initial status: beta
Beta users: Internal operators and selected rider/leader test group.
Rollback plan: Remove navigation exposure or set meponto_member.beta_enabled to disabled when feature flag service is introduced.
Monitoring: Smoke route check, manual mobile viewport check, future incident/SOS metrics.
Success criteria: Members can understand club status, nearby Partner benefits, support contact, safety flow, and incident entry without exposing sensitive CPF/PIX, partner private risk notes, or implying employment/contract language.
```
