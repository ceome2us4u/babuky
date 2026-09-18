-- Track 1: hyperlocal vendor storefronts, geolocated for PostGIS radius search.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE shop_mode AS ENUM ('display', 'order');
CREATE TYPE shop_status AS ENUM ('draft', 'active', 'suspended');

CREATE TABLE shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_phone text NOT NULL REFERENCES users(phone) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  owner_name text NOT NULL,
  industry text NOT NULL,
  mode shop_mode NOT NULL DEFAULT 'display',
  -- Direct Order checkout is a dynamic UPI deep link built from these at
  -- checkout time (pa=upi_id, pn=verified_merchant_name, am=cart total),
  -- not a static uploaded QR image. verified_merchant_name/is_upi_verified
  -- are only ever set from Razorpay's own VPA-validation response, never
  -- from client input directly (see /shops/:id/upi/confirm) — a merchant
  -- can't self-report a name Razorpay didn't return for their VPA.
  upi_id text,
  verified_merchant_name text,
  is_upi_verified boolean NOT NULL DEFAULT false,
  geog geography(Point, 4326) NOT NULL,
  address_text text NOT NULL DEFAULT '',
  status shop_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Powers ST_DWithin / ST_Distance radius search on /api/shops/nearby.
CREATE INDEX shops_geog_idx ON shops USING GIST (geog);
CREATE INDEX shops_owner_phone_idx ON shops(owner_phone);

CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'past_due', 'cancelled');

CREATE TABLE shop_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  razorpay_subscription_id text UNIQUE,
  razorpay_plan_id text NOT NULL,
  status subscription_status NOT NULL DEFAULT 'pending',
  -- Which immutable Razorpay Plan this row points at IS the lifetime-lock
  -- mechanism (see apps/api/src/lib/razorpay.ts). This column just mirrors
  -- that plan's amount for display/reporting.
  locked_monthly_amount numeric(10, 2) NOT NULL DEFAULT 500.00,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_subscriptions_shop_id_idx ON shop_subscriptions(shop_id);
