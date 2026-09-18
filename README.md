# Babuky / Babuki

Babuky and Babuki are the same product (two domain spellings, to be merged
later) — a dual-offering B2B platform owned by Me2Us4U (OPC) Private
Limited: hyperlocal vendor storefronts on `[slug].babuki.com`, and a
software-consultancy scope estimator. The pages currently in `apps/web` are
still the original generic scaffold; the real content/UI rewrite (matching
the product's actual copy and theme) is a separate, later pass.

**Full architecture — read this first**: [`docs/architecture.md`](docs/architecture.md)
(data model, API surface, infra, the Me2Us4U isolation rule, what's real vs.
still placeholder). Kept current as a standing rule — see [`CLAUDE.md`](CLAUDE.md).

## Monorepo layout — two services

```
babuky/
  apps/
    api/        Hono backend (api.babuki.com) — all business logic, DB, auth, payments
    web/        Next.js frontend (babuki.com + *.babuki.com) — pages only, zero server logic
  infra/        Terraform + Nginx + PM2 config
  scripts/deploy.sh
  package.json  npm workspaces root
```

Split deliberately mirrors Home's `core-api`/`main-web` shape so the
backend can serve a future mobile app too — see `docs/architecture.md`
for the reasoning.

## Getting started

```bash
npm install
npm run dev:api    # apps/api on :8000
npm run dev        # apps/web on :3000, in another terminal
```

Copy `.env.example` to `apps/api/.env.local` and `apps/web/.env.local` and
fill in real values before testing the payment/auth/catalog flows.

## Deploying to AWS

Single, dedicated **EC2 instance** in its own VPC — no Lambda, no Amplify
Hosting, no ECS/Fargate/App Runner, nothing shared with any other project.
See [`infra/README.md`](infra/README.md) for the full setup and
`docs/architecture.md`'s infrastructure section for how the two services
are routed on one box.

## TODO before this is a finished, live product

- [ ] Confirm final brand name/domain spelling in `site.ts`
- [ ] Get real `MSG91_AUTH_KEY` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
      into Secrets Manager (`babuki/prod/*`) — see `docs/architecture.md`'s
      isolation section for which are copyable from Home vs. need a fresh value
- [ ] Wire the contact form to real email delivery (e.g. AWS SES)
- [ ] `terraform apply` the infra, then run `scripts/deploy.sh`
- [ ] Rewrite the actual pages (Home/Shops/Estimator/Terms) and theme to
      match the real product content and wire them to `apps/api` — the
      current pages are still the original generic scaffold
