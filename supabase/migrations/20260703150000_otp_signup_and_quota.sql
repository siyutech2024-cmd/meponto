-- Unified phone-first signup + SMS quota, on top of otp_challenges.
--  * signup_data: pending registration payload (name/inviterId/birthday/googleSub)
--    carried with the challenge — the member record is only created after the
--    phone is OTP-verified (kills phone-squatting and referral-points farming).
--  * send_count / window_start: per-phone daily SMS budget (anti SMS-pumping).

ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS signup_data jsonb;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS window_start bigint NOT NULL DEFAULT 0;
