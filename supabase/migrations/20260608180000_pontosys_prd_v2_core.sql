-- PontoSys PRD v2.0 core domain.
-- External reports remain the order/schedule source of truth. PontoSys owns
-- tenant allocation, KPI projections, application approvals, whitelist export,
-- points accounting, and marketplace settlement.

INSERT INTO roles (name, description) VALUES
  ('Partner Operator', 'Partner service point operations'),
  ('Supplier Admin', 'Supplier catalog and fulfillment operations')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO permissions (code, label) VALUES
  ('manage_partner_services', 'Manage partner services'),
  ('manage_supplier_catalog', 'Manage supplier catalog')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (
  CASE r.name
    WHEN 'Partner Operator' THEN ARRAY[
      'view_dashboard', 'manage_marketplace', 'manage_partner_points', 'manage_partner_services'
    ]
    WHEN 'Supplier Admin' THEN ARRAY[
      'view_dashboard', 'manage_marketplace', 'manage_supplier_catalog', 'view_analytics'
    ]
    WHEN 'Super Admin' THEN ARRAY['manage_partner_services', 'manage_supplier_catalog']
    ELSE ARRAY[]::text[]
  END
)
ON CONFLICT DO NOTHING;

INSERT INTO app_portals (id, product_name, title, home_path, vercel_path, future_domain, description)
VALUES
  ('partner', 'Partner 服务点', 'Partner 服务点端', '/partner-app', '/partner-app', 'partner.meponto.com', '维修、加油、餐车、通讯与装备服务点进行服务核销并赚取生态积分。'),
  ('supplier', '供应链后台', '供应链后台', '/supplier-admin', '/supplier-admin', 'supplier.meponto.com', '供应商管理 SKU、供应底价、媒体资产、发货单和月度对账。')
ON CONFLICT (id) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  title = EXCLUDED.title,
  home_path = EXCLUDED.home_path,
  vercel_path = EXCLUDED.vercel_path,
  future_domain = EXCLUDED.future_domain,
  description = EXCLUDED.description,
  updated_at = now();

CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  tenant_type text NOT NULL CHECK (tenant_type IN ('platform', 'franchise', 'station', 'partner', 'supplier')),
  parent_tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS tenant_id text REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE app_test_accounts
  ADD COLUMN IF NOT EXISTS tenant_id text REFERENCES tenants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS external_import_batches (
  id text PRIMARY KEY,
  provider text NOT NULL,
  business_date date NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('uploaded', 'validating', 'ready', 'approved', 'rejected')),
  order_file_name text,
  rider_file_name text,
  finance_file_name text,
  order_rows integer NOT NULL DEFAULT 0,
  rider_rows integer NOT NULL DEFAULT 0,
  finance_rows integer NOT NULL DEFAULT 0,
  matched_riders integer NOT NULL DEFAULT 0,
  unknown_riders integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  checksum text,
  uploaded_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, business_date, checksum)
);

CREATE TABLE IF NOT EXISTS external_rider_daily_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL REFERENCES external_import_batches(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  franchise_tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  station_tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  rider_external_id text NOT NULL,
  rider_name text NOT NULL,
  order_count integer NOT NULL DEFAULT 0,
  completed_orders integer NOT NULL DEFAULT 0,
  cancelled_orders integer NOT NULL DEFAULT 0,
  online_minutes integer NOT NULL DEFAULT 0,
  attendance_minutes integer NOT NULL DEFAULT 0,
  gross_amount_cents integer NOT NULL DEFAULT 0,
  incentive_amount_cents integer NOT NULL DEFAULT 0,
  adjustment_amount_cents integer NOT NULL DEFAULT 0,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, rider_external_id)
);

CREATE TABLE IF NOT EXISTS kpi_rule_sets (
  id text PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  effective_from date NOT NULL,
  effective_to date,
  min_completed_orders integer NOT NULL DEFAULT 0,
  min_attendance_minutes integer NOT NULL DEFAULT 0,
  min_acceptance_rate numeric(5,2) NOT NULL DEFAULT 0,
  max_cancellation_rate numeric(5,2) NOT NULL DEFAULT 100,
  points_reward integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS rider_daily_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id uuid NOT NULL REFERENCES external_rider_daily_facts(id) ON DELETE CASCADE,
  rule_set_id text NOT NULL REFERENCES kpi_rule_sets(id) ON DELETE RESTRICT,
  rider_external_id text NOT NULL,
  business_date date NOT NULL,
  acceptance_rate numeric(5,2) NOT NULL DEFAULT 0,
  cancellation_rate numeric(5,2) NOT NULL DEFAULT 0,
  orders_per_hour numeric(8,2) NOT NULL DEFAULT 0,
  attendance_rate numeric(5,2) NOT NULL DEFAULT 0,
  kpi_score numeric(5,2) NOT NULL DEFAULT 0,
  kpi_passed boolean NOT NULL DEFAULT false,
  points_candidate integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rider_external_id, business_date, rule_set_id)
);

