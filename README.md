# Babuky

Public marketing/brand site for Babuky, a B2B software services company —
we act as the software delivery team for other companies (SaaS/product
engineering and custom software development).

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

## Deploying to AWS

Target is a plain **EC2 instance** — no Lambda, no Amplify Hosting, no
ECS/Fargate/App Runner. `apps/web/Dockerfile` (multi-stage, Next.js
`output: "standalone"`) builds a self-contained image you run directly on
the box with `docker run`, behind Nginx (TLS termination + reverse proxy to
the container's port 3000) and pointed at by Route 53.

If you'd rather not use Docker on the instance at all, the standalone build
also runs directly with plain Node: `npm run build` in `apps/web`, then
`node .next/standalone/server.js` under a process manager (e.g. `pm2` or a
systemd unit) so it survives reboots/crashes.

Domain: `babuki.com` is already on Route 53. `babuki.in` and `babuky.com`
are on GoDaddy and will transfer to AWS after 2026-11-16, then get routed to
this same site — no code changes needed for that, just DNS/Route 53 config
once the transfer completes.

## TODO before this is a finished, live site

- [ ] Confirm final brand name/domain spelling in `site.ts`
- [ ] Fill in `contact.email` / `contact.phone` in `site.ts` once Google
      Workspace is set up
- [ ] Get Razorpay keys into `apps/web/.env.local` (account already exists)
- [ ] Stand up a Documenso instance (or pick a different e-sign tool) and add
      its API URL/key
- [ ] Wire the contact form to real email delivery (e.g. AWS SES)
- [ ] Provision the actual AWS hosting (Amplify app or ECS service) and point
      Route 53 at it
