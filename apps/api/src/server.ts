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
app.get("/health", (c) => c.json({ service: "babuki-api", ok: true, mode: appMode() }));

app.route("/auth", auth);
app.route("/shops", shops);
app.route("/consultancy", consultancy);
app.route("/geocode", geocode);
app.route("/webhooks", webhooks);
app.route("/contact", contact);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`babuki-api listening on :${info.port}`);
  if (isTestMode()) {
    console.warn(
      "!!! APP_MODE=test: no SMS is sent and ANY phone number can sign in with the fixed test code. " +
        "Run `scripts/set-app-mode.sh live <host>` before real users rely on their accounts.",
    );
  }
});