CREATE TABLE IF NOT EXISTS quota_cycles (
  id text PRIMARY KEY,
  external_schedule_ref text NOT NULL,
  name text NOT NULL,
  business_week_start date NOT NULL,
  business_week_end date NOT NULL,
  platform_capacity integer NOT NULL CHECK (platform_capacity >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'allocating', 'open', 'closed', 'exported')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_schedule_ref)
);

CREATE TABLE IF NOT EXISTS franchise_quota_allocations (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES quota_cycles(id) ON DELETE CASCADE,
  franchise_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  quota integer NOT NULL CHECK (quota >= 0),
  allocated_by text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, franchise_tenant_id)
);

CREATE TABLE IF NOT EXISTS station_quota_allocations (
  id text PRIMARY KEY,
  franchise_allocation_id text NOT NULL REFERENCES franchise_quota_allocations(id) ON DELETE CASCADE,
  station_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  quota integer NOT NULL CHECK (quota >= 0),
  allocated_by text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (franchise_allocation_id, station_tenant_id)
);

ALTER TABLE rider_slots
  ADD COLUMN IF NOT EXISTS quota_cycle_id text REFERENCES quota_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS station_quota_allocation_id text REFERENCES station_quota_allocations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_schedule_ref text;

ALTER TABLE slot_enrollments
  ADD COLUMN IF NOT EXISTS whitelist_status text NOT NULL DEFAULT 'not_ready'
    CHECK (whitelist_status IN ('not_ready', 'ready', 'exported', 'external_confirmed')),
  ADD COLUMN IF NOT EXISTS whitelist_export_id text;

CREATE TABLE IF NOT EXISTS whitelist_exports (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES quota_cycles(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('generated', 'downloaded', 'submitted_external', 'confirmed_external')),
  row_count integer NOT NULL DEFAULT 0,
  file_name text NOT NULL,
  checksum text NOT NULL,
  generated_by text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz,
  submitted_external_at timestamptz,
  external_confirmation_ref text
);

