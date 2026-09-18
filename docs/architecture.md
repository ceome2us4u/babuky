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

## Repo layout — two services, not one

Deliberately mirrors Home's split (`core-api` + `main-web`), so Babuki can
serve a future mobile app off the same backend once one exists (the
reason for the split — see git history around 2026-09-18 for the
correction that prompted it, a Next.js-app-with-embedded-API-routes shape
doesn't extend to mobile clients cleanly).

```
babuky/
  apps/
    api/                 Hono backend — api.babuki.com. ALL business logic
      src/lib/             db.ts, session.ts, msg91.ts, razorpay.ts,
                            storage.ts, require-shop-owner.ts, constants.ts,
                            auth-middleware.ts (Hono cookie helper), env.ts
      src/routes/           auth.ts, shops.ts (+ catalog), consultancy.ts,
                            geocode.ts, webhooks.ts, contact.ts, razorpay.ts
      src/server.ts          Hono app, CORS (matches *.babuki.com), mounts
      db/migrations/        numbered raw-SQL migrations, no ORM — apps/api
                             owns the schema
    web/                  Next.js (App Router, TS, Tailwind) — PAGES ONLY.
      src/lib/api.ts        apiUrl() -> NEXT_PUBLIC_API_URL (api.babuki.com).
                             No server logic, no /api routes, in this app.
  infra/
    terraform/            all AWS resources (VPC, EC2, S3, IAM, Route 53, secrets)
    nginx/babuki.conf     api.babuki.com -> :8000, babuki.com/*.babuki.com -> :3000
    pm2/ecosystem.config.js   two PM2 apps: babuki-api, babuki-web
  scripts/deploy.sh       build + ship + migrate + (re)start both, run from this machine
```

**Why this split, concretely**: `apps/web` has zero server-side code — it
only renders pages and calls `api.babuki.com` over `fetch`, same as any
external client would (a future Flutter/React Native app included). CORS
in `apps/api/src/server.ts` matches `babuki.com` and every `*.babuki.com`
vendor subdomain by pattern (can't enumerate the wildcard as a static
origin list). The session cookie is set by `api.babuki.com` with no
explicit `Domain` attribute (host-only) — it still reaches every request
to `api.babuki.com` regardless of which subdomain's page initiated the
`fetch`, because `babuki.com` and `api.babuki.com` share a registrable
domain (same-site for `SameSite=Lax` purposes, even though cross-origin).

## Isolation from Me2Us4U — the rule that shapes every infra decision

The real Me2Us4U platform is the "Home" repo
(`C:\Users\prass\OneDrive\Documents\Home`, **not**
`Documents\GitHub\me2us4u` — a differently-named, unrelated repo). Home is
a turborepo where every app shares one RDS Postgres, shared
`@me2us4u/session`/`auth-core` auth, and one Customer-360 identity graph
keyed on `users.id`. Babuki is deliberately kept **out** of all of that —
note this is about *infrastructure and code*, not architecture *shape*:
copying Home's separate-API-service pattern (above) is intentional and
was requested explicitly; sharing Home's actual deployed `core-api` or
database is exactly what's being avoided:

- Separate repo (this one), separate VPC, separate EC2 instance.
- Self-hosted PostgreSQL+PostGIS on Babuki's own box — not RDS, not
  `@me2us4u/database`, not Home's identity graph. Babuki's `users` table
  (phone-keyed) is its own, self-contained user base.
- Own session/auth code (`apps/api/src/lib/session.ts` — opaque bearer
  token, HMAC-hashed in DB, not JWT) — not `@me2us4u/session`/`auth-core`.
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
  These are external SaaS accounts, not AWS infra/DB/code. Note the two
  are NOT interchangeable the same way: `MSG91_AUTH_KEY` and
  `RAZORPAY_KEY_SECRET` are genuinely account-wide credentials (safe to
  copy from Home's Secrets Manager entries); `RAZORPAY_WEBHOOK_SECRET` is
  NOT — Razorpay issues a distinct secret per registered webhook URL, so
  Babuki needed its own webhook registered against
  `https://api.babuki.com/webhooks/razorpay` before that one could be set.

## UPI checkout — VPA verification, not static QR uploads

Direct Order shops no longer upload a static QR image. Instead: the vendor
enters their UPI VPA (`shopname@upi`), `POST /shops/:id/upi/validate` calls
Razorpay's VPA validation endpoint (`validateVpa` in
`apps/api/src/lib/razorpay.ts`, not wrapped by the `razorpay` npm SDK — a
direct REST call with the same Basic Auth every other Razorpay call here
uses; **unverified against a live account as of 2026-09-18**, confirm the
response shape once real credentials exist) and returns the registered
account name *without persisting anything* — a pure preview so the UI can
show "is this your business? [Confirm]". Only `POST /shops/:id/upi/confirm`
re-validates and persists `upi_id` / `verified_merchant_name` /
`is_upi_verified` — `verified_merchant_name` is only ever written from
Razorpay's own response, never trusted from client input.

At checkout, the storefront (Phase 2, not built yet) builds a UPI deep
link entirely client-side — `upi://pay?pa={upi_id}&pn={verified_merchant_name}&am={cart_total}&cu=INR`
— and renders it with **`qrcode.react`** (a React component, renders
client-side with no server round-trip; the plain `qrcode` package would
only make sense for server-generated images, which this isn't — not
added as a dependency yet since no checkout page exists to use it in).
`GET /shops/by-slug/:slug` (public) is what that page reads from — it
only ever returns `upi_id`/`verified_merchant_name` once
`is_upi_verified` is true, so a QR can't be built from a VPA Razorpay
hasn't confirmed.

**Razorpay scope stays exactly three things** — vendor subscription billing
(₹500/mo), consultancy deposits (₹100), and VPA validation during
onboarding. Buyer-to-vendor payment for actual storefront purchases is
peer-to-peer UPI (NPCI), entirely outside Razorpay and outside Babuki —
consistent with the existing Section 79 "Babuki never touches buyer/vendor
money" posture, now also true for Direct Order mode specifically (it
wasn't fully mechanical before this change; a static uploaded QR image
could have been anything).

