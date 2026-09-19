-- "Own web address" plan (₹1,500/mo): a real domain (sreeram.in) that Babuki
-- registers and OWNS, licensed to the shop while its subscription is active.
-- The whole feature sits behind FEATURE_OWN_DOMAIN (lib/features.ts); with the
-- switch off nothing here is reachable and every shop stays 'standard'.

CREATE TYPE shop_plan AS ENUM ('standard', 'premium');

-- Which plan the shop is on (drives the Razorpay plan /subscribe uses).
ALTER TABLE shops ADD COLUMN plan shop_plan NOT NULL DEFAULT 'standard';
-- Which plan each subscription pays for, so an upgrade (a second, premium
-- subscription on the same shop) can be told apart from the ₹500 one.
ALTER TABLE shop_subscriptions ADD COLUMN plan shop_plan NOT NULL DEFAULT 'standard';

-- held          chosen at signup/upgrade, waiting for the first payment
-- registering   paid; buying it from the registrar
-- dns_pending   bought; pointing its DNS at the box
-- cert_pending  DNS set; the box's certificate job is issuing HTTPS
-- active        served at https://<domain>
-- grace         subscription lapsed; kept for GRACE_DAYS, then released
-- released      no longer ours to serve (auto-renew off; lapses at expiry)
-- failed        couldn't be bought (e.g. taken or over budget at payment time)
CREATE TYPE domain_status AS ENUM
  ('held', 'registering', 'dns_pending', 'cert_pending', 'active', 'grace', 'released', 'failed');

CREATE TABLE shop_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  domain text NOT NULL,                  -- lower-case, e.g. sreeram.in
  status domain_status NOT NULL DEFAULT 'held',
  held_until timestamptz,                -- a hold stops blocking others after this
  registrar text NOT NULL DEFAULT 'porkbun',
  cost_cents integer,                    -- what the registration cost us (USD cents)
  renewal_cents integer,                 -- last seen yearly renewal price (USD cents)
  expires_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT true,
  grace_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  -- Something a person should look at (renewal price over budget, a failed
  -- registration...). Shown in the admin console; never shown to the merchant.
  alert text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One live claim per domain across all shops, and one live domain per shop.
CREATE UNIQUE INDEX shop_domains_domain_live_uq ON shop_domains(domain) WHERE status NOT IN ('released', 'failed');
CREATE UNIQUE INDEX shop_domains_shop_live_uq ON shop_domains(shop_id) WHERE status NOT IN ('released', 'failed');
CREATE INDEX shop_domains_work_idx ON shop_domains(status, next_attempt_at);

-- A premium name ("On request" in the search) links to the estimator with
-- ?domain=...; the lead remembers which address the customer asked about.
ALTER TABLE consultancy_leads ADD COLUMN requested_domain text NOT NULL DEFAULT '';
