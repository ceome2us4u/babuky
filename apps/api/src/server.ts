import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { env, isAllowedOrigin } from "./env.js";
import { appMode, isTestMode } from "./lib/mode.js";
import { auth } from "./routes/auth.js";
import { shops } from "./routes/shops.js";
import { consultancy } from "./routes/consultancy.js";
import { geocode } from "./routes/geocode.js";
import { webhooks } from "./routes/webhooks.js";
import { contact } from "./routes/contact.js";
import { admin } from "./routes/admin.js";
import { ownDomain } from "./routes/domains.js";
import { internal } from "./routes/internal.js";
import { features } from "./lib/features.js";
import { startDomainWorker } from "./lib/domain-worker.js";
import { startCustomDomainRefresh } from "./lib/custom-domains.js";

const app = new Hono();

app.use("*", logger());

// babuki.com and every *.babuki.com vendor subdomain call this API —
// isAllowedOrigin matches the pattern since the wildcard subdomains can't
// be enumerated as a static origin list.
app.use(
  "*",
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin! : ""),
    credentials: true,
  }),
);

// The mode is reported here on purpose: in "test" anyone can sign in as any
// phone number, so the live state must be checkable from outside.
// Product switches are reported too, so scripts/set-own-domain.sh can confirm a flip.
app.get("/health", (c) => c.json({ service: "babuki-api", ok: true, mode: appMode(), features: features() }));

// The web app asks this at runtime (never a build-time NEXT_PUBLIC_*), so a
// flip needs no redeploy. The browser treats "no answer" as everything off.
app.get("/features", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(features());
});

app.route("/auth", auth);
// Before /shops so its /shops/:id/domain and /shops/:id/upgrade are found.
app.route("/", ownDomain);
app.route("/internal", internal);
app.route("/shops", shops);
app.route("/consultancy", consultancy);
app.route("/geocode", geocode);
app.route("/webhooks", webhooks);
app.route("/contact", contact);
app.route("/admin", admin);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`babuki-api listening on :${info.port}`);
  // Own-domain background work runs whatever FEATURE_OWN_DOMAIN says: it only
  // ever acts on domains someone has already paid for.
  if (process.env.DATABASE_URL) {
    startDomainWorker();
    startCustomDomainRefresh();
  }
  if (isTestMode()) {
    console.warn(
      "!!! APP_MODE=test: no SMS is sent and ANY phone number can sign in with the fixed test code. " +
        "Run `scripts/set-app-mode.sh live <host>` before real users rely on their accounts.",
    );
  }
});