ALTER TABLE slot_enrollments
  ADD CONSTRAINT slot_enrollments_whitelist_export_fk
  FOREIGN KEY (whitelist_export_id) REFERENCES whitelist_exports(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS point_accounts (
  id text PRIMARY KEY,
  owner_type text NOT NULL CHECK (owner_type IN ('rider', 'partner', 'franchise')),
  owner_external_id text NOT NULL,
  tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  available_points bigint NOT NULL DEFAULT 0,
  pending_points bigint NOT NULL DEFAULT 0,
  locked_points bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_external_id)
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES point_accounts(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('earn', 'spend', 'hold', 'release', 'expire', 'adjust')),
  points bigint NOT NULL,
  balance_after bigint NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  reason_code text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
  id text PRIMARY KEY,
  tenant_id text NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  partner_type text NOT NULL CHECK (partner_type IN ('repair', 'fuel', 'food', 'phone_data', 'equipment', 'vehicle')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  latitude numeric(10,7),
  longitude numeric(10,7),
  service_points integer NOT NULL DEFAULT 10,
  points_withdrawable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_service_logs (
  id text PRIMARY KEY,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  rider_external_id text NOT NULL,
  service_type text NOT NULL,
  service_code_hash text NOT NULL,
  service_code_expires_at timestamptz NOT NULL,
  rider_latitude numeric(10,7),
  rider_longitude numeric(10,7),
  partner_latitude numeric(10,7),
  partner_longitude numeric(10,7),
  distance_meters numeric(10,2),
  status text NOT NULL CHECK (status IN ('issued', 'verified', 'blocked', 'expired')),
  idempotency_key text NOT NULL UNIQUE,
  points_awarded integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  settlement_cycle text NOT NULL DEFAULT 'monthly',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_skus (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  sku_code text NOT NULL UNIQUE,
  name text NOT NULL,
  supply_price_cents integer NOT NULL CHECK (supply_price_cents >= 0),
  channel_price_points integer NOT NULL CHECK (channel_price_points >= 0),
  media_urls text[] NOT NULL DEFAULT '{}',
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_settlements (
  id text PRIMARY KEY,
  order_external_id text NOT NULL UNIQUE,
  rider_points_spent integer NOT NULL,
  fiat_gross_cents integer NOT NULL,
  franchise_share_points integer NOT NULL,
  franchise_share_cents integer NOT NULL,
  supplier_payable_cents integer NOT NULL,
  platform_margin_cents integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accrued', 'paid', 'reversed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_facts_tenant_date
  ON external_rider_daily_facts(franchise_tenant_id, station_tenant_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rider_daily_kpis_rider_date
  ON rider_daily_kpis(rider_external_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_franchise_quota_cycle
  ON franchise_quota_allocations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_station_quota_franchise
  ON station_quota_allocations(franchise_allocation_id);
CREATE INDEX IF NOT EXISTS idx_partner_service_status
  ON partner_service_logs(partner_id, status, created_at DESC);

INSERT INTO tenants (id, tenant_type, parent_tenant_id, name, metadata)
VALUES
  ('tenant-platform', 'platform', NULL, 'MePonto HQ', '{"country":"BR","city":"Sao Paulo"}'),
  ('tenant-fr-sp-core', 'franchise', 'tenant-platform', 'SP Core Franchise', '{"region":"SP Core"}'),
  ('tenant-fr-tatuape', 'franchise', 'tenant-platform', 'Tatuape Growth Franchise', '{"region":"SP East"}'),
  ('tenant-st-paulista', 'station', 'tenant-fr-sp-core', 'Ponto Paulista Garage', '{"external_id":"p-001"}'),
  ('tenant-st-liberdade', 'station', 'tenant-fr-sp-core', 'Ponto Liberdade Sul', '{"external_id":"p-002"}'),
  ('tenant-st-tatuape', 'station', 'tenant-fr-tatuape', 'Ponto Tatuape Norte', '{"external_id":"p-003"}'),
  ('tenant-partner-repair', 'partner', 'tenant-platform', 'Oficina Paulista 24h', '{"partner_type":"repair"}'),
  ('tenant-supplier-equipment', 'supplier', 'tenant-platform', 'SupriMoto Equipamentos', '{"category":"equipment"}')
ON CONFLICT (id) DO UPDATE SET
  parent_tenant_id = EXCLUDED.parent_tenant_id,
  name = EXCLUDED.name,
  metadata = EXCLUDED.metadata,
  updated_at = now();

WITH account_seed(id, portal_id, role_name, name, identifier, phone, password_hint, organization, default_path, tenant_id) AS (
  VALUES
    ('acct-partner', 'partner', 'Partner Operator', 'Oficina Partner Operator', 'partner@meponto.com', '+55 11 90000-0005', 'partner-demo', 'Oficina Paulista 24h', '/partner-app', 'tenant-partner-repair'),
    ('acct-supplier', 'supplier', 'Supplier Admin', 'SupriMoto Supplier Admin', 'supplier@meponto.com', '+55 11 90000-0006', 'supplier-demo', 'SupriMoto Equipamentos', '/supplier-admin', 'tenant-supplier-equipment')
)
INSERT INTO app_test_accounts (
  id, portal_id, role_id, name, identifier, phone, password_hint,
  organization, default_path, tenant_id
)
SELECT s.id, s.portal_id, r.id, s.name, s.identifier, s.phone, s.password_hint,
  s.organization, s.default_path, s.tenant_id
FROM account_seed s
JOIN roles r ON r.name = s.role_name
ON CONFLICT (id) DO UPDATE SET
  portal_id = EXCLUDED.portal_id,
  role_id = EXCLUDED.role_id,
  name = EXCLUDED.name,
  identifier = EXCLUDED.identifier,
  phone = EXCLUDED.phone,
  password_hint = EXCLUDED.password_hint,
  organization = EXCLUDED.organization,
  default_path = EXCLUDED.default_path,
  tenant_id = EXCLUDED.tenant_id,
  updated_at = now();

UPDATE app_test_accounts
SET tenant_id = CASE portal_id
  WHEN 'pontosys' THEN 'tenant-platform'
  WHEN 'franchise' THEN 'tenant-fr-tatuape'
  WHEN 'ponto' THEN 'tenant-st-paulista'
  WHEN 'rider' THEN 'tenant-st-paulista'
  WHEN 'pontomall' THEN 'tenant-platform'
  ELSE tenant_id
END;

INSERT INTO kpi_rule_sets (
  id, name, version, status, effective_from, min_completed_orders,
  min_attendance_minutes, min_acceptance_rate, max_cancellation_rate,
  points_reward, created_by
)
VALUES (
  'kpi-rider-v1', 'Rider Daily KPI', 1, 'active', DATE '2026-06-01',
  8, 360, 85, 8, 20, 'HQ Operations'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  min_completed_orders = EXCLUDED.min_completed_orders,
  min_attendance_minutes = EXCLUDED.min_attendance_minutes,
  min_acceptance_rate = EXCLUDED.min_acceptance_rate,
  max_cancellation_rate = EXCLUDED.max_cancellation_rate,
  points_reward = EXCLUDED.points_reward;

INSERT INTO external_import_batches (
  id, provider, business_date, status, order_file_name, rider_file_name,
  finance_file_name, order_rows, rider_rows, finance_rows, matched_riders,
  unknown_riders, warning_count, checksum, uploaded_by, approved_by, approved_at
)
VALUES (
  'imp-20260607-99', 'External Dispatch System', DATE '2026-06-07', 'approved',
  'orders_20260607.csv', 'riders_20260607.csv', 'finance_20260607.csv',
  1284, 86, 1284, 84, 2, 3, 'demo-checksum-20260607',
  'HQ Operations', 'HQ Operations', TIMESTAMPTZ '2026-06-08 08:10:00-03'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO quota_cycles (
  id, external_schedule_ref, name, business_week_start, business_week_end,
  platform_capacity, status, created_by
)
VALUES (
  'quota-20260608', 'EXT-SCHEDULE-W24', 'Week 24 Capacity',
  DATE '2026-06-08', DATE '2026-06-14', 180, 'open', 'HQ Operations'
)
ON CONFLICT (id) DO UPDATE SET
  platform_capacity = EXCLUDED.platform_capacity,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO franchise_quota_allocations (id, cycle_id, franchise_tenant_id, quota, allocated_by)
VALUES
  ('fqa-core-w24', 'quota-20260608', 'tenant-fr-sp-core', 110, 'HQ Operations'),
  ('fqa-tatuape-w24', 'quota-20260608', 'tenant-fr-tatuape', 70, 'HQ Operations')
ON CONFLICT (id) DO UPDATE SET quota = EXCLUDED.quota;

INSERT INTO station_quota_allocations (id, franchise_allocation_id, station_tenant_id, quota, allocated_by)
VALUES
  ('sqa-paulista-w24', 'fqa-core-w24', 'tenant-st-paulista', 65, 'SP Core Franchise'),
  ('sqa-liberdade-w24', 'fqa-core-w24', 'tenant-st-liberdade', 45, 'SP Core Franchise'),
  ('sqa-tatuape-w24', 'fqa-tatuape-w24', 'tenant-st-tatuape', 70, 'Tatuape Growth Franchise')
ON CONFLICT (id) DO UPDATE SET quota = EXCLUDED.quota;

INSERT INTO partners (id, tenant_id, partner_type, name, latitude, longitude, service_points)
VALUES (
  'partner-repair-001', 'tenant-partner-repair', 'repair',
  'Oficina Paulista 24h', -23.5614000, -46.6559000, 10
)
ON CONFLICT (id) DO UPDATE SET
  partner_type = EXCLUDED.partner_type,
  name = EXCLUDED.name,
  service_points = EXCLUDED.service_points;

INSERT INTO suppliers (id, tenant_id, name)
VALUES ('supplier-equipment-001', 'tenant-supplier-equipment', 'SupriMoto Equipamentos')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO product_skus (
  id, supplier_id, sku_code, name, supply_price_cents,
  channel_price_points, media_urls, stock, status
)
VALUES (
  'sku-helmet-001', 'supplier-equipment-001', 'HELMET-BLK-M',
  'Capacete Preto M', 6000, 1000,
  ARRAY['https://images.unsplash.com/photo-1558981806-ec527fa84c39'], 40, 'approved'
)
ON CONFLICT (id) DO UPDATE SET
  supply_price_cents = EXCLUDED.supply_price_cents,
  channel_price_points = EXCLUDED.channel_price_points,
  media_urls = EXCLUDED.media_urls,
  stock = EXCLUDED.stock,
  status = EXCLUDED.status;
