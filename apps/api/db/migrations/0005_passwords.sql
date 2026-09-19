-- Password login. OTP now only proves phone ownership (signup + forgot
-- password); day-to-day login is phone + password.
--
-- password_hash is NULL for accounts created before this migration — they
-- set one by signing up again or via "Forgot password" (both prove the phone
-- with an OTP), so nobody is locked out.
-- password_set_at lets a one-time OTP proof be rejected once a password has
-- been set after it was issued (see apps/api/src/lib/otp-proof.ts).
-- failed_login_count / locked_until back the brute-force lockout.

ALTER TABLE users
  ADD COLUMN password_hash text,
  ADD COLUMN password_set_at timestamptz,
  ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;
