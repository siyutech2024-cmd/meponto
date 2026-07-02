# Module Contract — Franchise Direct Procurement / 加盟商直采分销

> Follows `docs/module-contract-template.md`. Bilingual notes (中英对照) where useful.

## 1. Module Identity

```txt
Module name: franchise-procurement (加盟商直采分销)
Owner: PontoMall — mall/marketplace ownership area (app/mall, app/marketplace, app/store)
Status: disabled (behind feature flag, default off)
Route: /api/mall/procurement (backend only in V1; UI to follow)
Feature flag: MallConfig.franchiseProcurementEnabled (default false; HQ toggles via /api/mall `setConfig`)
Business purpose: Let franchises buy goods directly from mall suppliers at a
  supplier-set distribution price. The platform adds a fixed 8% commission on
  top: the franchise pays goodsTotal × 1.08, the supplier receives the full
  goodsTotal, the platform keeps the 8%.
```

### V1 default decisions / V1 默认决策(产品已定)

| Decision / 决策 | V1 value |
| --- | --- |
| Platform commission / 平台佣金 | Fixed **8%**, added ON TOP of the distribution price(加价在分销价之上;加盟商付 分销价×1.08,供应商全额拿分销价,平台留 8%) |
| Payment / 支付 | **Prepaid 预付制**: franchise transfers PIX to the platform first; HQ manually confirms receipt (`confirmProcurementPayment`) before the supplier may confirm/ship |
| Logistics / 物流 | Supplier ships **directly to the franchise**(供应商直发加盟商) |
| Pricing & eligibility / 定价与资格 | Supplier sets the distribution price (`wholesalePrice`); HQ approves distributability (`distributionApproved`) |

### V1 boundary / V1 边界

- **Goods never enter platform stock / 货物不进平台库存**: a PO with
  `buyerType === "franchise"` is received via `receiveProcurementPO`, which is
  status-only — no `product.stock` delta, no `InventoryLedgerEntry`. The legacy
  `receivePO` (which adds stock) rejects franchise POs with 409.
- **No second-level listing / 不做二级上架**: what the franchise does with the
  goods after receipt is outside this module (no resale catalog, no franchise
  inventory model in V1).
- No credit; no platform warehouse transit; no automatic PSP reconciliation
  (all V2 — see Rollout).

## 2. Users And Permissions

```txt
Allowed roles:
  - Supplier sessions (portal "supplier", RBAC manage_supplier_catalog):
    setDistributable, confirmProcurementStatement — own records only
    (scoped by session.organization === product.supplierName / statement.supplierName).
  - Franchise sessions (portal "franchise"):
    createProcurementPO, receiveProcurementPO — own POs only
    (scoped by session.franchise || session.organization === po.franchise).
  - HQ (portal "pontomall"/"pontosys", RBAC manage_points):
    approveDistribution, confirmProcurementPayment,
    generateProcurementStatement, payProcurementStatement.
Denied roles: riders, partners, station (ponto) portal — GET returns 403,
  actions are gated per class above. No bespoke auth (Hard Rule #5):
  everything rides the shared signed session + RBAC/scope model.
Required scopes: supplier → own supplierName; franchise → own franchise.
Sensitive actions: confirmProcurementPayment (money), payProcurementStatement
  (money) — both audited at risk "Medium".
Approval flow: supplier opt-in → HQ approveDistribution; any supplier edit of
  distributable/wholesalePrice resets distributionApproved to false (re-review).
```

## 3. Data Boundary

```txt
Private data owned by this module:
  - procurementFeeEntries (ProcurementFeeEntry) — append-only commission ledger.
  - procurementSupplierStatements (ProcurementSupplierStatement) — monthly payables.
  - The franchise-procurement fields on shared records:
    MarketplaceProduct.distributable / wholesalePrice / distributionApproved,
    PurchaseOrder.buyerType / franchise / goodsTotal / feeBRL / paymentStatus.
Read-only data consumed from other modules:
  - MallConfig (feature flag + platform pixKey), marketplaceProducts catalog,
    franchises (via session scope).
Data this module exposes to others:
  - Franchise POs inside the shared purchaseOrders collection (supplier
    confirm/ship reuses /api/mall/ops confirmPO/shipPO with a prepay guard).
  - Versioned domain events (see §5).
Retention policy: ledger entries and paid statements are immutable/append-only.
LGPD sensitivity: low — organization-level records (franchise/supplier names,
  PIX keys snapshots), no rider personal data.
```

