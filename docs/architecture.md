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
- **Track 2 — software consultancy estimator** ("Build Custom Software" in
  the nav, matching the home-page card): an interactive scope estimator,
  ₹100 refundable commitment deposit to book a discovery call, credited
  against the first invoice on contract signing. **Written for shop owners
  who have never bought software**: the main wording is plain ("A safe home
  on the internet for my website") with the technical name as subtext
  ("Technical name: cloud server setup (AWS/EC2)"); it starts from goals
  ("I need a website", "I want to sell online") rather than a catalog; and it
  nudges for what people forget ("you'll probably also need: web address,
  safety padlock"). Wording and prices live in
  `components/estimator/catalog.ts`; item `id`/`low`/`high` are what the API
  stores, so keep ids stable.

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
                            geocode.ts, webhooks.ts, contact.ts
      src/server.ts          Hono app, CORS (matches *.babuki.com), mounts
      db/migrations/        numbered raw-SQL migrations, no ORM — apps/api
                             owns the schema
    web/                  Next.js 14 (App Router, TS, Tailwind v4) — PAGES ONLY.
      src/app/(site)/      marketing chrome (Navbar + Footer): / (home),
                             /shops (merchant onboarding + nearby), /estimator,
                             /terms, /contact, /dashboard (vendor catalog)
      src/app/store/[slug]/ the vendor storefront, own light layout (no
                             marketing nav). Server-rendered per request.
      next.config.mjs       slug.babuki.com -> /store/slug via a `beforeFiles`
                             rewrite matching the Host header (Nginx preserves
                             it). Apex/www and static assets are left alone.
                             `slug.localhost` works in dev. NOT middleware —
                             see the deploy gotchas below.
      src/components/       Navbar/Footer/Logo/AuthModal, ui/* (shadcn-style
                             Radix primitives), shops/*, estimator/*,
                             store/* (Storefront, CartDialog), dashboard/*
                             (Dashboard, CatalogManager, ItemDialog)
      src/lib/cart.ts       per-shop localStorage cart, stock-capped, grouped
                             by category, re-validated against the live catalog
      src/lib/store-api.ts  server-side fetch of the public storefront data
                             (loopback via API_INTERNAL_URL set in PM2)
      src/lib/upi.ts        UPI intent builder (Razorpay-verified values only)
      src/lib/api.ts        apiUrl()/apiFetch() -> NEXT_PUBLIC_API_URL
                             (api.babuki.com), credentials included so the
                             session cookie rides along. No server logic, no
                             /api routes, in this app.
      src/lib/auth.tsx      AuthProvider: /auth/me on load, login / signup / reset modal flow
      src/lib/razorpay.ts   Checkout.js loader (publishable key id only)
      src/app/globals.css   the Lovable mock's burgundy/gold tokens, verbatim
      src/components/ui/    the mock's own shadcn components, copied verbatim
                             (they use forwardRef — required under React 18
                             for Radix `asChild`; don't hand-rewrite them, the
                             sizing/tab/badge styles are part of the design)
      public/brand/         official emblem + wordmark + Me2Us4U logo, pulled
                             from the Lovable project and downsized
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
  its own Razorpay Plan IDs inside those accounts, not new signups.
  **Temporary: the OTP SMS template is Home's too** (MSG91 template
  `6a9ab17d99a12dbca202c3c4`, "##number## is your Me2Us4U verification code…",
  under Home's DLT header) until Babuki has its own DLT header + template — then
  only `MSG91_OTP_TEMPLATE_ID` (and `MSG91_OTP_VAR` if the merge variable isn't
  `number`) changes; nothing else in the code does. The template id is a plain
  non-secret value, like Home's own `deploy.sh`.
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

At checkout, the storefront's cart dialog builds a UPI deep
link entirely client-side (`src/lib/upi.ts`) —
`upi://pay?pa={upi_id}&pn={verified_merchant_name}&am={cart_total}&cu=INR&tn=…`
— and renders it with **`qrcode.react`** (a React component, renders
client-side with no server round-trip; the plain `qrcode` package would
only make sense for server-generated images, which this isn't), plus an
"Open in my UPI app" deep link for phones. Babuki can't see whether the
buyer actually paid, so the dialog says so and offers a WhatsApp handoff of
the order (grouped by category) for the buyer to send the vendor.
`GET /shops/by-slug/:slug` (public) is what the page reads from — it
only ever returns `upi_id`/`verified_merchant_name` once
`is_upi_verified` is true, so a QR can't be built from a VPA Razorpay
hasn't confirmed; a Direct Order shop without a verified VPA degrades to
the WhatsApp/call handoff. It also returns the vendor's `contact_phone` (a
public storefront lists how to reach the vendor; publishing a shop is the
opt-in).

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
  / `user_profiles` / `sessions` — phone + password login; an OTP only proves
  the phone. `users` carries `password_hash` (scrypt, NULL for accounts that
  pre-date passwords), `password_set_at`, `failed_login_count`, `locked_until`.
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
  order id, deposit status; plus `status` `new`/`contacted`/`quoted`/`won`/
  `lost` and `admin_notes` for follow-up).
- `contact_messages` (the Contact form's messages — stored, no longer
  dropped) and `admin_users` / `admin_sessions` / `admin_actions` (see
  "Admin console").
- **Industries** (`shops.industry` is plain text; lists in
  `apps/api/src/lib/industries.ts` ↔ `apps/web/src/lib/industries.ts`, keep in
  sync): ~75 kinds of business in 11 groups (Food & Drink, Grocery & Daily
  Needs, Fashion & Beauty, Home & Living, Electronics & Mobile, Health &
  Wellness, Services, Vehicles, Farm & Pets, Kids/Gifts/Books, General &
  Retail) plus **Other** — a vendor whose trade isn't listed types it in their
  own words (2–40 chars, letters/digits/`& / , . ' ( ) + -`) and that text is
  stored as the industry. The first version's four names (Bakery, Grocery,
  Hotel, Retail) are kept verbatim so existing shops stay put. Buyers filter
  `/shops/nearby?industry=` by group (`Other` = anything not on the list) or by
  one listed industry, and `q` matches the shop name **or** its industry.

## API surface (`apps/api/src/routes/`, mounted on `api.babuki.com`)

- **Auth: phone + password.** The OTP is *only* used to prove ownership of a
  phone number — when creating an account and for "forgot password" — never
  for everyday login.
  - `POST /auth/otp/send {phone, purpose: "signup"|"reset", …}` and
    `POST /auth/otp/verify {phone, otp, purpose}`. **Babuki generates and
    checks the codes itself** (`lib/msg91.ts`); MSG91 only delivers them, through
    its **Flow API** (`POST /api/v5/flow`, template merge variable `number` —
    the same way Home does it; the `/otp` endpoint can't drive that template).
    Codes are 5 digits (`OTP_LENGTH`, mirrored by the web's `lib/validate.ts`),
    stored only as a keyed hash in `otp_codes` (one live code per phone +
    purpose; a signup code can't be used to reset), valid 10 minutes,
    **single use**, and locked after 5 wrong tries (a fresh code unlocks).
    Limits, because each real SMS costs money: a phone can ask for one code per
    30 s and 5 an hour (`otp_sends`, survives restarts), one IP for 10 an hour,
    all answered with a plain 429 message; a failed MSG91 send deletes the
    unusable code and isn't counted. Forgot-password sends no SMS at all for a
    number without an account. **Verify does not sign anyone in**: it returns a
    signed, 10-minute `proof` (`lib/otp-proof.ts`, HMAC keyed off
    `SESSION_SECRET`, bound to phone + purpose). Signup send is refused (409)
    for a number that already has a password; reset send answers identically
    for numbers with and without an account.
  - `POST /auth/signup {proof, password, consent, leadSource}` — creates the
    account (or sets the first password on a pre-password one) and signs in.
    Refuses (409) if the number already has a password, so a proof can't
    overwrite an existing account. Then the UI's profile step (`/auth/profile`).
  - `POST /auth/login {phone, password, leadSource?}` — same generic error for
    "no such number" and "wrong password" (and a burn of equal CPU, so timing
    doesn't leak either); **5 wrong passwords lock the number for 15 minutes**
    (even the right password is refused meanwhile; a reset or expiry clears it).
  - `POST /auth/password/reset {proof, password}` — needs a `reset` proof;
    single-use (a proof issued before `password_set_at` is rejected); revokes
    every existing session, then signs in.
  - `/auth/{profile,me,logout}`. `POST /auth/lead-source` adds a lead-source
    tag to an already-signed-in user (lead sources gate the
    merchant/buyer/consultancy endpoints; login tags the active one too).
  - Password rules (`lib/password.ts` ↔ web `validate.ts`): 8–64 chars, at
    least one letter and one number, not a very common one, not the user's own
    phone number. Stored with Node's built-in `scrypt` (`scrypt$N$r$p$salt$hash`,
    so the cost can be raised later) — no native dependency.
  - Accounts created before passwords existed simply sign up again with their
    number (or use Forgot password): both prove the phone by OTP and set one.
    Their profile and shops are untouched.
- `/shops` (create — starts as status `draft`), `/shops/mine` (the
  signed-in vendor's shops + lifecycle/subscription/UPI state),
  `/shops/slug-available`, `/shops/by-slug/:slug`
  (**public** — storefront lookup, only exposes UPI fields once verified),
  **Web addresses and unpaid drafts** (`lib/slug-hold.ts`): a shop is created as
  a `draft` when the vendor reaches the payment step, so someone who backs out
  used to keep the address forever (blocking everyone, even themselves). Now:
  the owner can always resume their own draft (`POST /shops` with the same slug
  updates it and returns `resumed: true`; `/slug-available` answers
  `yours: true`; `/subscribe` reuses a still-`created` Razorpay subscription
  instead of piling up new ones); an **empty** draft (no items, no categories,
  no non-pending subscription) older than 2 hours is "abandoned" and its
  address can be taken — but only after Razorpay confirms none of its
  subscriptions is authenticated/active (webhooks can lag; any lookup failure
  means keep it), and the draft's pending subscription is then cancelled; a
  draft with catalog work is never released automatically; active and
  suspended shops always keep their address. `DELETE /shops/:id` lets a vendor
  delete their own never-published shop (same in-flight-payment check); the
  dashboard has a two-step "Delete this unfinished shop". `/slug-available`
  reports `reason: "reserved" | "taken"` so the form can say which.
  Reserved names: www, api, admin, app, mail, ftp, babuki, babuky, shop, shops,
  estimator, terms, contact, get-started, services.
  `/shops/nearby` (the shop finder: PostGIS `ST_Distance` ordering, and
  `ST_DWithin` when a distance is given — `radiusKm` 1–200 (`lib/search.ts`) or
  `any` for **no distance limit**, i.e. anywhere in India, nearest first; the
  centre is the buyer's location **or any place they searched for**; `q` also
  matches the shop's address, so a locality/city/pincode works as a keyword;
  100 results max, with `truncated: true` when a wide search hits it; gated to
  `LOCAL_BUYER` sessions; returns the vendor's phone for the Call/WhatsApp
  buttons — a deliberate, gated exposure — and `upi_id`/
  `verified_merchant_name` only once Razorpay-verified, for the Pay-via-QR
  button; the finder's **Open store** button (and the map-pin popup link) goes
  to the shop's own store page `slug.babuki.com` — where items are browsed,
  added to a basket and paid for by UPI; the finder itself has no catalog
  view, a read-only list there left buyers unable to order),
  `/shops/:id/subscribe` (Razorpay Subscription
  against the locked plan), `/shops/:id/upi/{validate,confirm}` (vendor-only
  — see the UPI checkout section above).
- `PATCH /shops/:id` — vendor-only; switches Display Only ↔ Direct Order.
- `/shops/:id/categories`, `/shops/:id/items` — **public GET while the shop
  is `active`** (a live storefront is browsable without login); for a
  `draft`/`suspended` shop only its owner can read them, so a vendor can
  build the catalog before paying and still see it if they lapse.
  Vendor-only POST/PATCH/DELETE (session + `require-shop-owner.ts`
  ownership check).
- `/shops/:id/upload-url` — presigned S3 PUT URL for a vendor's item photo
  (browser uploads directly, no image bytes through this server).
- `/geocode/reverse` — server-side Nominatim proxy. `/geocode/search?q=` —
  forward geocoding for the finder ("Coimbatore", "Indiranagar Bengaluru",
  "600017" → up to 5 places in India with coordinates): cached for an hour and
  rate-limited (30/min per IP, 50/min overall) to stay inside Nominatim's usage
  policy; the browser only ever talks to our API.
- `/consultancy/leads` — creates the lead + a ₹100 Razorpay order.
- `/webhooks/razorpay` — signature-verified, updates subscription/deposit
  status. **Shop lifecycle lives here**: `subscription.activated`/`.charged`
  set `shops.status = 'active'` (the only thing that makes a storefront
  visible to by-slug/nearby/catalog), `.cancelled`/`.halted` set it to
  `suspended` (data kept, storefront offline).
- `/contact` — the contact form. The old generic `/razorpay/create-order`
  (unauthenticated, arbitrary amount) was removed once nothing used it;
  every Razorpay order/subscription is now created by an authenticated
  route that fixes the amount server-side. `/contracts/create-envelope`
  (Documenso) was never carried over.

## Modes: TEST / LIVE — one switch for everything

`APP_MODE=test|live` in the API's env on the box (`/opt/babuki/api/.env`),
same convention as Home's `APP_MODE` (`packages/integrations/src/mode.ts`).
**Only exactly `test` is test; unset or anything else is LIVE.** It is
**never** flipped by editing code — that's a rule (see CLAUDE.md):

```bash
bash scripts/set-app-mode.sh test 13.204.187.141   # or: live
```

That edits `APP_MODE`, restarts the API and prints `/health`, which reports
`{"mode":"test"|"live"}` so the running state is checkable from outside.
`scripts/deploy.sh` **preserves** the box's current mode (an explicit
`APP_MODE=…` on the deploy command overrides; first-ever deploy = live), so a
normal deploy never flips it. One switch drives *everything* mode-dependent:

| | `test` | `live` |
|---|---|---|
| **OTP** (signup + forgot-password only) | no SMS is sent; the fixed code `12345` passes for **any** phone number and is returned to the UI as `devOtpHint` (the code screen shows it) | real MSG91 SMS |
| **Razorpay** | `RAZORPAY_*_TEST` credentials | `RAZORPAY_*_LIVE` credentials |
| **UPI ID (VPA) check** | **simulated** — Razorpay's sandbox doesn't offer it (with test keys the documented call answers "URL not found" while other endpoints work); `failure@razorpay` fails, any other well-formed VPA passes as `TEST ACCOUNT (name)` | real `POST /v1/payments/validate/vpa` |

Razorpay follows Home's pick-by-suffix pattern: both sets sit side by side in
the env (`RAZORPAY_KEY_ID`, `_KEY_SECRET`, `_WEBHOOK_SECRET`,
`_VENDOR_PLAN_ID`, each `_LIVE` / `_TEST`), and `lib/mode.ts` `pick()`
**fails closed** — a missing (or still-`not-configured-yet`) value for the
active mode is an error, so test mode can never quietly use live keys and move
real money. LIVE values: key id + plan id are plain values in `deploy.sh`,
secrets from `babuki/prod/razorpay-{key-secret,webhook-secret}`. TEST values
all come from Secrets Manager (`babuki/prod/razorpay-{key-id,key-secret,
webhook-secret,vendor-plan-id}-test`, placeholders in `secrets.tf`), so
configuring them never touches code. The webhook verifies with the active
mode's secret, so an event signed for the other mode is rejected.

Because the frontend can't hold a build-time key that a runtime flip would
leave stale, **the API returns the active mode's publishable `keyId` with
every payment** (`/shops/:id/subscribe`, `/consultancy/leads`); the web opens
Checkout with that, and there is no `NEXT_PUBLIC_RAZORPAY_KEY_ID` any more.

**Users never see provider errors.** When Razorpay/MSG91/missing config fails,
routes return `publicError()` (`lib/mode.ts`): the real error is logged, and in
LIVE the user gets only a friendly sentence ("We couldn't verify your UPI ID
right now. Please try again in a moment.") — never provider JSON or variable
names. In TEST the detail is returned so testers can see what broke. Use it for
any new upstream call.

**Not yet verified:** the LIVE VPA check. The request matches Razorpay's docs
(URL, body `{vpa}`, response `{success, customer_name}`), but it has only ever
been exercised with test keys, where the sandbox doesn't offer it. Its first
real use will be the check; if Razorpay rejects it for the live account, the
vendor sees the friendly message and the shop keeps working (call/WhatsApp) —
it does not break checkout.

**Test mode is dangerous by design** — anyone can pass the phone check for any
number, so anyone can create an account for, or **reset the password of**, any
number that has no real owner yet — so it exists only for building/testing.
The API logs a loud warning at startup while it is on.

**Current state (2026-09-19): the box runs `APP_MODE=live`.** Before the flip,
everything created during testing (3 accounts, 3 shops, 2 estimator requests,
their TEST Razorpay subscriptions and the one uploaded image, including every
S3 object version) was deleted, so production started empty. Pre-flight before
flipping: the LIVE Razorpay plan (`plan_TdVzzDQoYIGSj0`, ₹500 monthly) fetched
fine with the LIVE key, and MSG91 accepted the key + Home's template (with a
deliberately invalid mobile, so nothing was sent). **Not yet exercised in
production:** an SMS actually arriving on a real phone, a real ₹500
subscription / ₹100 deposit, and the LIVE UPI-ID check. If SMS delivery turns
out not to work, `bash scripts/set-app-mode.sh test <host>` restores test mode
immediately.

## Input validation

Every field is validated twice: `apps/web/src/lib/validate.ts` gives instant
feedback (sanitising as you type, inline `FieldError` messages, buttons
disabled until valid), and `apps/api/src/lib/validation.ts` enforces the same
rules again — the API never trusts the browser. **The two files must stay in
sync.** The rules:

- **Phone**: exactly 10 digits, first digit 6–9 (Indian mobile). The box is
  `type="tel"`, blocks non-digit keys, and cleans pastes (`+91 98765 43210`
  and `098765 43210` both become the 10-digit number).
- **Password**: 8–64 characters, at least one letter and one number, not on a
  short common-passwords list, not the user's phone number. Shown/hidden with an
  eye toggle (no separate confirm box) and a live checklist on new-password
  screens; the API returns a plain-language reason for anything it rejects.
- **Person names** (profile, owner, estimator, contact): letters in any
  script plus spaces and `. ' -` — no digits; max 100.
- **Email**: format-checked, spaces stripped, max 255. **Subdomain slug**:
  3–24 of `a-z0-9` with single inner hyphens (no leading/trailing hyphen — it
  has to be a valid DNS label). **UPI ID**: `name@bank`. **Price**: max 2
  decimals, ₹0–₹10,00,000, stored as integer paise. **Stock**: whole number
  0–999,999 or untracked.
- Text lengths are capped everywhere (business 120, city 100, item name 120,
  brand 80, description 500, category 60, contact message and project
  description 2000) and control characters are rejected server-side.
- Item photo URLs must be objects in Babuki's own bucket under that shop's
  prefix — an item can't point at an arbitrary external image.
- Malformed ids in a path (non-UUID) are a clean 404, not a Postgres error.
- **Placeholders describe the field ("Your phone number", "Your email
  address"); they are never sample values** (no `98765 43210`, no
  `you@company.com`).

## Admin console (`babuki.com/admin`)

The founder's internal page: every enquiry with all the inputs the person
filled in, so nothing depends on someone querying the database. Modelled on
Home's founder-only admin (one allowlisted email, every change audited).

- **Sections**: Overview (counts, "new" badges, latest activity, recent admin
  changes) · Software estimates (`consultancy_leads`: name/email the customer
  gave, phone with Call/WhatsApp, their business note, each thing they picked
  with its price range — shown by plain-language name from the estimator
  catalog — total, paid/**not paid yet**, timestamps) · Messages (Contact form)
  · Shops (every shop-setup input, owner, UPI, subscription, item count) ·
  Users (profile, what they came for, whether they've set a password). An
  estimate is stored the moment someone presses "Pay ₹100 & book", so
  **unpaid ones show up too** — warm leads who stopped at payment.
- **Follow-up**: status + private notes on estimates and messages
  (`PATCH /admin/estimates/:id`, `/admin/messages/:id`); each change writes an
  `admin_actions` row (who, what, from → to).
- **API** (`routes/admin.ts`, `routes/admin-data.ts`): `POST /admin/login`,
  `/logout`, `GET /me`, `/overview`, `/estimates`, `/messages`, `/shops`,
  `/users` (paged, filterable, `q` search with LIKE wildcards escaped).
- **Auth**: who may sign in is the `ADMIN_EMAILS` allowlist in the API's env
  (`scripts/deploy.sh`, default `ceo@me2us4u.com`; empty = nobody). The
  password hash lives in `admin_users` and is set **only** with
  `bash scripts/set-admin-password.sh <host> [email]` — you type the password
  in your terminal, it travels over SSH on stdin, is hashed on the box
  (min 12 chars) and never appears in argv, env, logs or chat; run it again to
  reset. There is no signup path for admins. Login uses the same scrypt +
  generic-error + 5-strikes/15-minute lock as customers. A removed allowlist
  entry revokes its live session immediately.
- **Separate from customer sessions**: own table (`admin_sessions`, token
  HMAC'd under an `admin|` label), own cookie (`babuki_admin`, HttpOnly,
  Secure, **SameSite=Strict**, 12 h), so a customer session can never be an
  admin session. `adminOriginGuard` additionally refuses any request whose
  `Origin` isn't `https://babuki.com` / `www` (the API's CORS otherwise trusts
  every vendor subdomain); `http://localhost` is accepted only in
  `APP_MODE=test`.
- **Web**: `apps/web/src/app/admin` + `components/admin/*`; `noindex` and
  `Disallow: /admin` in robots.txt. The page just reflects the API — the API
  is the only real gate.
- **Contact form**: `POST /contact` now stores the message and is rate-limited
  per IP (5/hour, 40/day; `lib/rate-limit.ts`, keyed on the last
  `X-Forwarded-For` hop, i.e. the one Nginx appended).
- **Not built yet**: email/Telegram alerts on new enquiries (needs an SES
  sender for babuki.com), CSV export, customer confirmation emails.

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
rediscovered)**: a **middleware** rewrite for the vendor subdomain worked
locally and 500'd in production — behind Nginx the request carries
`X-Forwarded-Proto: https`, so the rewrite target built from `req.nextUrl`
became `https://localhost:3000/...`, which Next treats as an external URL
and tries to proxy over TLS to its own plain-HTTP port (`EPROTO`). It's a
config rewrite in `next.config.mjs` now; **test anything host- or
proxy-dependent against the standalone server with `X-Forwarded-Proto:
https` and a `Host:` header, not plain `next start`**, and note that a `$`
inside a `host` matcher's lookahead anchors the whole hostname, not the
label. Ubuntu 24.04 has no `awscli` apt package (AWS CLI v2 is
installed from AWS's own zip); `CREATE EXTENSION postgis` needs a
superuser, so it's pre-installed as `postgres` at provision time and the
migration's `IF NOT EXISTS` no-ops for the app role; Next's standalone
output nests as `web/apps/web/server.js` in this monorepo (static/public
copy next to it, PM2 `cwd` is `/opt/babuki/web/apps/web`) and needs
`HOSTNAME=127.0.0.1` or it binds the machine hostname instead of the
address Nginx proxies to; `NEXT_PUBLIC_*` values are inlined at *build*
time (the box's `.env` can't supply them afterwards), and deploy.sh
writes them to a gitignored `apps/web/.env.production.local` for the build
rather than passing them as inline env vars — under WSL there is no Linux
node, `npm` is the *Windows* one via interop, and shell env vars never
reach it, so the inline form silently shipped a `localhost:8000` bundle;
deploy.sh also greps the built bundle and aborts if the API URL isn't in
it; nothing in `apps/api` loads a `.env`, so PM2
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
- **Real, ported from the Lovable mock** (`babuki.zip`, reference only —
  its TanStack stack was not adopted): Home, Hyperlocal Shops (merchant
  4-step onboarding + Shops Nearby with Leaflet), Software Estimator,
  Terms, the OTP login modal and the burgundy/gold theme — all wired to
  `apps/api` (OTP, slug check, shop create, subscription Checkout, UPI VPA
  verification, nearby search, consultancy lead + ₹100 Checkout).
  Deliberate departures from the mock: the mock's fake "Razorpay
  simulation" toasts are real Checkout now; Direct Order uses UPI VPA
  verification + a dynamic QR instead of an uploaded static QR image; the
  Terms page's e-sign panel is shown disabled ("coming soon") because the
  mock's version only fired a success toast and recorded nothing.
- **Real, beyond the mock** (the mock only had the provisioning flow):
  the live storefront at `[slug].babuki.com` (catalog grouped by category
  with brand, +/- cart capped at vendor-set stock, out-of-stock/low-stock
  states, cart grouped by category, UPI QR with the cart total for Direct
  Order, WhatsApp/call handoff otherwise) and the vendor dashboard at
  `/dashboard` (categories, items with S3 photo upload, stock, hide/show,
  Display Only ↔ Direct Order, UPI verification, subscribe/renew). A
  vendor can build the catalog while the shop is still `draft`; it goes
  public when the subscription webhook activates it. Photo uploads need the
  bucket's CORS rule (`aws_s3_bucket_cors_configuration` in `storage.tf`,
  applied by the owner) — without it the browser blocks the presigned PUT.
  `/contact` exists but is deliberately not linked from the nav or footer —
  the mock's footer is a clean three-part row with no secondary links.
- **Tested how**: the storefront and dashboard were driven in a real
  browser against a throwaway mock API, and later end to end against the real
  API in test mode (a throwaway shop with a real Razorpay TEST subscription and
  a signed webhook). See "Current state" above for what is still unproven live.
- **Credentials** (all set): `MSG91_AUTH_KEY` (`babuki/prod/msg91-auth-key`) and
  the OTP template — currently **Home's** (`MSG91_OTP_TEMPLATE_ID` default in
  `scripts/deploy.sh`) until Babuki has its own DLT header + template; real SMS
  and the LIVE Razorpay keys both follow `APP_MODE` (one switch). LIVE
  Razorpay (key secret, webhook secret, plan `plan_TdVzzDQoYIGSj0`) is
  already real. The **TEST** Razorpay set (`babuki/prod/razorpay-*-test`:
  key id, key secret, webhook secret, and a ₹500/mo plan created in
  Razorpay's Test mode) is empty — test-mode payments fail closed until it's
  filled in.
