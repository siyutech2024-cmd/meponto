-- Seed MePonto staging with representative operating data.
-- This data is intentionally non-sensitive and mirrors the app demo dataset.

WITH seed_pontos(external_id, name, bairro, riders_count, night_shift_level, safety_score, lat, lng) AS (
  VALUES
    ('p-001', 'Ponto Paulista Garage', 'Bela Vista', 84, 'High', 82, -23.5614, -46.6559),
    ('p-002', 'Ponto Liberdade Sul', 'Liberdade', 57, 'Medium', 74, -23.5587, -46.6358),
    ('p-003', 'Ponto Tatuape Norte', 'Tatuape', 63, 'Critical', 61, -23.5409, -46.5764),
    ('p-004', 'Ponto Pinheiros Base', 'Pinheiros', 49, 'Low', 88, -23.5663, -46.7019),
    ('p-005', 'Ponto Centro Intake', 'Republica', 36, 'Medium', 68, -23.5448, -46.6423)
)
INSERT INTO pontos (external_id, name, bairro, riders_count, night_shift_level, safety_score, lat, lng)
SELECT external_id, name, bairro, riders_count, night_shift_level, safety_score, lat, lng
FROM seed_pontos
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  bairro = EXCLUDED.bairro,
  riders_count = EXCLUDED.riders_count,
  night_shift_level = EXCLUDED.night_shift_level,
  safety_score = EXCLUDED.safety_score,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  updated_at = now();

WITH seed_leaders(external_id, name, phone, ponto_external_id, riders_count, night_shift_coverage, rating, level, join_date, incidents) AS (
  VALUES
    ('l-001', 'Rafael Costa', '+55 11 98822-1100', 'p-001', 32, 74, 4.8, 'Elite', DATE '2025-11-08', 2),
    ('l-002', 'Joao Pereira', '+55 11 97741-4512', 'p-002', 21, 56, 4.5, 'Senior', DATE '2026-01-18', 3),
    ('l-003', 'Marcos Lima', '+55 11 96532-8801', 'p-003', 29, 81, 4.7, 'Elite', DATE '2025-09-27', 5),
    ('l-004', 'Diego Alves', '+55 11 96740-9090', 'p-004', 18, 82, 4.4, 'Senior', DATE '2026-01-09', 1),
    ('l-005', 'Camila Nunes', '+55 11 97610-3344', 'p-005', 14, 39, 4.2, 'New', DATE '2026-04-12', 0)
)
INSERT INTO leaders (external_id, name, phone, ponto_id, riders_count, night_shift_coverage, rating, level, join_date, incidents)
SELECT l.external_id, l.name, l.phone, p.id, l.riders_count, l.night_shift_coverage, l.rating, l.level, l.join_date, l.incidents
FROM seed_leaders l
JOIN pontos p ON p.external_id = l.ponto_external_id
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  ponto_id = EXCLUDED.ponto_id,
  riders_count = EXCLUDED.riders_count,
  night_shift_coverage = EXCLUDED.night_shift_coverage,
  rating = EXCLUDED.rating,
  level = EXCLUDED.level,
  join_date = EXCLUDED.join_date,
  incidents = EXCLUDED.incidents,
  updated_at = now();

UPDATE pontos p
SET leader_id = l.id, updated_at = now()
FROM leaders l
WHERE l.ponto_id = p.id;

