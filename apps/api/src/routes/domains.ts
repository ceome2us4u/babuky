import { Hono } from "hono";
import type { Context } from "hono";

import { query } from "../lib/db.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { requireShopOwner } from "../lib/require-shop-owner.js";
import { publicError } from "../lib/mode.js";
import { ownDomainEnabled } from "../lib/features.js";
import { allow } from "../lib/rate-limit.js";
import { createVendorSubscription, razorpayKeyId } from "../lib/razorpay.js";
import { hasActivePremium } from "../lib/domain-worker.js";
import { currentDomain, holdDomain, parseDomainQuery, searchDomains, suggestSlug } from "../lib/domains.js";
import { isUuid, str } from "../lib/validation.js";

// The merchant-facing side of the "own web address" plan (₹1,500/mo).
// Everything that SELLS is behind FEATURE_OWN_DOMAIN and answers 404 while it
// is off, as if it didn't exist. Reading an existing shop's domain status is
// not: a merchant who already pays for one must always see it.
export const ownDomain = new Hono();

const off = (c: Context) => c.json({ error: "Not found" }, 404);

// GET /domains/search?q=sreeram[.shop][&shopId=...]
// Signed-in merchants only (it spends the registrar's shared check budget).
ownDomain.get("/domains/search", async (c) => {
  if (!ownDomainEnabled()) return off(c);
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  const parsed = parseDomainQuery(c.req.query("q") ?? "");
  if (!parsed) {
    return c.json({ error: "Use 3–40 letters or numbers (a hyphen is fine in the middle), like sreeramstores" }, 400);
  }
  const shopId = c.req.query("shopId") ?? null;
  if (shopId && !(isUuid(shopId) && (await requireShopOwner(shopId, phone)))) return c.json({ error: "Shop not found" }, 404);

  // Each search checks ~8 names; the account-wide registrar budget is ~200/min.
  if (!allow(`domains:${phone}`, 20, 60_000) || !allow("domains:all", 20, 60_000)) {
    return c.json({ error: "Lots of searches right now — please wait a few seconds and try again." }, 429);
  }

  try {
    const [results, slug] = await Promise.all([
      searchDomains(parsed.label, parsed.ending, shopId),
      suggestSlug(parsed.label, phone),
    ]);
    return c.json({ label: parsed.label, slug, results });
  } catch (error) {
    return c.json({ error: publicError(error, "We couldn't check web addresses right now. Please try again in a moment.") }, 503);
  }
});

// GET /shops/:id/domain — the shop's own address and how far its setup got.
ownDomain.get("/shops/:id/domain", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);
  const d = await currentDomain(shopId);
  return c.json({
    domain: d ? { domain: d.domain, status: d.status, graceUntil: d.grace_until, expiresAt: d.expires_at } : null,
  });
});

// POST /shops/:id/domain {domain} — pick (or re-pick) a premium shop's address:
// before paying, or after the chosen one turned out to be gone at purchase time.
ownDomain.post("/shops/:id/domain", async (c) => {
  if (!ownDomainEnabled()) return off(c);
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const domain = str(body?.domain).toLowerCase();
  const { rows } = await query<{ plan: string }>("SELECT plan::text AS plan FROM shops WHERE id = $1", [shopId]);
  if (rows[0]?.plan !== "premium") return c.json({ error: "This shop isn't on the own web address plan." }, 409);
  const cur = await currentDomain(shopId);
  if (cur && !["held", "failed"].includes(cur.status)) {
    return c.json({ error: "This shop's web address is already being set up." }, 409);
  }

  const problem = await holdDomain(shopId, domain);
  if (problem) return c.json({ error: problem }, 409);
  // Already paying (the first pick was lost at purchase time): buy this one now.
  if (await hasActivePremium(shopId)) {
    await query(
      `UPDATE shop_domains SET status = 'registering', held_until = NULL, next_attempt_at = now(), updated_at = now()
        WHERE shop_id = $1 AND status = 'held'`,
      [shopId],
    );
  }
  return c.json({ ok: true, domain });
});

// POST /shops/:id/upgrade {domain} — a live ₹500 shop moves to ₹1,500 with its
// own address. A second (premium) subscription is started; the old ₹500 one is
// cancelled by the webhook only once the first ₹1,500 payment has gone through.
ownDomain.post("/shops/:id/upgrade", async (c) => {
  if (!ownDomainEnabled()) return off(c);
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const { rows } = await query<{ plan: string; status: string }>(
    "SELECT plan::text AS plan, status::text AS status FROM shops WHERE id = $1",
    [shopId],
  );
  if (rows[0]?.plan === "premium") return c.json({ error: "This shop already has its own web address plan." }, 409);
  if (rows[0]?.status !== "active") {
    return c.json({ error: "Publish your shop first — then you can upgrade it to your own web address." }, 409);
  }

  const body = await c.req.json().catch(() => null);
  const problem = await holdDomain(shopId, str(body?.domain).toLowerCase());
  if (problem) return c.json({ error: problem }, 409);

  try {
    const subscription = await createVendorSubscription(shopId, "premium");
    await query(
      `INSERT INTO shop_subscriptions (shop_id, razorpay_subscription_id, razorpay_plan_id, status, plan, locked_monthly_amount)
       VALUES ($1, $2, $3, 'pending', 'premium', 1500.00)`,
      [shopId, subscription.id, subscription.plan_id],
    );
    return c.json({ subscription, keyId: razorpayKeyId() });
  } catch (error) {
    return c.json({ error: publicError(error, "We couldn't start the upgrade payment right now. Please try again in a moment.") }, 503);
  }
});
