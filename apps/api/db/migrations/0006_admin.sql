-- Internal admin console (babuki.com/admin): where the founder sees every
-- enquiry with all its inputs. Admin identity is deliberately separate from
-- customer accounts (phone-based) — its own table, its own sessions, its own
-- cookie — so a customer session can never be an admin session.

-- Who may log in is an allowlist in the API's env (ADMIN_EMAILS); this table
-- holds the password hash for those emails (set out-of-band with
-- scripts/set-admin-password.sh — there is no signup path for admins).
CREATE TABLE admin_users (
  email text PRIMARY KEY,
  password_hash text NOT NULL,
  password_set_at timestamptz NOT NULL DEFAULT now(),
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL REFERENCES admin_users(email) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every change an admin makes (status, notes) is recorded — same idea as
-- Home's admin_actions audit table.
CREATE TABLE admin_actions (
  id bigserial PRIMARY KEY,
  admin_email text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_actions_created_idx ON admin_actions(created_at DESC);

-- "Contact us" form messages. Until now the form validated and then dropped
-- the message; now each one is stored so it can be seen and followed up.
CREATE TABLE contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'closed')),
  admin_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_messages_created_idx ON contact_messages(created_at DESC);

-- Follow-up tracking on estimator requests (a lead is stored the moment the
-- customer presses "Pay ₹100 & book", before they've paid).
ALTER TABLE consultancy_leads
  ADD COLUMN status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  ADD COLUMN admin_notes text NOT NULL DEFAULT '',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX consultancy_leads_created_idx ON consultancy_leads(created_at DESC);
