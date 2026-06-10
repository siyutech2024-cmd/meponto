-- Formal portal split, test accounts, and durable slot scheduling schema.

INSERT INTO roles (name, description) VALUES
  ('Franchise Admin', 'Franchise operator workspace access'),
  ('Rider', 'MePonto rider app access'),
  ('Mall Operator', 'PontoMall catalog and redemption operations')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO permissions (code, label) VALUES
  ('manage_points', 'Manage points economy'),
  ('manage_marketplace', 'Manage marketplace'),
  ('manage_partner_points', 'Manage partner points'),
  ('manage_slots', 'Manage rider slots'),
  ('use_rider_app', 'Use rider app')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (
  CASE r.name
    WHEN 'Super Admin' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'manage_pontos', 'manage_leaders',
      'create_incidents', 'close_incidents', 'manage_rewards', 'manage_points',
      'manage_marketplace', 'manage_partner_points', 'manage_slots',
      'use_rider_app', 'view_finance', 'view_analytics', 'view_audit', 'reset_demo'
    ]
    WHEN 'Franchise Admin' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'manage_pontos', 'create_incidents',
      'close_incidents', 'manage_rewards', 'manage_points', 'manage_marketplace',
      'manage_partner_points', 'manage_slots', 'view_analytics', 'view_audit'
    ]
    WHEN 'Regional Manager' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'manage_pontos', 'manage_leaders',
      'create_incidents', 'close_incidents', 'manage_rewards', 'manage_points',
      'manage_marketplace', 'manage_partner_points', 'manage_slots',
      'view_analytics', 'view_audit'
    ]
    WHEN 'Ponto Manager' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'create_incidents', 'close_incidents',
      'manage_rewards', 'manage_partner_points', 'manage_slots', 'view_analytics'
    ]
    WHEN 'Leader' THEN ARRAY['view_dashboard', 'create_incidents', 'manage_slots', 'view_analytics']
    WHEN 'Rider' THEN ARRAY['use_rider_app', 'manage_marketplace']
    WHEN 'Mall Operator' THEN ARRAY[
      'view_dashboard', 'manage_marketplace', 'manage_points',
      'manage_partner_points', 'view_analytics', 'view_audit'
    ]
    WHEN 'Finance' THEN ARRAY[
      'view_dashboard', 'manage_rewards', 'manage_points', 'manage_marketplace',
      'view_finance', 'view_analytics', 'view_audit'
    ]
    WHEN 'Support' THEN ARRAY[
      'view_dashboard', 'create_incidents', 'close_incidents', 'view_analytics',
      'view_audit'
    ]
    ELSE ARRAY[]::text[]
  END
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS app_portals (
  id text PRIMARY KEY,
  product_name text NOT NULL,
  title text NOT NULL,
  home_path text NOT NULL UNIQUE,
  vercel_path text NOT NULL UNIQUE,
  future_domain text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_test_accounts (
  id text PRIMARY KEY,
  portal_id text NOT NULL REFERENCES app_portals(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  name text NOT NULL,
  identifier citext NOT NULL UNIQUE,
  phone text NOT NULL UNIQUE,
  password_hint text NOT NULL,
  organization text NOT NULL,
  default_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS franchises (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Active',
  owner_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pontos
  ADD COLUMN IF NOT EXISTS franchise_id text REFERENCES franchises(id) ON DELETE SET NULL;

CREATE TYPE slot_status AS ENUM ('open', 'closed', 'cancelled');
CREATE TYPE slot_enrollment_status AS ENUM (
  'submitted',
  'ponto_approved',
  'franchise_confirmed',
  'hq_reviewed',
  'rejected',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS rider_slots (
  id text PRIMARY KEY,
  week text NOT NULL,
  date date NOT NULL,
  weekday text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  ponto_external_id text REFERENCES pontos(external_id) ON DELETE SET NULL,
  ponto_name text NOT NULL,
  franchise_id text REFERENCES franchises(id) ON DELETE SET NULL,
  franchise_name text NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 0),
  enrolled integer NOT NULL DEFAULT 0 CHECK (enrolled >= 0),
  status slot_status NOT NULL DEFAULT 'open',
  priority boolean NOT NULL DEFAULT false,
  quota_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slot_enrollments (
  id text PRIMARY KEY,
  slot_id text NOT NULL REFERENCES rider_slots(id) ON DELETE CASCADE,
  rider_external_id text,
  rider_name text NOT NULL,
  rider_tier integer NOT NULL DEFAULT 1 CHECK (rider_tier >= 1),
  status slot_enrollment_status NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  ponto_reviewed_by text,
  ponto_reviewed_at timestamptz,
  franchise_confirmed_by text,
  franchise_confirmed_at timestamptz,
  hq_reviewed_by text,
  hq_reviewed_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pontos_franchise_id ON pontos(franchise_id);
CREATE INDEX IF NOT EXISTS idx_rider_slots_week ON rider_slots(week);
CREATE INDEX IF NOT EXISTS idx_rider_slots_ponto ON rider_slots(ponto_external_id);
CREATE INDEX IF NOT EXISTS idx_rider_slots_franchise ON rider_slots(franchise_id);
CREATE INDEX IF NOT EXISTS idx_slot_enrollments_slot ON slot_enrollments(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_enrollments_status ON slot_enrollments(status);

INSERT INTO app_portals (id, product_name, title, home_path, vercel_path, future_domain, description)
VALUES
  ('pontosys', 'PontoSys', 'PontoSys 主后台', '/pontosys', '/pontosys', 'admin.meponto.com', '总部运营、风控、财务、报表、权限、审计和全网排班查看。'),
  ('franchise', '加盟商后台', '加盟商后台', '/franchise-admin', '/franchise-admin', 'franchise.meponto.com', '加盟商查看自己区域的站点、骑手、排班确认、PontoMall 和经营数据。'),
  ('ponto', '站点后台', '站点后台', '/ponto-admin', '/ponto-admin', 'ponto.meponto.com', '站点进行骑手报名初审、现场运营、事故上报和本站点骑手维护。'),
  ('rider', 'MePonto 骑手APP', 'MePonto 骑手APP', '/app', '/app', 'app.meponto.com', '骑手查看积分、排班 slots、报名状态、商城兑换和个人运营信息。'),
  ('pontomall', 'PontoMall', 'PontoMall 积分商城', '/pontomall', '/pontomall', 'mall.meponto.com', '商品目录、库存、兑换订单、合作伙伴积分和商城运营。')
ON CONFLICT (id) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  title = EXCLUDED.title,
  home_path = EXCLUDED.home_path,
  vercel_path = EXCLUDED.vercel_path,
  future_domain = EXCLUDED.future_domain,
  description = EXCLUDED.description,
  updated_at = now();

WITH account_seed(id, portal_id, role_name, name, identifier, phone, password_hint, organization, default_path) AS (
  VALUES
    ('acct-hq', 'pontosys', 'Super Admin', 'HQ Operations', 'hq@meponto.com', '+55 11 90000-0000', 'pontosys-hq', 'MePonto HQ', '/pontosys'),
    ('acct-franchise', 'franchise', 'Franchise Admin', 'Tatuape Franchise Admin', 'franchise@meponto.com', '+55 11 90000-0001', 'franquia-demo', 'Tatuape Growth Franchise', '/franchise-admin'),
    ('acct-ponto', 'ponto', 'Ponto Manager', 'Ponto Paulista Manager', 'ponto@meponto.com', '+55 11 90000-0002', 'ponto-demo', 'Ponto Paulista', '/ponto-admin'),
    ('acct-rider', 'rider', 'Rider', 'Marcos Demo Rider', 'rider@meponto.com', '+55 11 90000-0003', 'rider-demo', 'Ponto Paulista', '/app'),
    ('acct-mall', 'pontomall', 'Mall Operator', 'PontoMall Operator', 'mall@meponto.com', '+55 11 90000-0004', 'pontomall-demo', 'PontoMall', '/pontomall')
)
INSERT INTO app_test_accounts (id, portal_id, role_id, name, identifier, phone, password_hint, organization, default_path)
SELECT s.id, s.portal_id, r.id, s.name, s.identifier, s.phone, s.password_hint, s.organization, s.default_path
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
  updated_at = now();

INSERT INTO franchises (id, name, status, owner_name)
VALUES
  ('fr-sp-01', 'SP Core Franchise', 'Active', 'HQ Operations'),
  ('fr-sp-02', 'Tatuape Growth Franchise', 'Active', 'Tatuape Franchise Admin'),
  ('fr-sp-03', 'Pinheiros Partner Franchise', 'Active', 'HQ Operations')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  owner_name = EXCLUDED.owner_name,
  updated_at = now();
