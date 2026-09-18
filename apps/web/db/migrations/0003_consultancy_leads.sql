-- Track 2: software consultancy scope estimator tickets.

CREATE TYPE deposit_status AS ENUM ('pending', 'paid');

CREATE TABLE consultancy_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone text NOT NULL REFERENCES users(phone) ON DELETE RESTRICT,
  ticket_ref text NOT NULL UNIQUE,
  selected_items jsonb NOT NULL,
  budget_low numeric(10, 2) NOT NULL,
  budget_high numeric(10, 2) NOT NULL,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  razorpay_order_id text,
  deposit_status deposit_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consultancy_leads_user_phone_idx ON consultancy_leads(user_phone);
