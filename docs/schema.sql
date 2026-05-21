-- VENTO MVP target PostgreSQL schema.
-- Intended as the first durable schema for migrating the current Next.js in-memory backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE rider_status AS ENUM ('Active', 'Inactive', 'Risk', 'Night Shift');
CREATE TYPE incident_severity AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE incident_status AS ENUM ('Open', 'Processing', 'Closed');
CREATE TYPE ledger_status AS ENUM ('Pending', 'Approved', 'Paid', 'Rejected');
CREATE TYPE ledger_recipient_type AS ENUM ('Rider', 'Leader');
CREATE TYPE ledger_type AS ENUM ('Reward', 'Leader Commission', 'PIX', 'Subsidy');
CREATE TYPE reward_target_type AS ENUM ('Rider', 'Leader');
CREATE TYPE crm_partner_category AS ENUM ('Repair Shop', 'Partner Vehicle Shop', 'Supplier', 'Vehicle Partner');
CREATE TYPE crm_partner_status AS ENUM ('Active', 'Prospect', 'Review', 'Suspended');
CREATE TYPE crm_partner_tier AS ENUM ('Strategic', 'Preferred', 'Standard', 'Watchlist');
CREATE TYPE risk_level AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE whatsapp_risk_status AS ENUM ('Stable', 'Watch', 'Risk', 'Critical');
CREATE TYPE whatsapp_coverage_status AS ENUM ('Covered', 'Thin', 'Gap');
CREATE TYPE setting_status AS ENUM ('Active', 'Draft', 'Paused');
CREATE TYPE setting_category AS ENUM ('Incentive', 'Incident SLA', 'Notification', 'Night Shift', 'Security');
CREATE TYPE audit_risk AS ENUM ('Low', 'Medium', 'High');

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email citext UNIQUE,
  phone text,
  role_id uuid NOT NULL REFERENCES roles(id),
  status text NOT NULL DEFAULT 'Active',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL UNIQUE,
  bairro text NOT NULL,
  riders_count integer NOT NULL DEFAULT 0 CHECK (riders_count >= 0),
  night_shift_level text NOT NULL DEFAULT 'Low',
  safety_score integer NOT NULL DEFAULT 75 CHECK (safety_score BETWEEN 0 AND 100),
  lat numeric(10, 7),
  lng numeric(10, 7),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL,
  phone text NOT NULL,
  ponto_id uuid REFERENCES pontos(id) ON DELETE SET NULL,
  riders_count integer NOT NULL DEFAULT 0 CHECK (riders_count >= 0),
  night_shift_coverage integer NOT NULL DEFAULT 0 CHECK (night_shift_coverage BETWEEN 0 AND 100),
  rating numeric(3, 2) NOT NULL DEFAULT 4.00 CHECK (rating BETWEEN 0 AND 5),
  level text NOT NULL DEFAULT 'New',
  join_date date NOT NULL DEFAULT current_date,
  incidents integer NOT NULL DEFAULT 0 CHECK (incidents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pontos
  ADD COLUMN leader_id uuid REFERENCES leaders(id) ON DELETE SET NULL;

CREATE TABLE whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL UNIQUE,
  bairro text NOT NULL DEFAULT 'Unassigned',
  ponto_id uuid REFERENCES pontos(id) ON DELETE SET NULL,
  leader_id uuid REFERENCES leaders(id) ON DELETE SET NULL,
  leader_phone text,
  riders_count integer NOT NULL DEFAULT 0 CHECK (riders_count >= 0),
  active_today integer NOT NULL DEFAULT 0 CHECK (active_today >= 0),
  night_coverage integer NOT NULL DEFAULT 0 CHECK (night_coverage BETWEEN 0 AND 100),
  risk_status whatsapp_risk_status NOT NULL DEFAULT 'Watch',
  coverage_status whatsapp_coverage_status NOT NULL DEFAULT 'Thin',
  last_sync_at timestamptz,
  pending_approvals integer NOT NULL DEFAULT 0 CHECK (pending_approvals >= 0),
  unread_alerts integer NOT NULL DEFAULT 0 CHECK (unread_alerts >= 0),
  broadcast_list text NOT NULL DEFAULT 'Manual Dispatch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL,
  cpf_ciphertext bytea,
  cpf_last4 text,
  pix_ciphertext bytea,
  pix_fingerprint text,
  phone text NOT NULL,
  bairro text NOT NULL DEFAULT '',
  ponto_id uuid REFERENCES pontos(id) ON DELETE SET NULL,
  leader_id uuid REFERENCES leaders(id) ON DELETE SET NULL,
  invited_by_rider_id uuid REFERENCES riders(id) ON DELETE SET NULL,
  invited_by_name text,
  whatsapp_group_id uuid REFERENCES whatsapp_groups(id) ON DELETE SET NULL,
  ar integer NOT NULL DEFAULT 100 CHECK (ar BETWEEN 0 AND 100),
  status rider_status NOT NULL DEFAULT 'Active',
  vehicle_type text NOT NULL DEFAULT 'Motorcycle',
  brand text NOT NULL DEFAULT 'Unknown',
  model text NOT NULL DEFAULT 'To confirm',
  rental_status text NOT NULL DEFAULT 'Unknown',
  is_mottu boolean NOT NULL DEFAULT false,
  online_hours integer NOT NULL DEFAULT 0 CHECK (online_hours >= 0),
  night_shift_count integer NOT NULL DEFAULT 0 CHECK (night_shift_count >= 0),
  incident_count integer NOT NULL DEFAULT 0 CHECK (incident_count >= 0),
  join_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  rider_id uuid REFERENCES riders(id) ON DELETE SET NULL,
  rider_name text NOT NULL,
  ponto_id uuid REFERENCES pontos(id) ON DELETE SET NULL,
  ponto_name text NOT NULL,
  severity incident_severity NOT NULL,
  status incident_status NOT NULL DEFAULT 'Open',
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  responder_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  responder_name text NOT NULL DEFAULT 'VENTO Ops Desk',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  rule_name text NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  type reward_target_type NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  recipient_type ledger_recipient_type NOT NULL,
  rider_id uuid REFERENCES riders(id) ON DELETE SET NULL,
  leader_id uuid REFERENCES leaders(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  ledger_type ledger_type NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  status ledger_status NOT NULL DEFAULT 'Pending',
  notes text NOT NULL DEFAULT '',
  idempotency_key text UNIQUE,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_recipient_reference_chk CHECK (
    (recipient_type = 'Rider' AND rider_id IS NOT NULL AND leader_id IS NULL)
    OR (recipient_type = 'Leader' AND leader_id IS NOT NULL AND rider_id IS NULL)
    OR (rider_id IS NULL AND leader_id IS NULL)
  )
);

CREATE TABLE crm_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL,
  category crm_partner_category NOT NULL,
  status crm_partner_status NOT NULL DEFAULT 'Prospect',
  tier crm_partner_tier NOT NULL DEFAULT 'Standard',
  contact_name text NOT NULL,
  phone text NOT NULL,
  bairro text NOT NULL DEFAULT 'Unassigned',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  owner_name text NOT NULL DEFAULT 'VENTO Partnerships',
  sla_hours integer NOT NULL DEFAULT 12 CHECK (sla_hours >= 0),
  monthly_volume integer NOT NULL DEFAULT 0 CHECK (monthly_volume >= 0),
  active_deals integer NOT NULL DEFAULT 0 CHECK (active_deals >= 0),
  vehicles_available integer NOT NULL DEFAULT 0 CHECK (vehicles_available >= 0),
  contract_renewal date,
  risk risk_level NOT NULL DEFAULT 'Medium',
  notes text NOT NULL DEFAULT '',
  services text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  category setting_category NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL DEFAULT '',
  status setting_status NOT NULL DEFAULT 'Draft',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  owner_name text NOT NULL DEFAULT 'Super Admin',
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, name)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  detail text NOT NULL DEFAULT '',
  risk audit_risk NOT NULL DEFAULT 'Low',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_riders_ponto_id ON riders(ponto_id);