WITH seed_rooms(external_id, name, bairro, ponto_external_id, leader_external_id, leader_phone, riders_count, active_today, night_coverage, risk_status, coverage_status, last_activity_at, pending_approvals, unread_alerts, broadcast_list) AS (
  VALUES
    ('chat-001', 'MePonto Paulista 01', 'Bela Vista', 'p-001', 'l-001', '+55 11 98822-1100', 84, 71, 74, 'Stable'::chat_risk_status, 'Covered'::chat_coverage_status, TIMESTAMPTZ '2026-05-15 07:40:00-03', 3, 1, 'SP Core - Safety'),
    ('chat-002', 'MePonto Liberdade Noite', 'Liberdade', 'p-002', 'l-002', '+55 11 97741-4512', 57, 39, 56, 'Watch'::chat_risk_status, 'Thin'::chat_coverage_status, TIMESTAMPTZ '2026-05-15 06:55:00-03', 7, 4, 'Night Shift - East'),
    ('chat-003', 'MePonto Tatuape Risk', 'Tatuape', 'p-003', 'l-003', '+55 11 96532-8801', 63, 42, 43, 'Critical'::chat_risk_status, 'Gap'::chat_coverage_status, TIMESTAMPTZ '2026-05-15 05:18:00-03', 11, 9, 'Incident Escalation'),
    ('chat-004', 'MePonto Pinheiros 01', 'Pinheiros', 'p-004', 'l-004', '+55 11 96740-9090', 49, 44, 82, 'Stable'::chat_risk_status, 'Covered'::chat_coverage_status, TIMESTAMPTZ '2026-05-15 07:22:00-03', 1, 0, 'West Operations'),
    ('chat-005', 'MePonto Centro Intake', 'Republica', 'p-005', 'l-005', '+55 11 97610-3344', 36, 18, 39, 'Risk'::chat_risk_status, 'Gap'::chat_coverage_status, TIMESTAMPTZ '2026-05-14 23:50:00-03', 14, 6, 'New Rider Intake')
)
INSERT INTO chat_rooms (
  external_id, name, bairro, ponto_id, leader_id, leader_phone, riders_count,
  active_today, night_coverage, risk_status, coverage_status, last_activity_at,
  pending_approvals, unread_alerts, broadcast_list
)
SELECT r.external_id, r.name, r.bairro, p.id, l.id, r.leader_phone, r.riders_count,
  r.active_today, r.night_coverage, r.risk_status, r.coverage_status, r.last_activity_at,
  r.pending_approvals, r.unread_alerts, r.broadcast_list
FROM seed_rooms r
JOIN pontos p ON p.external_id = r.ponto_external_id
JOIN leaders l ON l.external_id = r.leader_external_id
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  bairro = EXCLUDED.bairro,
  ponto_id = EXCLUDED.ponto_id,
  leader_id = EXCLUDED.leader_id,
  leader_phone = EXCLUDED.leader_phone,
  riders_count = EXCLUDED.riders_count,
  active_today = EXCLUDED.active_today,
  night_coverage = EXCLUDED.night_coverage,
  risk_status = EXCLUDED.risk_status,
  coverage_status = EXCLUDED.coverage_status,
  last_activity_at = EXCLUDED.last_activity_at,
  pending_approvals = EXCLUDED.pending_approvals,
  unread_alerts = EXCLUDED.unread_alerts,
  broadcast_list = EXCLUDED.broadcast_list,
  updated_at = now();

WITH seed_riders(external_id, name, cpf_last4, pix_fingerprint, phone, bairro, ponto_external_id, leader_external_id, invited_by_name, chat_room_external_id, ar, status, vehicle_type, brand, model, rental_status, is_mottu, online_hours, night_shift_count, incident_count, join_date) AS (
  VALUES
    ('r-1001', 'Carlos Mendes', '8910', 'pix-carlos-demo', '+55 11 98423-9911', 'Bela Vista', 'p-001', 'l-001', 'Rafael Costa', 'chat-001', 96, 'Active'::rider_status, 'Motorcycle', 'Honda', 'CG 160', 'Owned', false, 178, 14, 1, DATE '2025-12-02'),
    ('r-1002', 'Andre Santos', '1499', 'pix-andre-demo', '+55 11 99555-1234', 'Liberdade', 'p-002', 'l-002', 'Carlos Mendes', 'chat-002', 88, 'Night Shift'::rider_status, 'Motorcycle', 'Yamaha', 'Factor 150', 'Rental', true, 203, 22, 0, DATE '2026-02-14'),
    ('r-1003', 'Felipe Rocha', '5231', 'pix-felipe-demo', '+55 11 91277-4420', 'Tatuape', 'p-003', 'l-003', 'Marcos Lima', 'chat-003', 71, 'Risk'::rider_status, 'Motorcycle', 'Honda', 'Fan 160', 'Rental', true, 132, 11, 3, DATE '2026-03-05'),
    ('r-1004', 'Mateus Oliveira', '4421', 'pix-mateus-demo', '+55 11 96740-9090', 'Pinheiros', 'p-004', 'l-004', 'Rafael Costa', 'chat-004', 92, 'Inactive'::rider_status, 'Motorcycle', 'Honda', 'Biz 125', 'Owned', false, 84, 4, 1, DATE '2026-01-09')
)
INSERT INTO riders (
  external_id, name, cpf_last4, pix_fingerprint, phone, bairro, ponto_id, leader_id,
  invited_by_name, chat_room_id, ar, status, vehicle_type, brand, model,
  rental_status, is_mottu, online_hours, night_shift_count, incident_count, join_date
)
SELECT r.external_id, r.name, r.cpf_last4, r.pix_fingerprint, r.phone, r.bairro, p.id, l.id,
  r.invited_by_name, c.id, r.ar, r.status, r.vehicle_type, r.brand, r.model,
  r.rental_status, r.is_mottu, r.online_hours, r.night_shift_count, r.incident_count, r.join_date
