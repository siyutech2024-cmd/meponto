# PontoSys PRD v2 Architecture

## System Boundary

PontoSys is not the dispatch engine. The external dispatch system remains the source of truth for orders and the original schedule. PontoSys receives T+1 reports and manages:

- Franchise, station, and rider data segmentation
- Rider KPI projections
- Platform-to-franchise-to-station quota allocation
- Rider application and three-level review
- Final whitelist export back to the external system
- Rider, Partner, and franchise points accounting
- PontoMall supply, fulfillment, settlement, and margin

## Production Portals

| Portal | Domain | Responsibility |
| --- | --- | --- |
| PontoSys | `sys.meponto.com` | Global import, KPI, quota, final review, whitelist, finance |
| Franchise | `franchise.meponto.com` | Franchise-scoped data and station quota allocation |
| Station | `station.meponto.com` | Rider review, local operations, pickup verification |
| Rider | `app.meponto.com` | KPI, slot application, points, PontoMall |
| Partner | `partner.meponto.com` | Service verification and non-withdrawable points |
| Supplier | `supplier.meponto.com` | SKU, supply price, shipment, reconciliation |
| PontoMall | `mall.meponto.com` | Catalog, redemption, stock, fulfillment |
| API | `api.meponto.com` | Versioned REST API and cross-system integration |

## Core State Machines

### T+1 Import

`uploaded -> validating -> ready -> approved`

Unknown external rider IDs generate warnings. They do not create rider accounts.

### Capacity

`external schedule capacity -> HQ franchise quota -> franchise station quota`

Database and API validation prevent child allocations from exceeding the parent allocation.

### Enrollment

`submitted -> ponto_approved -> franchise_confirmed -> hq_reviewed`

After HQ review:

`not_ready -> ready -> exported -> external_confirmed`

### Marketplace Fulfillment

`redeemed -> supplier_preparing -> shipping_to_station -> station_received -> ready_for_pickup -> completed`

Financial settlement occurs only after verified pickup.

## Financial Constants

`1 BRL = 10 points`

Store values in integer cents and integer points. Never use floating-point values for settlement.

For a product with 1000 points channel price, BRL 60 supply price, and 10% franchise share:

- Rider: -1000 points
- Franchise: +100 points
- Supplier payable: BRL 60
- Platform margin: BRL 30

## Data Ownership

- Raw external files: immutable object storage
- Import batch metadata: PostgreSQL
- Normalized daily facts: PostgreSQL
- KPI result: versioned projection linked to rule set and source fact
- Points and finance: append-only ledger
- Images: object storage URLs linked by SKU
- Idempotency and QR TTL: Redis
- Audit: append-only PostgreSQL log

## Current Implementation Baseline

The migration `20260608180000_pontosys_prd_v2_core.sql` adds the core production entities. `/operations-core` and `/api/operations-core` expose the first operational read/write surface.

The existing pages remain available while each domain is migrated to the new tables. This avoids losing current functionality during the rebuild.

