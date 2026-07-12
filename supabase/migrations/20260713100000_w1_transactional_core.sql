-- M2 / Wave 1 step 1 (docs/data-core-cure-plan.md §3 W1, phase2 draft):
-- transactional core tables + atomic RPCs. NOTHING calls these yet — this
-- migration is deliberately zero-risk (phase2 §4 M1: "建表 + RPC 上线,无人调用").
-- Rollout flag: CORE_MODE_TXCORE (off → dualwrite → read).
--
-- Ledger semantics mirror app/lib/points.ts:
--   available = Σ(earn+refund+release+adjust) − Σ(spend+expire+reverse+hold)
--   over status='approved' rows.
-- NOTE: DELETE is blocked (append-only), but UPDATE stays allowed during the
-- dual-write window — the legacy pipeline mutates entries in place
-- (pending→approved, balanceAfter), and the mirror upserts must follow.
-- UPDATE gets blocked in the final W1 step once legacy writes stop.

-- ============ points_ledger ============
CREATE TABLE IF NOT EXISTS points_ledger (
  id            text PRIMARY KEY,
  rider_id      text NOT NULL,
  account_id    text NOT NULL DEFAULT '',
  type          text NOT NULL CHECK (type IN ('earn','spend','refund','expire','reverse','adjust','hold','release')),
  points        integer NOT NULL,
  status        text NOT NULL CHECK (status IN ('pending','approved','rejected','reversed')),
  source_type   text NOT NULL DEFAULT '',
  source_id     text NOT NULL DEFAULT '',
  partner_id    text,
  marketplace_order_id text,
  campaign_id   text,
  expires_at    text,
  balance_after integer NOT NULL DEFAULT 0,
  reason_code   text NOT NULL DEFAULT '',
  note          text NOT NULL DEFAULT '',
  created_by    text NOT NULL DEFAULT '',
  created_at    text NOT NULL DEFAULT '',
  approved_by   text,
  approved_at   text
);
CREATE INDEX IF NOT EXISTS idx_pl_rider   ON points_ledger (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pl_source  ON points_ledger (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_pl_order   ON points_ledger (marketplace_order_id) WHERE marketplace_order_id IS NOT NULL;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
-- Append-only floor: deletes are blocked for everyone, including service_role.
CREATE OR REPLACE RULE points_ledger_no_delete AS ON DELETE TO points_ledger DO INSTEAD NOTHING;

-- ============ points_balances（余额快照,消灭全量求和）============
CREATE TABLE IF NOT EXISTS points_balances (
  rider_id   text PRIMARY KEY,
  available  integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE points_balances ENABLE ROW LEVEL SECURITY;

-- ============ marketplace_orders ============
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id              text PRIMARY KEY,
  account_type    text NOT NULL DEFAULT 'rider' CHECK (account_type IN ('rider','partner')),
  rider_id        text,
  partner_id      text,
  product_id      text NOT NULL,
  product_name    text NOT NULL DEFAULT '',
  rider_name      text NOT NULL DEFAULT '',
  points_spent    integer NOT NULL DEFAULT 0 CHECK (points_spent >= 0),
  cash_due        numeric,
  status          text NOT NULL DEFAULT 'created' CHECK (status IN ('created','arrived','fulfilled','cancelled')),
  payment_status  text CHECK (payment_status IN ('pending','submitted','paid')),
  review_status   text CHECK (review_status IN ('pending','approved','rejected')),
  coupon_id       text,
  coupon_discount integer,
  pickup_store_id text,
  station         text NOT NULL DEFAULT '',
  franchise       text NOT NULL DEFAULT '',
  voucher_code    text,
  idempotency_key text UNIQUE,
  created_at      text NOT NULL DEFAULT '',
  arrived_at      text,
  picked_up_at    text,
  -- Low-frequency legacy fields ride here so schema changes stay rare.
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_mo_rider   ON marketplace_orders (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mo_station ON marketplace_orders (station, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mo_open    ON marketplace_orders (status) WHERE status IN ('created','arrived');
ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;

-- ============ station_stock（库存池;当前产品 stationStockEnforcement 默认关,
-- 表先就位,启用 enforcement 的 Wave 再回填种子）============
CREATE TABLE IF NOT EXISTS station_stock (
  station_id text NOT NULL,
  product_id text NOT NULL,
  mode       text NOT NULL DEFAULT 'standard',
  qty        integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  reserved   integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, product_id, mode),
  CHECK (reserved <= qty)
);
ALTER TABLE station_stock ENABLE ROW LEVEL SECURITY;

-- ============ Backfill: JSONB mirror → tables ============
INSERT INTO points_ledger (id, rider_id, account_id, type, points, status,
  source_type, source_id, partner_id, marketplace_order_id, campaign_id,
  expires_at, balance_after, reason_code, note, created_by, created_at,
  approved_by, approved_at)
SELECT
  data->>'id', data->>'riderId', coalesce(data->>'accountId', ''),
  data->>'type', coalesce((data->>'points')::numeric, 0)::integer, data->>'status',
  coalesce(data->>'sourceType', ''), coalesce(data->>'sourceId', ''),
  data->>'partnerId', data->>'marketplaceOrderId', data->>'campaignId',
  data->>'expiresAt', coalesce((data->>'balanceAfter')::numeric, 0)::integer,
  coalesce(data->>'reasonCode', ''), coalesce(data->>'note', ''),
  coalesce(data->>'createdBy', ''), coalesce(data->>'createdAt', ''),
  data->>'approvedBy', data->>'approvedAt'
FROM app_state_records
WHERE collection = 'pointsLedgerEntries'
  AND data->>'id' IS NOT NULL AND data->>'riderId' IS NOT NULL
  AND data->>'type' IN ('earn','spend','refund','expire','reverse','adjust','hold','release')
  AND data->>'status' IN ('pending','approved','rejected','reversed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace_orders (id, account_type, rider_id, partner_id, product_id,
  product_name, rider_name, points_spent, cash_due, status, payment_status,
  review_status, coupon_id, coupon_discount, pickup_store_id, station, franchise,
  voucher_code, created_at, arrived_at, picked_up_at, extra)
SELECT
  data->>'id', coalesce(data->>'accountType', 'rider'), data->>'riderId', data->>'partnerId',
  coalesce(data->>'productId', ''), coalesce(data->>'productName', ''),
  coalesce(data->>'riderName', ''),
  greatest(0, coalesce((data->>'pointsSpent')::numeric, 0))::integer,
  (data->>'cashDue')::numeric, coalesce(data->>'status', 'created'),
  data->>'paymentStatus', data->>'reviewStatus', data->>'couponId',
  (data->>'couponDiscount')::numeric::integer, data->>'pickupStoreId',
  coalesce(data->>'station', ''), coalesce(data->>'franchise', ''),
  data->>'voucherCode', coalesce(data->>'createdAt', ''),
  data->>'arrivedAt', data->>'pickedUpAt',
  data - ARRAY['id','accountType','riderId','partnerId','productId','productName',
    'riderName','pointsSpent','cashDue','status','paymentStatus','reviewStatus',
    'couponId','couponDiscount','pickupStoreId','station','franchise',
    'voucherCode','createdAt','arrivedAt','pickedUpAt']
FROM app_state_records
WHERE collection = 'marketplaceOrders'
  AND data->>'id' IS NOT NULL
  AND coalesce(data->>'status', 'created') IN ('created','arrived','fulfilled','cancelled')
ON CONFLICT (id) DO NOTHING;

-- Balances derived from the ledger (app/lib/points.ts semantics).
INSERT INTO points_balances (rider_id, available)
SELECT rider_id,
  greatest(0, sum(CASE
    WHEN type IN ('earn','refund','release','adjust') THEN points
    WHEN type IN ('spend','expire','reverse','hold') THEN -points
    ELSE 0 END))::integer
FROM points_ledger
WHERE status = 'approved'
GROUP BY rider_id
ON CONFLICT (rider_id) DO UPDATE
  SET available = EXCLUDED.available, updated_at = now();

-- ============ Atomic redeem (phase2 §3 — 行锁 + CHECK 双保险,杜绝双花/超卖) ============
CREATE OR REPLACE FUNCTION redeem_order(
  p_order_id text, p_rider_id text, p_product_id text, p_points integer,
  p_station_id text, p_mode text, p_idempotency_key text,
  p_enforce_stock boolean DEFAULT false, p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS marketplace_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order marketplace_orders;
  v_balance integer;
BEGIN
  -- Idempotency: same key returns the existing order (client retries safe).
  SELECT * INTO v_order FROM marketplace_orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_order; END IF;

  -- 1. Atomic balance deduction (row lock; UPDATE matches only when funded).
  IF p_points > 0 THEN
    UPDATE points_balances SET available = available - p_points, updated_at = now()
     WHERE rider_id = p_rider_id AND available >= p_points;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_POINTS'; END IF;
  END IF;

  -- 2. Atomic stock reservation (optional — mirrors stationStockEnforcement).
  IF p_enforce_stock THEN
    UPDATE station_stock SET reserved = reserved + 1, updated_at = now()
     WHERE station_id = p_station_id AND product_id = p_product_id
       AND mode = p_mode AND qty - reserved >= 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;
  END IF;

  -- 3. Ledger spend + order, same transaction.
  IF p_points > 0 THEN
    SELECT available INTO v_balance FROM points_balances WHERE rider_id = p_rider_id;
    INSERT INTO points_ledger (id, rider_id, account_id, type, points, status,
      source_type, source_id, marketplace_order_id, balance_after, reason_code,
      note, created_by, created_at)
    VALUES (p_order_id || ':spend', p_rider_id, 'pts-' || p_rider_id, 'spend',
      p_points, 'approved', 'marketplace_order', p_order_id, p_order_id,
      coalesce(v_balance, 0), 'MALL_REDEMPTION', 'redeem_order RPC',
      'redeem_order', to_char(now(), 'YYYY-MM-DD HH24:MI'));
  END IF;

  INSERT INTO marketplace_orders (id, account_type, rider_id, product_id,
    points_spent, station, idempotency_key, created_at, extra)
  VALUES (p_order_id, 'rider', p_rider_id, p_product_id, p_points,
    coalesce(p_station_id, ''), p_idempotency_key,
    to_char(now(), 'YYYY-MM-DD HH24:MI'), coalesce(p_extra, '{}'::jsonb))
  RETURNING * INTO v_order;

  RETURN v_order;
END $$;

-- ============ Symmetric release (cancel / review-reject) ============
CREATE OR REPLACE FUNCTION release_order(
  p_order_id text, p_restock boolean DEFAULT false,
  p_station_id text DEFAULT NULL, p_mode text DEFAULT 'standard'
) RETURNS marketplace_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order marketplace_orders;
  v_balance integer;
BEGIN
  SELECT * INTO v_order FROM marketplace_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'cancelled' THEN RETURN v_order; END IF; -- idempotent

  IF v_order.points_spent > 0 AND v_order.rider_id IS NOT NULL THEN
    INSERT INTO points_balances (rider_id, available)
    VALUES (v_order.rider_id, v_order.points_spent)
    ON CONFLICT (rider_id) DO UPDATE
      SET available = points_balances.available + EXCLUDED.available, updated_at = now();
    SELECT available INTO v_balance FROM points_balances WHERE rider_id = v_order.rider_id;
    -- One refund per order, ever (deterministic id).
    INSERT INTO points_ledger (id, rider_id, account_id, type, points, status,
      source_type, source_id, marketplace_order_id, balance_after, reason_code,
      note, created_by, created_at)
    VALUES (p_order_id || ':refund', v_order.rider_id, 'pts-' || v_order.rider_id,
      'refund', v_order.points_spent, 'approved', 'marketplace_order', p_order_id,
      p_order_id, coalesce(v_balance, 0), 'MALL_REFUND', 'release_order RPC',
      'release_order', to_char(now(), 'YYYY-MM-DD HH24:MI'))
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF p_restock AND p_station_id IS NOT NULL THEN
    UPDATE station_stock SET reserved = greatest(0, reserved - 1), updated_at = now()
     WHERE station_id = p_station_id AND product_id = v_order.product_id AND mode = p_mode;
  END IF;

  UPDATE marketplace_orders SET status = 'cancelled' WHERE id = p_order_id
  RETURNING * INTO v_order;
  RETURN v_order;
END $$;

-- ============ Invariant check（对账 cron 调用）============
-- Mismatches between the balances snapshot and the ledger recomputation.
CREATE OR REPLACE FUNCTION txcore_balance_check()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH recomputed AS (
    SELECT rider_id,
      greatest(0, sum(CASE
        WHEN type IN ('earn','refund','release','adjust') THEN points
        WHEN type IN ('spend','expire','reverse','hold') THEN -points
        ELSE 0 END))::integer AS should_be
    FROM points_ledger WHERE status = 'approved' GROUP BY rider_id
  ), mismatches AS (
    SELECT coalesce(b.rider_id, r.rider_id) AS rider_id,
           coalesce(b.available, 0) AS snapshot, coalesce(r.should_be, 0) AS ledger
    FROM points_balances b FULL OUTER JOIN recomputed r ON b.rider_id = r.rider_id
    WHERE coalesce(b.available, 0) <> coalesce(r.should_be, 0)
  )
  SELECT jsonb_build_object(
    'mismatchCount', (SELECT count(*) FROM mismatches),
    'samples', coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM (SELECT * FROM mismatches LIMIT 5) m), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION redeem_order(text,text,text,integer,text,text,text,boolean,jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION release_order(text,boolean,text,text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION txcore_balance_check() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_order(text,text,text,integer,text,text,text,boolean,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION release_order(text,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION txcore_balance_check() TO service_role;

-- Recompute the balances projection for specific riders (dual-write mirror
-- calls this after upserting ledger rows, keeping points_balances a pure
-- function of points_ledger throughout the window).
CREATE OR REPLACE FUNCTION txcore_recompute_balances(p_rider_ids text[])
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH recomputed AS (
    SELECT r.rider_id,
      greatest(0, coalesce(sum(CASE
        WHEN l.type IN ('earn','refund','release','adjust') THEN l.points
        WHEN l.type IN ('spend','expire','reverse','hold') THEN -l.points
        ELSE 0 END) FILTER (WHERE l.status = 'approved'), 0))::integer AS available
    FROM unnest(p_rider_ids) AS r(rider_id)
    LEFT JOIN points_ledger l ON l.rider_id = r.rider_id
    GROUP BY r.rider_id
  ), upserted AS (
    INSERT INTO points_balances (rider_id, available)
    SELECT rider_id, available FROM recomputed
    ON CONFLICT (rider_id) DO UPDATE
      SET available = EXCLUDED.available, updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM upserted;
$$;
REVOKE EXECUTE ON FUNCTION txcore_recompute_balances(text[]) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION txcore_recompute_balances(text[]) TO service_role;