## Data model (`apps/api/db/migrations/`)

- `users` / `user_lead_sources` (`MERCHANT`/`LOCAL_BUYER`/`CONSULTANCY_LEAD`)
  / `user_profiles` / `sessions` — phone-based OTP auth.
- `shops` (slug, industry, mode, PostGIS `geog` point + GIST index, status,
  `upi_id`/`verified_merchant_name`/`is_upi_verified` — see the UPI
  checkout section above) / `shop_subscriptions` (locked to an immutable
  Razorpay Plan id — *that's* the lifetime-lock mechanism, not a stored
  price).
- `shop_categories` / `shop_items` (price in paise, optional `brand` text,
  optional `stock_quantity` — `NULL` = untracked/always available, a
  number is vendor-set and manual; nothing auto-decrements, Babuki never
  sees the actual buyer/vendor transaction).
- `consultancy_leads` (ticket ref, selected items, budget range, Razorpay
  order id, deposit status).

## API surface (`apps/api/src/routes/`, mounted on `api.babuki.com`)

- `/auth/otp/{send,verify}`, `/auth/{profile,me,logout}` — MSG91-backed.
- `/shops` (create), `/shops/slug-available`, `/shops/by-slug/:slug`
  (**public** — storefront lookup, only exposes UPI fields once verified),
  `/shops/nearby` (PostGIS `ST_DWithin`/`ST_Distance`, gated to
  `LOCAL_BUYER` sessions), `/shops/:id/subscribe` (Razorpay Subscription
  against the locked plan), `/shops/:id/upi/{validate,confirm}` (vendor-only
  — see the UPI checkout section above).
- `/shops/:id/categories`, `/shops/:id/items` — **public GET** (a live
  storefront is browsable without login), vendor-only POST/PATCH/DELETE
  (session + `require-shop-owner.ts` ownership check).
- `/shops/:id/upload-url` — presigned S3 PUT URL for a vendor's item photo
  (browser uploads directly, no image bytes through this server).
- `/geocode/reverse` — server-side Nominatim proxy.
- `/consultancy/leads` — creates the lead + a ₹100 Razorpay order.
- `/webhooks/razorpay` — signature-verified, updates subscription/deposit
  status.
