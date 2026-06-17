-- Eastwind (99Food) real-time monitor sync.
-- Three tables fed every ~5 min by the Playwright scraper via
-- POST /api/eastwind/rider-status (service_role only).
--
--   rider_status_snapshots  : one row per rider per capture batch (time series)
--   rider_kpi_snapshots     : one row per capture batch (header KPIs)
--   eastwind_deliveries     : one row per waybill, upserted as it progresses
--
-- All three keep the original JSON in `raw` so field mapping can be
-- back-filled/corrected later without re-scraping. RLS is enabled with no
-- policies, so only the server (service_role key) can read/write.

-- ---------------------------------------------------------------------------
-- 1. Rider status snapshots (骑手看板 — continuous state, snapshot model)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_status_snapshots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at   timestamptz NOT NULL,          -- batch time, aligned to 5 min
  city_id       text,                          -- e.g. 55000199
  rider_ext_id  text,                          -- riderID (join key)
  rider_name    text,                          -- riderName
  phone         text,                          -- phoneNumber
  id_no         text,                          -- idNo (national ID; stable join key)
  status        text,                          -- statusStr: Conectado / Entregando / Abaixo das expectativas …
  status_code   text,                          -- workStatus: 1=below expectations, 2=delivering, 4=online
  error_show    text,                          -- errorShow (secondary status text)
  shift_start   text,                          -- from slotPeriod "14:00"
  shift_end     text,                          -- "18:00"
  hot_zone      text,                          -- slotArea, e.g. "Santo Amaro"
  vehicle       text,                          -- vehicleType (Bicicleta / Motocicleta)
  shop_id       text,                          -- shopID
  shop_name     text,                          -- shopName
  online_mins   integer,                       -- currentShift seconds → minutes
  rest_mins     integer,                       -- riderRestTimeCnt seconds → minutes
  finished_cnt  integer,                       -- order (completed orders)
  lat           double precision,
  lng           double precision,
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_status_captured
  ON rider_status_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_status_rider
  ON rider_status_snapshots (rider_ext_id, captured_at DESC);

ALTER TABLE rider_status_snapshots ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE rider_status_snapshots IS
  'Eastwind rider monitor snapshots (5-min). Service-role only.';

-- ---------------------------------------------------------------------------
-- 2. Header KPI snapshots (AR / CAA / 接单量 / Overtime / %TSH / 完单数量)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_kpi_snapshots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at   timestamptz NOT NULL,
  city_id       text,
  ar            numeric,                        -- 78.6 (%)
  caa           numeric,                        -- 9.1 (%)
  accept_cnt    integer,                        -- 接单量
  overtime      numeric,                        -- 0.0 (%)
  tsh           numeric,                        -- %TSH
  finished_cnt  integer,                        -- 完单数量
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_kpi_captured
  ON rider_kpi_snapshots (captured_at DESC);

ALTER TABLE rider_kpi_snapshots ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE rider_kpi_snapshots IS
  'Eastwind rider board header KPIs (5-min). Service-role only.';

-- ---------------------------------------------------------------------------
-- 3. Deliveries / waybills (运单看板 — discrete events, upsert by order_no)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eastwind_deliveries (
  order_no            text PRIMARY KEY,         -- 运单号, e.g. 300001
  tracking_id         text,                     -- long tracking id
  city_id             text,
  merchant_name       text,                     -- 商家 / 加盟商
  rider_ext_id        text,
  rider_name          text,
  vehicle             text,                     -- 自行车 / ...
  status              text,                     -- 已超时 / 即将超时 / 正常 / ...
  -- delivery timeline (estimated DETA vs actual)
  t_assign            timestamptz,              -- 派单
  t_arrive_shop_eta   timestamptz,              -- 到店 (DETA)
  t_arrive_shop_act   timestamptz,              -- 到店 (实际到达)
  t_pickup_eta        timestamptz,              -- 取餐 (DETA)
  t_pickup_act        timestamptz,              -- 取餐 (实际)
  t_arrive_user_eta   timestamptz,              -- 到达用户 (DETA)
  t_arrive_user_act   timestamptz,              -- 到达用户 (实际)
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  raw                 jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eastwind_deliveries_rider
  ON eastwind_deliveries (rider_ext_id);
CREATE INDEX IF NOT EXISTS idx_eastwind_deliveries_merchant
  ON eastwind_deliveries (merchant_name);
CREATE INDEX IF NOT EXISTS idx_eastwind_deliveries_seen
  ON eastwind_deliveries (last_seen_at DESC);

ALTER TABLE eastwind_deliveries ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE eastwind_deliveries IS
  'Eastwind waybill monitor, upserted by order_no. Service-role only.';

-- Optional event log for timeout root-cause analysis (enable later if needed):
-- CREATE TABLE IF NOT EXISTS eastwind_delivery_events (
--   id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   order_no text NOT NULL,
--   status text,
--   captured_at timestamptz NOT NULL,
--   raw jsonb
-- );