Rule: this module cannot directly modify another module's private data.
Compatibility: `PurchaseOrder.buyerType === undefined` is treated as `"hq"`
(legacy replenishment POs keep working unchanged / 兼容存量补货单).

## 4. APIs

Single endpoint: `/api/mall/procurement`.

| Method | Path | Purpose | Permission | Notes |
| --- | --- | --- | --- | --- |
| GET | /api/mall/procurement | Session-scoped read model | signed session | Shapes below |
| POST | /api/mall/procurement | `{ action, ... }` dispatcher | per action | Actions below |

### GET response shape (by session)

- **franchise** → `{ enabled, catalog: [{ productId, name, imageUrl, category, supplierName, wholesalePrice, feePct, deliveryCycleDays }], myPOs, pixKey }`
  (catalog only lists `distributable && distributionApproved && wholesalePrice > 0`; empty while the flag is off)
- **supplier** → `{ myDistribution: [{ productId, name, imageUrl, distributable, wholesalePrice, distributionApproved, supplyPrice, deliveryCycleDays }], procurementPOs, statements }`
- **HQ** → `{ enabled, pendingApprovals, allPOs, feeEntries, statements }`

### POST actions

| Action | Actor | Payload | Behavior |
| --- | --- | --- | --- |
| `setDistributable` | supplier | `{ productId, distributable: boolean, wholesalePrice?: number }` | Own products only; enabling requires `wholesalePrice > 0`; ANY change resets `distributionApproved` to false; event `supplier.distribution.updated.v1` + audit |
| `approveDistribution` | HQ | `{ productId, approve: boolean }` | Approving requires distributable + valid price; event + audit (Medium) |
| `createProcurementPO` | franchise (flag on) | `{ items: [{ productId, qty }] }` | Only approved-distributable products; grouped by supplierName — one PO per supplier (`buyerType:"franchise"`, `status:"ordered"`, `paymentStatus:"pending"`, `goodsTotal = Σ wholesalePrice×qty`, `feeBRL = round2(goodsTotal×0.08)`, item `supplyPrice` = distribution-price snapshot); event `franchise.po.created.v1` per PO. Returns `{ pos, goodsTotal, feeBRL, payableTotal, pixKey }` |
| `confirmProcurementPayment` | HQ | `{ poId }` | `paymentStatus pending→paid`; writes ProcurementFeeEntry (accrued, month = current); event `franchise.po.paid.v1`; audit Medium |
| *(supplier confirm/ship)* | supplier | — | Reuses `/api/mall/ops` `confirmPO` / `shipPO`; guarded: `buyerType==="franchise" && paymentStatus!=="paid"` → 409「加盟商未完成预付,不能确认」 |
| `receiveProcurementPO` | franchise | `{ poId }` | Own PO, `shipped→received`; **no stock, no inventory ledger**; event `franchise.po.received.v1`. Legacy `receivePO` rejects franchise POs (409) |
| `generateProcurementStatement` | HQ | `{ month: "YYYY-MM" }` | Idempotent (`runGenerate*` pattern): received franchise POs of the month grouped by supplier → draft ProcurementSupplierStatements; drafts regenerate, confirmed/disputed/paid immutable |
| `confirmProcurementStatement` | supplier | `{ statementId, pixKey? }` | Own statement, `draft→confirmed`, PIX snapshot |
| `payProcurementStatement` | HQ | `{ statementId, receiptNote? }` | `confirmed→paid`; flips the related ProcurementFeeEntries `accrued→settled`; event `franchise.po.settled.v1`; audit Medium |

## 5. Events

Outbound events (registered in `app/lib/server/events.ts` `PROCUREMENT_EVENTS`):

| Event | Version | Producer | Consumers | Payload Owner |
| --- | --- | --- | --- | --- |
| `supplier.distribution.updated.v1` | v1 | /api/mall/procurement | HQ approval queue | franchise-procurement |
| `supplier.distribution.approved.v1` | v1 | /api/mall/procurement | supplier portal, franchise catalog | franchise-procurement |
| `franchise.po.created.v1` | v1 | /api/mall/procurement | HQ finance (prepay queue) | franchise-procurement |
| `franchise.po.paid.v1` | v1 | /api/mall/procurement | supplier portal (unlock confirm/ship) | franchise-procurement |
| `franchise.po.received.v1` | v1 | /api/mall/procurement | statements generator | franchise-procurement |
| `franchise.po.settled.v1` | v1 | /api/mall/procurement | finance read models | franchise-procurement |