FROM seed_riders r
JOIN pontos p ON p.external_id = r.ponto_external_id
JOIN leaders l ON l.external_id = r.leader_external_id
JOIN chat_rooms c ON c.external_id = r.chat_room_external_id
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  cpf_last4 = EXCLUDED.cpf_last4,
  pix_fingerprint = EXCLUDED.pix_fingerprint,
  phone = EXCLUDED.phone,
  bairro = EXCLUDED.bairro,
  ponto_id = EXCLUDED.ponto_id,
  leader_id = EXCLUDED.leader_id,
  invited_by_name = EXCLUDED.invited_by_name,
  chat_room_id = EXCLUDED.chat_room_id,
  ar = EXCLUDED.ar,
  status = EXCLUDED.status,
  vehicle_type = EXCLUDED.vehicle_type,
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  rental_status = EXCLUDED.rental_status,
  is_mottu = EXCLUDED.is_mottu,
  online_hours = EXCLUDED.online_hours,
  night_shift_count = EXCLUDED.night_shift_count,
  incident_count = EXCLUDED.incident_count,
  join_date = EXCLUDED.join_date,
  updated_at = now();

WITH seed_incidents(external_id, rider_external_id, rider_name, ponto_external_id, ponto_name, severity, status, location, description, responder_name, opened_at, closed_at) AS (
  VALUES
    ('inc-9001', 'r-1003', 'Felipe Rocha', 'p-003', 'Ponto Tatuape Norte', 'Critical'::incident_severity, 'Open'::incident_status, 'Av. Celso Garcia, Tatuape', 'Night shift crash reported by Leader. Rider is conscious.', 'Regional Manager SP-East', TIMESTAMPTZ '2026-05-15 01:42:00-03', NULL::timestamptz),
    ('inc-9002', 'r-1001', 'Carlos Mendes', 'p-001', 'Ponto Paulista Garage', 'Medium'::incident_severity, 'Processing'::incident_status, 'Rua Augusta, Bela Vista', 'Vehicle breakdown. Tow truck requested.', 'Ponto Manager Paulista', TIMESTAMPTZ '2026-05-14 22:11:00-03', NULL::timestamptz),
    ('inc-9003', 'r-1004', 'Mateus Oliveira', 'p-004', 'Ponto Pinheiros Base', 'Low'::incident_severity, 'Closed'::incident_status, 'Largo da Batata, Pinheiros', 'Minor phone loss report. Account secured.', 'Support Desk', TIMESTAMPTZ '2026-05-13 18:28:00-03', TIMESTAMPTZ '2026-05-13 19:04:00-03')
)
INSERT INTO incidents (
  external_id, rider_id, rider_name, ponto_id, ponto_name, severity, status,
  location, description, responder_name, opened_at, closed_at, created_at
)
SELECT i.external_id, r.id, i.rider_name, p.id, i.ponto_name, i.severity, i.status,
  i.location, i.description, i.responder_name, i.opened_at, i.closed_at, i.opened_at
FROM seed_incidents i
LEFT JOIN riders r ON r.external_id = i.rider_external_id
LEFT JOIN pontos p ON p.external_id = i.ponto_external_id
ON CONFLICT (external_id) DO UPDATE SET
  rider_id = EXCLUDED.rider_id,
  rider_name = EXCLUDED.rider_name,
  ponto_id = EXCLUDED.ponto_id,
  ponto_name = EXCLUDED.ponto_name,
  severity = EXCLUDED.severity,
  status = EXCLUDED.status,
  location = EXCLUDED.location,
  description = EXCLUDED.description,
  responder_name = EXCLUDED.responder_name,
  opened_at = EXCLUDED.opened_at,
  closed_at = EXCLUDED.closed_at,
  updated_at = now();

