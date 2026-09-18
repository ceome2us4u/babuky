-- Users are keyed on phone (+91XXXXXXXXXX), tagged with the lead source(s)
-- they came in through, and complete a profile after their first OTP verify.
-- This is Babuki's own, self-contained user base — not part of any shared
-- identity graph.

CREATE TABLE users (
  phone text PRIMARY KEY,
  consent boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE lead_source AS ENUM ('MERCHANT', 'LOCAL_BUYER', 'CONSULTANCY_LEAD');

CREATE TABLE user_lead_sources (
  user_phone text NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  lead_source lead_source NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_phone, lead_source)
);

CREATE TYPE account_type AS ENUM ('business', 'individual');

CREATE TABLE user_profiles (
  user_phone text PRIMARY KEY REFERENCES users(phone) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL DEFAULT '',
  account_type account_type NOT NULL,
  business_name text NOT NULL DEFAULT '',
  city text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Opaque bearer-token sessions: the cookie holds the raw token, only its
-- HMAC (keyed by SESSION_SECRET) is stored here, so a DB leak alone can't
-- be replayed as a valid session. Logout / expiry are plain row deletes.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone text NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_phone_idx ON sessions(user_phone);