- `/contact`, `/razorpay/create-order` — carried over from the original
  generic scaffold, still used by the current placeholder pages
  (`apps/web`'s Contact and Get Started). `/contracts/create-envelope`
  (Documenso) was **not** carried over — dropped as unused scope tied to
  a placeholder page that Phase 2 replaces with the real Terms page
  anyway; `apps/web/src/app/contracts/page.tsx` will show its existing
  error state if submitted until Phase 2 lands.

## Infrastructure (`infra/terraform/`)

One EC2 instance runs everything: Nginx (TLS termination, wildcard cert
via Certbot DNS-01/Route 53, *not* Nginx's own ACME — the wildcard SAN
`*.babuki.com` also covers the single-label `api.babuki.com`, no separate
cert needed), **two** PM2 processes (`babuki-api` on :8000, `babuki-web`
on :3000), and self-hosted PostgreSQL+PostGIS — all on one box, per the
original "single EC2, no Lambda/Amplify/ECS" decision; the service split
above is a code/routing boundary, not a second box. Nginx routes by exact
`server_name` — `api.babuki.com` (exact match, always wins over the
wildcard below) → `:8000`; `babuki.com` + `*.babuki.com` (wildcard) →
`:3000`. Two Route 53 A records (`*.babuki.com` + apex) plus an explicit
`api.babuki.com` record (technically already covered by the wildcard, but
documents the backend's own address and decouples it if that ever
changes) — no Cloudflare account, no per-signup DNS API call. Secrets
live in AWS Secrets Manager (`babuki/prod/*`), read by the box's own IAM
role at deploy time (`scripts/deploy.sh`) — never committed, never touch
the deploying machine except in-memory during that SSH session.

**Deploy gotchas already hit (all fixed in the repo, listed so they aren't
rediscovered)**: Ubuntu 24.04 has no `awscli` apt package (AWS CLI v2 is
installed from AWS's own zip); `CREATE EXTENSION postgis` needs a
superuser, so it's pre-installed as `postgres` at provision time and the
migration's `IF NOT EXISTS` no-ops for the app role; Next's standalone
output nests as `web/apps/web/server.js` in this monorepo (static/public
copy next to it, PM2 `cwd` is `/opt/babuki/web/apps/web`) and needs
`HOSTNAME=127.0.0.1` or it binds the machine hostname instead of the
address Nginx proxies to; `NEXT_PUBLIC_*` values are inlined at *build*
time (deploy.sh passes them to `npm run build` — the box's `.env` can't
supply them afterwards); nothing in `apps/api` loads a `.env`, so PM2
starts it with `node --env-file=.env --import tsx`; `scp -r dir
host:existing_dir` nests instead of replacing, so deploy.sh wipes the
replaceable directories and copies into their parents. `/opt/babuki`
must be `chown`ed to the SSH user (root-owned `/opt`).

**Deploy path**: `scripts/deploy.sh <elastic-ip>`, run manually from this
session/machine (not GitHub Actions) — builds `apps/web`'s standalone
output, ships `apps/api`'s source (the box runs its own `npm install`,
no `node_modules` transferred over the wire), migrates, issues/renews the
TLS cert, (re)starts both PM2 processes. No CI pipeline yet: Home avoids
GitHub-hosted Actions minutes via a CodeBuild-hosted runner, but that
needs one non-scriptable step (a GitHub App OAuth connection, console-only,
account-owner login) before it can be replicated here — see
`infra/README.md`'s last section for the exact one-time step and what
Terraform would then manage.

## What's real vs. still placeholder

- **Real**: the entire `apps/api` backend above (once deployed) — schema,
  auth, catalog, PostGIS search, Razorpay integration, infra.
- **Placeholder**: `apps/web`'s actual pages (`page`, `services`, `contact`,
  `get-started`, `contracts`) are still the original generic scaffold from
  before the real product spec existed — not the burgundy/gold
  dual-offering design referenced from the Lovable zip, and not yet wired
  to most of `apps/api`'s real endpoints (only Contact and the generic
  Razorpay order-creation button are wired, via `apps/web/src/lib/api.ts`).
  That page/theme rewrite, plus the buyer-facing catalog+cart UI (grouped
  by category, out-of-stock states) and the vendor's catalog-management
  dashboard, is the next major piece of work.
- **Needs real credentials from the owner** (placeholders in Secrets
  Manager / `.env.example` until then): `MSG91_AUTH_KEY`,
  `RAZORPAY_KEY_SECRET` (copyable from Home's account-wide values),
  `RAZORPAY_WEBHOOK_SECRET` (needs Babuki's own webhook registered in the
  Razorpay dashboard first — see the isolation section above).
  `RAZORPAY_VENDOR_PLAN_ID` (`plan_TdVzzDQoYIGSj0`) is already real.