INSERT INTO rewards (external_id, rule_name, points, type, active)
VALUES
  ('rw-01', 'Night Shift Completion', 40, 'Rider', true),
  ('rw-02', 'Incident Response Under 10m', 80, 'Leader', true),
  ('rw-03', 'High AR Weekly', 55, 'Rider', true)
ON CONFLICT (external_id) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  points = EXCLUDED.points,
  type = EXCLUDED.type,
  active = EXCLUDED.active,
  updated_at = now();

WITH seed_ledger(external_id, recipient_type, rider_external_id, leader_external_id, recipient_name, ledger_type, amount_cents, status, notes, created_at) AS (
  VALUES
    ('led-001', 'Rider'::ledger_recipient_type, 'r-1002', NULL, 'Andre Santos', 'Reward'::ledger_type, 12000, 'Paid'::ledger_status, 'Night shift completion bonus', TIMESTAMPTZ '2026-05-14 10:20:00-03'),
    ('led-002', 'Leader'::ledger_recipient_type, NULL, 'l-001', 'Rafael Costa', 'Leader Commission'::ledger_type, 26000, 'Approved'::ledger_status, 'Weekly team coverage commission', TIMESTAMPTZ '2026-05-14 12:05:00-03'),
    ('led-003', 'Rider'::ledger_recipient_type, 'r-1003', NULL, 'Felipe Rocha', 'Subsidy'::ledger_type, 8000, 'Pending'::ledger_status, 'Accident support subsidy', TIMESTAMPTZ '2026-05-15 08:30:00-03')
)
INSERT INTO ledger_entries (
  external_id, recipient_type, rider_id, leader_id, recipient_name, ledger_type,
  amount_cents, status, notes, idempotency_key, created_at
)
SELECT le.external_id, le.recipient_type, r.id, l.id, le.recipient_name, le.ledger_type,
  le.amount_cents, le.status, le.notes, le.external_id, le.created_at
FROM seed_ledger le
LEFT JOIN riders r ON r.external_id = le.rider_external_id
LEFT JOIN leaders l ON l.external_id = le.leader_external_id
ON CONFLICT (external_id) DO UPDATE SET
  recipient_type = EXCLUDED.recipient_type,
  rider_id = EXCLUDED.rider_id,
  leader_id = EXCLUDED.leader_id,
  recipient_name = EXCLUDED.recipient_name,
  ledger_type = EXCLUDED.ledger_type,
  amount_cents = EXCLUDED.amount_cents,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO crm_partners (
  external_id, name, category, status, tier, contact_name, phone, bairro,
  owner_name, sla_hours, monthly_volume, active_deals, vehicles_available,
  contract_renewal, risk, notes, services
)
VALUES
  ('crm-001', 'Oficina Paulista 24h', 'Repair Shop', 'Active', 'Preferred', 'Marina Lopes', '+55 11 94402-8800', 'Bela Vista', 'Ops Desk SP-Centro', 3, 46, 2, 0, DATE '2026-08-30', 'Low', 'Night breakdown priority lane for Paulista and Liberdade pontos.', ARRAY['Tires', 'Emergency repair', 'Tow handoff']),
  ('crm-002', 'Motos Liberdade Trade', 'Partner Vehicle Shop', 'Active', 'Strategic', 'Henrique Sato', '+55 11 98831-4108', 'Liberdade', 'Fleet Partnerships', 8, 28, 5, 17, DATE '2026-11-15', 'Low', 'Used CG and Factor sourcing partner for fast rider onboarding.', ARRAY['Vehicle sourcing', 'Trade-in', 'Inspection']),
  ('crm-003', 'SupriMoto Tatuape', 'Supplier', 'Review', 'Watchlist', 'Bruno Nascimento', '+55 11 97640-2219', 'Tatuape', 'Procurement', 24, 136, 1, 0, DATE '2026-06-20', 'High', 'Helmet stockouts reported twice this month; pricing under review.', ARRAY['Helmets', 'Rain gear', 'Brake pads']),
  ('crm-004', 'Mottu SP East Desk', 'Vehicle Partner', 'Active', 'Strategic', 'Carla Ribeiro', '+55 11 93319-7450', 'Tatuape', 'Regional Manager SP-East', 6, 63, 4, 22, DATE '2027-01-31', 'Medium', 'Rental queue synced weekly with high-AR riders and night-shift demand.', ARRAY['Rental fleet', 'Swap routing', 'Damage review']),
  ('crm-005', 'Pinheiros Moto Care', 'Repair Shop', 'Prospect', 'Standard', 'Lucas Duarte', '+55 11 95574-0901', 'Pinheiros', 'Ponto Manager Pinheiros', 12, 12, 1, 0, DATE '2026-07-10', 'Medium', 'Pilot partner for west-side preventive maintenance blocks.', ARRAY['Preventive maintenance', 'Oil', 'Electrical'])
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  tier = EXCLUDED.tier,
  contact_name = EXCLUDED.contact_name,
  phone = EXCLUDED.phone,
  bairro = EXCLUDED.bairro,
  owner_name = EXCLUDED.owner_name,
  sla_hours = EXCLUDED.sla_hours,
  monthly_volume = EXCLUDED.monthly_volume,
  active_deals = EXCLUDED.active_deals,
  vehicles_available = EXCLUDED.vehicles_available,
  contract_renewal = EXCLUDED.contract_renewal,
  risk = EXCLUDED.risk,
  notes = EXCLUDED.notes,
  services = EXCLUDED.services,
  updated_at = now();