CREATE INDEX idx_riders_leader_id ON riders(leader_id);
CREATE INDEX idx_riders_status ON riders(status);
CREATE INDEX idx_riders_cpf_last4 ON riders(cpf_last4);
CREATE INDEX idx_incidents_status_severity ON incidents(status, severity);
CREATE INDEX idx_incidents_rider_id ON incidents(rider_id);
CREATE INDEX idx_incidents_ponto_id ON incidents(ponto_id);
CREATE INDEX idx_ledger_entries_status ON ledger_entries(status);
CREATE INDEX idx_ledger_entries_recipient ON ledger_entries(recipient_type, recipient_name);
CREATE INDEX idx_crm_partners_category_risk ON crm_partners(category, risk);
CREATE INDEX idx_whatsapp_groups_ponto_id ON whatsapp_groups(ponto_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

INSERT INTO roles (name, description) VALUES
  ('Super Admin', 'Full workspace and demo administration'),
  ('Regional Manager', 'Regional operations management'),
  ('Ponto Manager', 'Local ponto operations management'),
  ('Leader', 'Rider group leadership'),
  ('Finance', 'Rewards and payout operations'),
  ('Support', 'Incident and support operations')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (code, label) VALUES
  ('view_dashboard', 'View dashboard'),
  ('manage_riders', 'Manage riders'),
  ('manage_pontos', 'Manage Pontos'),
  ('manage_leaders', 'Manage Leaders'),
  ('create_incidents', 'Create incidents'),
  ('close_incidents', 'Close incidents'),
  ('manage_rewards', 'Manage rewards'),
  ('view_finance', 'View finance'),
  ('view_analytics', 'View analytics'),
  ('view_audit', 'View audit'),
  ('reset_demo', 'Reset demo data')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (
  CASE r.name
    WHEN 'Super Admin' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'manage_pontos', 'manage_leaders',
      'create_incidents', 'close_incidents', 'manage_rewards', 'view_finance',
      'view_analytics', 'view_audit', 'reset_demo'
    ]
    WHEN 'Regional Manager' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'manage_pontos', 'manage_leaders',
      'create_incidents', 'close_incidents', 'manage_rewards', 'view_analytics',
      'view_audit'
    ]
    WHEN 'Ponto Manager' THEN ARRAY[
      'view_dashboard', 'manage_riders', 'create_incidents', 'close_incidents',
      'manage_rewards', 'view_analytics'
    ]
    WHEN 'Leader' THEN ARRAY['view_dashboard', 'create_incidents', 'view_analytics']
    WHEN 'Finance' THEN ARRAY[
      'view_dashboard', 'manage_rewards', 'view_finance', 'view_analytics',
      'view_audit'
    ]
    WHEN 'Support' THEN ARRAY[
      'view_dashboard', 'create_incidents', 'close_incidents', 'view_analytics',
      'view_audit'
    ]
    ELSE ARRAY[]::text[]
  END
)
ON CONFLICT DO NOTHING;
