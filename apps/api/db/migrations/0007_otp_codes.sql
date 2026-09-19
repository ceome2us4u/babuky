-- One-time phone codes, generated and checked by Babuki itself.
--
-- The SMS goes out through MSG91's Flow API using an existing DLT-approved
-- template (currently the one Me2Us4U's other product already has approved:
-- "##number## is your Me2Us4U verification code..."). That template has a
-- merge variable called `number`, which MSG91's own /otp endpoint can't drive,
-- so the code is ours: we make it, MSG91 only delivers it, and we verify it here.

-- At most one live code per phone + purpose (a new send replaces the old one).
-- Only a keyed hash of the code is stored, never the code itself.
CREATE TABLE otp_codes (
  phone text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'reset')),
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (phone, purpose)
);

-- A log of sends, so the per-phone limits (one every 30 s, five an hour) hold
-- across restarts — every real SMS costs money and is a favourite abuse target.
CREATE TABLE otp_sends (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX otp_sends_phone_created_idx ON otp_sends(phone, created_at DESC);
