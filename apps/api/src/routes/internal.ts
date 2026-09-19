import { Hono } from "hono";
import type { Context, Next } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

import { query } from "../lib/db.js";
import { hasActivePremium, onPremiumLapsed } from "../lib/domain-worker.js";

// For the box's own certificate job (infra/domains/babuki-domain-certs.sh,
// run by root from a systemd timer) — never reachable from the internet:
// the request must come from 127.0.0.1 AND carry no X-Forwarded-For. Nginx
// adds that header to everything it proxies, so a request that came in
// through api.babuki.com can never pass, even though Nginx connects from
// loopback too.
export const internal = new Hono();

async function loopbackOnly(c: Context, next: Next) {
  let address = "";
  try {
    address = getConnInfo(c).remote.address ?? "";
  } catch {
    /* not a node socket */
  }
  const loopback = address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  if (!loopback || c.req.header("x-forwarded-for") || c.req.header("x-real-ip")) return c.notFound();
  await next();
}
internal.use("*", loopbackOnly);

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/;

// One line per domain the box should serve: "<domain> <slug> <issue|serve>".
// issue = needs a certificate now (cert_pending and due); serve = keep its
// Nginx config (it has a cert). Plain text so the root script needs no jq.
internal.get("/domains/certs", async (c) => {
  const { rows } = await query<{ domain: string; slug: string; action: string }>(
    `SELECT d.domain, s.slug,
            CASE WHEN d.status = 'cert_pending' THEN 'issue' ELSE 'serve' END AS action
       FROM shop_domains d JOIN shops s ON s.id = d.shop_id
      WHERE d.status IN ('active', 'grace')
         OR (d.status = 'cert_pending' AND d.next_attempt_at <= now())
      ORDER BY d.domain`,
  );
  return c.text(rows.map((r) => `${r.domain} ${r.slug} ${r.action}`).join("\n") + (rows.length ? "\n" : ""));
});

internal.post("/domains/cert-ok", async (c) => {
  const domain = (c.req.query("domain") ?? "").toLowerCase();
  if (!DOMAIN_RE.test(domain)) return c.json({ error: "bad domain" }, 400);
  const { rows } = await query<{ shop_id: string }>(
    `UPDATE shop_domains SET status = 'active', attempts = 0, last_error = NULL, alert = NULL, updated_at = now()
      WHERE domain = $1 AND status = 'cert_pending' RETURNING shop_id`,
    [domain],
  );
  // Set up while the shop had already stopped paying: straight into grace.
  if (rows[0] && !(await hasActivePremium(rows[0].shop_id))) await onPremiumLapsed(rows[0].shop_id);
  return c.json({ ok: true });
});

internal.post("/domains/cert-failed", async (c) => {
  const domain = (c.req.query("domain") ?? "").toLowerCase();
  const reason = (c.req.query("reason") ?? "certificate failed").slice(0, 300);
  if (!DOMAIN_RE.test(domain)) return c.json({ error: "bad domain" }, 400);
  // Let's Encrypt allows ~5 failed validations per name per hour, and DNS can
  // take a while to spread: back off 15 min, 30, 60 … up to 6 hours.
  await query(
    `UPDATE shop_domains
        SET attempts = attempts + 1, last_error = $2,
            alert = CASE WHEN attempts + 1 >= 10 THEN 'HTTPS certificate keeps failing — check DNS' ELSE alert END,
            next_attempt_at = now() + make_interval(mins => LEAST(15 * power(2, LEAST(attempts, 5))::int, 360)),
            updated_at = now()
      WHERE domain = $1 AND status = 'cert_pending'`,
    [domain, reason],
  );
  return c.json({ ok: true });
});
