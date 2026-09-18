# Babuki — architecture

Kept current as the system changes — if this contradicts the code, the
code wins; fix this file in the same PR that caused the drift.

## What this is

Babuky and Babuki are the same product (two domain spellings the owner
holds — `babuky.com`, `babuki.com`, `babuky.in` — one gets rerouted to the
other eventually). A dual-offering B2B platform, business-owned by
Me2Us4U (OPC) Private Limited:

- **Track 1 — hyperlocal vendor storefronts** on `[slug].babuki.com`:
  ₹500/mo, locked for life for early-bird vendors (future vendors pay
  ₹1,500/mo on a separate Razorpay plan). Catalog: categories, items
  (photo, price, optional brand, optional manually-tracked stock). Two
  catalog modes — Display Only (buyer calls/WhatsApps) or Direct Order
  (buyer pays the vendor's own static UPI QR — Babuki never touches that
  money, Section 79 IT Act intermediary posture).
- **Track 2 — software consultancy estimator**: an interactive scope
  cart, ₹100 refundable commitment deposit to book a discovery call,
  credited against the first invoice on contract signing.

## Repo layout

```
babuky/
  apps/web/            Next.js (App Router, TS, Tailwind) — pages + API routes
    db/migrations/      numbered raw-SQL migrations, no ORM
    src/lib/             db.ts, session.ts, msg91.ts, razorpay.ts, storage.ts,
                          require-session.ts, require-shop-owner.ts, constants.ts
    src/app/api/          auth/, shops/, consultancy/, geocode/, webhooks/, ...
  infra/
    terraform/           all AWS resources (VPC, EC2, S3, IAM, Route 53, secrets)
    nginx/babuki.conf    reverse proxy (80/443 -> 127.0.0.1:3000, wildcard TLS)
    pm2/ecosystem.config.js
  scripts/deploy.sh      build + ship + migrate + (re)start, run from this machine
```

## Isolation from Me2Us4U — the rule that shapes every infra decision

The real Me2Us4U platform is the "Home" repo
(`C:\Users\prass\OneDrive\Documents\Home`, **not**
`Documents\GitHub\me2us4u` — a differently-named, unrelated repo). Home is
a turborepo where every app shares one RDS Postgres, shared
`@me2us4u/session`/`auth-core` auth, and one Customer-360 identity graph
keyed on `users.id`. Babuki is deliberately kept **out** of all of that:

- Separate repo (this one), separate VPC, separate EC2 instance.
- Self-hosted PostgreSQL+PostGIS on Babuki's own box — not RDS, not
  `@me2us4u/database`, not Home's identity graph. Babuki's `users` table
  (phone-keyed) is its own, self-contained user base.
- Own session/auth code (`src/lib/session.ts` — opaque bearer token,
  HMAC-hashed in DB, not JWT) — not `@me2us4u/session`/`auth-core`.
- Own Terraform state bucket (`babuki-tfstate-551362153374`, not Home's
  `me2us4u-tfstate-*`), own SSH key (`~/.ssh/babuki-app-box`, never
  Home's `me2us4u-app-box`), own S3 bucket, own IAM role.
- Same AWS account as Home (551362153374) — that's fine, it's the same
  owner's account either way — and the account-level GitHub OIDC
  *provider* (`token.actions.githubusercontent.com`) is reused since it's
  a trust anchor, not a Home-owned resource. Nothing else is shared.
- **Named exception**: MSG91 (existing DLT registration) and Razorpay are
  the same company vendor accounts as Home's other product — Babuki uses
  its own Plan IDs / OTP template inside those accounts, not new signups.
  These are external SaaS accounts, not AWS infra/DB/code.

## Data model (`apps/web/db/migrations/`)

- `users` / `user_lead_sources` (`MERCHANT`/`LOCAL_BUYER`/`CONSULTANCY_LEAD`)
  / `user_profiles` / `sessions` — phone-based OTP auth.
- `shops` (slug, industry, mode, PostGIS `geog` point + GIST index, status)
  / `shop_subscriptions` (locked to an immutable Razorpay Plan id — *that's*
  the lifetime-lock mechanism, not a stored price).
- `shop_categories` / `shop_items` (price in paise, optional `brand` text,
  optional `stock_quantity` — `NULL` = untracked/always available, a
  number is vendor-set and manual; nothing auto-decrements, Babuki never
  sees the actual buyer/vendor transaction).
- `consultancy_leads` (ticket ref, selected items, budget range, Razorpay
  order id, deposit status).

## API surface (`apps/web/src/app/api/`)

- `auth/otp/{send,verify}`, `auth/{profile,me,logout}` — MSG91-backed.
- `shops` (create), `shops/slug-available`, `shops/nearby` (PostGIS
  `ST_DWithin`/`ST_Distance`, gated to `LOCAL_BUYER` sessions),
  `shops/:id/subscribe` (Razorpay Subscription against the locked plan).
- `shops/:id/categories`, `shops/:id/items` — **public GET** (a live
  storefront is browsable without login), vendor-only POST/PATCH/DELETE
  (session + `require-shop-owner.ts` ownership check).
- `shops/:id/upload-url` — presigned S3 PUT URL for a vendor's item photo
  (browser uploads directly, no image bytes through this server).
- `geocode/reverse` — server-side Nominatim proxy.
- `consultancy/leads` — creates the lead + a ₹100 Razorpay order.
- `webhooks/razorpay` — signature-verified, updates subscription/deposit
  status.

## Infrastructure (`infra/terraform/`)

One EC2 instance runs everything: Nginx (TLS termination, wildcard cert
via Certbot DNS-01/Route 53, *not* Nginx's own ACME), the Next.js app
under PM2, and self-hosted PostgreSQL+PostGIS — all on one box, per the
original "single EC2, no Lambda/Amplify/ECS" decision. One Route 53
wildcard record (`*.babuki.com` + apex) serves every vendor subdomain — no
per-signup DNS API call, no Cloudflare account. Secrets live in AWS
Secrets Manager (`babuki/prod/*`), read by the box's own IAM role at
deploy time (`scripts/deploy.sh`) — never committed, never touch the
deploying machine except in-memory during that SSH session.

**Deploy path**: `scripts/deploy.sh <elastic-ip>`, run manually from this
session/machine (not GitHub Actions) — builds, ships, migrates, issues/
renews the TLS cert, restarts PM2. No CI pipeline yet: Home avoids
GitHub-hosted Actions minutes via a CodeBuild-hosted runner, but that
needs one non-scriptable step (a GitHub App OAuth connection, console-only,
account-owner login) before it can be replicated here — see
`infra/README.md`'s last section for the exact one-time step and what
Terraform would then manage.

## What's real vs. still placeholder

- **Real**: the entire backend above (once deployed) — schema, auth,
  catalog, PostGIS search, Razorpay integration, infra.
- **Placeholder**: the actual pages (`apps/web/src/app/{page,services,
  contact,get-started,contracts}.tsx`) are still the original generic
  scaffold from before the real product spec existed — not the burgundy/
  gold dual-offering design referenced from the Lovable zip. That page/
  theme rewrite, plus the buyer-facing catalog+cart UI and the vendor's
  catalog-management dashboard, is the next major piece of work.
- **Needs real credentials from the owner** (placeholders in Secrets
  Manager / `.env.example` until then): `MSG91_AUTH_KEY`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. `RAZORPAY_VENDOR_PLAN_ID`
  (`plan_TdVzzDQoYIGSj0`) is already real.