Inbound events:

| Event | Version | Expected Action |
| --- | --- | --- |
| — (V1 pulls state directly; supplier confirm/ship arrives via the shared ops API) | | |

## 6. Ledger Impact

```txt
Does this module affect money, incentives, points, stock, settlement, or gamification economy?
  Yes — money (franchise prepayment, supplier payables) and platform commission.
Ledger tables or records:
  - procurementFeeEntries (append-only): one entry per prepaid PO at HQ
    payment confirmation { id, poId, franchise, supplierName, goodsTotal,
    feePct: 8, feeBRL, month, status: accrued|settled, createdAt }.
    Status flips accrued→settled only when the covering procurement supplier
    statement is paid; entries are never edited or deleted otherwise.
  - procurementSupplierStatements: monthly supplier payables (received POs ×
    distribution price), draft/confirmed/disputed/paid (StatementStatus).
  - Explicitly NO inventory ledger and NO stock mutation (V1 boundary).
Compensation behavior: a cancelled PO before payment simply never accrues a
  fee; refunds after payment are a manual HQ finance operation in V1.
Audit requirement: payment confirmation and statement payment audited at
  risk "Medium"; distribution changes/approvals audited Low/Medium.
```

## 7. Rule Engine Impact

```txt
Configurable rules: feature flag franchiseProcurementEnabled (MallConfig,
  via /api/mall setConfig). Commission is a fixed constant
  PROCUREMENT_FEE_PCT = 8 (app/lib/mall-ops.ts) — intentionally NOT
  configurable in V1 (product decision); feePct is snapshotted per ledger entry.
Rule owner: HQ product/finance.
Effective time: immediate on toggle; existing POs keep their snapshots.
City/site/franchise differences: none in V1 (single flag, single rate).
```

## 8. Read Models And Analytics

```txt
Dashboards: HQ GET (pendingApprovals, allPOs, feeEntries, statements).
Read models: session-scoped GET shapes (franchise / supplier / HQ), reusing
  the shared purchaseOrders collection filtered by buyerType==="franchise".
Projection refresh: read-through refreshCollectionsFromDatabase on every call.
KPIs: prepaid GMV (Σ goodsTotal), platform commission (Σ feeBRL),
  accrued-vs-settled fee balance, statement aging.
```

## 9. Localization

```txt
Chinese copy complete: yes (API error messages; V1 is backend-only).
English copy complete: to complete with the UI batch (labels live in i18n.ts,
  which this backend batch must not touch).
Portuguese copy complete: partial (shared validation messages); to complete
  with the UI batch.
User-facing API errors localized: zh (+ some pt), consistent with the existing
  /api/mall/ops style.
Empty/loading/error states localized: n/a (no UI in this batch).
Exports/PDF/HTML localized if applicable: n/a.
In-App Chat/notification templates localized if applicable: n/a.
Brand terms checked: MePonto / PontoSys / PontoMall — unchanged.
Single-language exception approved: yes — backend-only batch; the UI batch
  MUST ship zh/en/pt labels for every user-facing string (follow-up item).
```

## 10. Rollout Plan

```txt
Initial status: disabled (franchiseProcurementEnabled = false).
Beta users: 1–2 pilot franchises + 1 pilot supplier chosen by HQ.
Rollback plan: toggle the flag off — GET catalog empties and
  createProcurementPO returns 403; existing POs/ledger/statements remain
  readable and settleable (no destructive rollback needed).
Monitoring: audit trail (PROCUREMENT_* actions), event outbox
  (franchise.po.*), fee ledger accrued/settled balance.
Success criteria: pilot POs complete the full prepay → confirm → ship →
  receive → statement → settle loop with a green fee-ledger reconciliation.

V2 outlook / V2 展望:
  - Credit terms for trusted franchises (信用额度,后付/账期).
  - Optional HQ-warehouse transit & consolidated shipping (总部仓中转合单).
  - PSP integration (Mercado Pago) for automatic PIX reconciliation,
    replacing the manual confirmProcurementPayment (PSP 自动核销).
  - Configurable / tiered commission rates per category or volume.
```
