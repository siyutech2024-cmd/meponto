-- OTP challenges for member login (phone + SMS code).
-- Replaces the in-memory Map in /api/member-login: on serverless (Vercel) the
-- request that verifies a code may land on a different instance than the one
-- that issued it, so challenges must live in shared storage.
-- Service-role only: RLS enabled with no policies (same pattern as
-- app_state_records). Timestamps are epoch-milliseconds to round-trip the
-- existing app logic unchanged.

CREATE TABLE IF NOT EXISTS otp_challenges (
  phone text PRIMARY KEY,            -- normalized BR E.164 digits (55…)
  code text NOT NULL,
  expires_at bigint NOT NULL,        -- epoch ms
  attempts integer NOT NULL DEFAULT 0,
  last_sent_at bigint NOT NULL,      -- epoch ms
  rebind_rider_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE otp_challenges IS
  'One pending SMS login code per phone. Service-role only; short-lived rows.';
