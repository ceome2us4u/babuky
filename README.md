# Babuky / Babuki

Babuky and Babuki are the same product (two domain spellings, to be merged
later) — a dual-offering B2B platform owned by Me2Us4U (OPC) Private
Limited: hyperlocal vendor storefronts on `[slug].babuki.com`, and a
software-consultancy scope estimator. The pages currently in `apps/web` are
still the original generic scaffold; the real content/UI rewrite (matching
the product's actual copy and theme) is a separate, later pass — see
`apps/web/db` and `apps/web/src/app/api/*` for what's real so far: the
database schema, auth, and payments backend.

**Fully isolated from Me2Us4U's other infrastructure** (the "Home"
monorepo): separate repo, separate VPC/EC2, separate self-hosted database —
not RDS, not Supabase, not any shared `@me2us4u/*` package. The one
exception is the MSG91 and Razorpay *accounts*, which are the same company
accounts used elsewhere, just with Babuki's own plan/template IDs.

## Monorepo layout

```
babuky/
  apps/
    web/        Next.js (App Router) + TypeScript + Tailwind marketing site
  package.json  npm workspaces root
```

`packages/` doesn't exist yet — add it when there's a second app or code that
needs to be shared across apps.

## Getting started

```bash
npm install
npm run dev
```

Site runs at http://localhost:3000.

Copy `.env.example` to `apps/web/.env.local` and fill in real values before
testing the payment or contract flows.

## Where things live

- **Brand/contact/services copy**: [`apps/web/src/config/site.ts`](apps/web/src/config/site.ts) —
  single source of truth. Edit this file to change the brand name, tagline,
  services list, or contact details; every page reads from it.
- **Pages**: `apps/web/src/app/*` (Home, Services, Contact, Get Started,
  Contracts).
- **Razorpay integration**: `apps/web/src/lib/razorpay.ts` +
  `apps/web/src/app/api/razorpay/create-order` + `PayButton` component.
- **E-signature (Documenso)**: `apps/web/src/lib/documenso.ts` +
  `apps/web/src/app/api/contracts/create-envelope`. Documenso was chosen over
  DocuSign because it's open-source and self-hostable on AWS, avoiding
  per-envelope SaaS pricing — swap it out if you'd rather use something else.
- **Database**: `apps/web/db/migrations/*.sql` — self-hosted PostgreSQL +
  PostGIS (not an ORM; raw `pg` + numbered migration files, run with
  `npm run db:migrate` in `apps/web`). Schema: `users` / `user_lead_sources` /
  `user_profiles` / `sessions` (auth), `shops` / `shop_subscriptions`
  (hyperlocal vendors), `shop_categories` / `shop_items` (each vendor's
  catalog — price, optional brand, optional manually-tracked stock count),
  `consultancy_leads` (software estimator).
- **Vendor catalog + images**: `apps/web/src/app/api/shops/[id]/{categories,items,upload-url}`
  + `apps/web/src/lib/storage.ts` (S3 presigned uploads — Babuki's own
  bucket, browser uploads directly, no image bytes touch this server).
  Category/item listing is public (no login needed to browse a live
  storefront); creating/editing is vendor-only (session + ownership check
  via `apps/web/src/lib/require-shop-owner.ts`).
- **Auth (MSG91 OTP)**: `apps/web/src/lib/msg91.ts` +
  `apps/web/src/lib/session.ts` + `apps/web/src/app/api/auth/*`. Opaque
  bearer-token sessions (httpOnly cookie), not JWT — a DB leak alone can't
  be replayed, and logout is a plain row delete.
- **Hyperlocal shops + PostGIS search**: `apps/web/src/app/api/shops/*` +
  `apps/web/src/app/api/geocode/reverse` (server-side Nominatim proxy).
- **Consultancy leads + subscriptions (Razorpay)**: `apps/web/src/lib/razorpay.ts`
  (order creation, vendor subscriptions, webhook signature verification) +
  `apps/web/src/app/api/consultancy/leads` +
  `apps/web/src/app/api/shops/[id]/subscribe` +
  `apps/web/src/app/api/webhooks/razorpay`.

## Deploying to AWS

Target is a single, dedicated **EC2 instance** in its own VPC — no Lambda,
no Amplify Hosting, no ECS/Fargate/App Runner, and not sharing compute, a
VPC, or a database with any other project. PostgreSQL+PostGIS runs on the
same box as the app. See [`infra/README.md`](infra/README.md) for the full
setup (Postgres, PM2, Nginx, the wildcard Let's Encrypt cert) and
[`infra/nginx/babuki.conf`](infra/nginx/babuki.conf) /
[`infra/pm2/ecosystem.config.js`](infra/pm2/ecosystem.config.js) for the
actual configs. `apps/web/Dockerfile` still exists but is unused for now —
PM2 running the standalone build directly is the primary deploy path.

DNS: one Route 53 wildcard record, `*.babuki.com` (+ the apex), points at
the instance's Elastic IP — that single record serves every vendor
subdomain, no per-signup DNS API call needed. `babuki.in` and `babuky.com`
are on GoDaddy and will transfer to AWS after 2026-11-16, then get routed to
the same instance.

## TODO before this is a finished, live product

- [ ] Confirm final brand name/domain spelling in `site.ts`
- [ ] Get MSG91 (OTP template id) and Razorpay (webhook secret, vendor plan
      id) values into `apps/web/.env.local` — same company accounts as
      Me2Us4U's other products, Babuki gets its own IDs inside them
- [ ] Stand up a Documenso instance (or pick a different e-sign tool) and add
      its API URL/key
- [ ] Wire the contact form to real email delivery (e.g. AWS SES)
- [ ] Provision the actual dedicated VPC/EC2 instance and point Route 53 at it
- [ ] Rewrite the actual pages (Home/Shops/Estimator/Terms) and theme to
      match the real product content and wire them to this backend — the
      current pages are still the original generic scaffold