INSERT INTO settings (external_id, category, name, value, unit, status, owner_name, description, updated_at)
VALUES
  ('set-001', 'Incentive', 'Night Shift Completion Bonus', '120', 'BRL', 'Active', 'Finance Ops', 'Default reward for verified full night shift coverage.', TIMESTAMPTZ '2026-05-15 09:00:00-03'),
  ('set-002', 'Incident SLA', 'Critical Incident First Response', '10', 'minutes', 'Active', 'Support Desk', 'Maximum first-contact SLA for critical rider incidents.', TIMESTAMPTZ '2026-05-15 09:20:00-03'),
  ('set-003', 'Notification', 'In-App Chat Broadcast Throttle', '3', 'messages/hour', 'Active', 'Regional Manager', 'Limits broadcast pressure per in-app chat room during normal operations.', TIMESTAMPTZ '2026-05-15 10:05:00-03'),
  ('set-004', 'Night Shift', 'Risk Area Score Threshold', '50', 'risk score', 'Active', 'Ops Desk SP-East', 'Ponto risk score where an area enters active night watch.', TIMESTAMPTZ '2026-05-15 10:30:00-03'),
  ('set-005', 'Security', 'Login Attempt Limit', '5', 'attempts', 'Draft', 'Security Ops', 'Maximum failed login attempts before challenge or block.', TIMESTAMPTZ '2026-05-15 11:10:00-03')
ON CONFLICT (external_id) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  value = EXCLUDED.value,
  unit = EXCLUDED.unit,
  status = EXCLUDED.status,
  owner_name = EXCLUDED.owner_name,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;

WITH room AS (
  SELECT id FROM chat_rooms WHERE external_id = 'chat-003'
)
INSERT INTO chat_messages (room_id, sender_name, sender_role, body, status, created_at)
SELECT room.id, msg.sender_name, msg.sender_role, msg.body, msg.status, msg.created_at
FROM room
CROSS JOIN (
  VALUES
    ('Ops Desk SP-East', 'HQ', 'Confirm the riders available for the Tatuape night safety pulse.', 'Action Required', TIMESTAMPTZ '2026-05-15 21:42:00-03'),
    ('Marcos Lima', 'Leader', '42 riders online. Three riders need a battery and location recheck.', 'Read', TIMESTAMPTZ '2026-05-15 21:45:00-03'),
    ('Support Desk', 'Support', 'Incident escalation lane is open inside PontoSys. Use the SOS action for critical cases.', 'Delivered', TIMESTAMPTZ '2026-05-15 21:47:00-03')
) AS msg(sender_name, sender_role, body, status, created_at)
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_messages existing
  WHERE existing.room_id = room.id
    AND existing.sender_name = msg.sender_name
    AND existing.created_at = msg.created_at
);

INSERT INTO audit_logs (external_id, actor_name, action, entity, entity_id, detail, risk, metadata, created_at)
VALUES
  ('aud-seed-001', 'Codex Setup', 'SEED_STAGING_DATABASE', 'Supabase', 'knjzvrquiksdyhzrlpsw', 'Initial staging seed data inserted for deployment readiness.', 'Low', '{"source":"migration"}'::jsonb, now())
ON CONFLICT (external_id) DO NOTHING;
