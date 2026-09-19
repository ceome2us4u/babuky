import { query } from "./db.js";
import { GRACE_DAYS, checkNow, domainConfig, fitsPlan } from "./domains.js";
import { registrar } from "./registrar.js";

// Moves paid-for domains along: registering -> dns_pending -> cert_pending.
// (cert_pending -> active is the box's certificate job, via routes/internal.ts.)
// Runs inside the API process on a timer. It follows each shop's PLAN and
// payments, not FEATURE_OWN_DOMAIN: switching the feature off stops new sales,
// but a domain someone already paid for still gets set up and renewed.

const MAX_ATTEMPTS = 8;
const backoffMinutes = (attempts: number) => Math.min(2 ** attempts, 120);

type Row = { id: string; shop_id: string; domain: string; attempts: number };

async function retryLater(row: Row, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[domains] ${row.domain}:`, message);
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await query(
      `UPDATE shop_domains SET attempts = $2, last_error = $3, alert = $4, next_attempt_at = now() + interval '1 day',
              updated_at = now() WHERE id = $1`,
      [row.id, attempts, message.slice(0, 500), `Stuck after ${attempts} tries — needs a look`],
    );
    return;
  }
  await query(
    `UPDATE shop_domains SET attempts = $2, last_error = $3,
            next_attempt_at = now() + make_interval(mins => $4), updated_at = now() WHERE id = $1`,
    [row.id, attempts, message.slice(0, 500), backoffMinutes(attempts)],
  );
}

async function fail(row: Row, reason: string) {
  await query(
    `UPDATE shop_domains SET status = 'failed', last_error = $2, alert = $2, updated_at = now() WHERE id = $1`,
    [row.id, reason],
  );
}

async function register(row: Row) {
  const reg = registrar();
  let owned = await reg.owned(row.domain);
  let cost: number | null = null;
  let renewal: number | null = null;
  if (!owned) {
    const r = await checkNow(row.domain);
    if (!r) throw new Error("registry did not answer");
    if (!r.available) return fail(row, "Taken before we could buy it — the shop must pick another address");
    if (!fitsPlan(r)) return fail(row, `Over budget at purchase time (${r.priceCents}c / renews ${r.renewalCents}c)`);
    await reg.register(row.domain, r.priceCents);
    cost = r.priceCents;
    renewal = r.renewalCents;
    owned = await reg.owned(row.domain);
  }
  await query(
    `UPDATE shop_domains SET status = 'dns_pending', cost_cents = COALESCE($2, cost_cents),
            renewal_cents = COALESCE($3, renewal_cents), expires_at = COALESCE($4, expires_at),
            attempts = 0, last_error = NULL, next_attempt_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'registering'`,
    [row.id, cost, renewal, owned?.expiresAt ?? null],
  );
}

async function pointDns(row: Row) {
  const ip = process.env.PUBLIC_IP;
  if (!ip) throw new Error("PUBLIC_IP is not set in the API's env");
  await registrar().pointAt(row.domain, ip);
  await query(
    `UPDATE shop_domains SET status = 'cert_pending', attempts = 0, last_error = NULL,
            next_attempt_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'dns_pending'`,
    [row.id],
  );
}

async function due(status: string) {
  const { rows } = await query<Row>(
    `SELECT id, shop_id, domain, attempts FROM shop_domains
      WHERE status = $1 AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 5`,
    [status],
  );
  return rows;
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const row of await due("registering")) await register(row).catch((e) => retryLater(row, e));
    for (const row of await due("dns_pending")) await pointDns(row).catch((e) => retryLater(row, e));
  } catch (e) {
    console.error("[domains] tick failed:", e);
  } finally {
    running = false;
  }
}

// Once a day-ish: end grace periods, and watch next year's price.
async function housekeeping() {
  try {
    const { rows: ended } = await query<Row>(
      `SELECT id, shop_id, domain, attempts FROM shop_domains WHERE status = 'grace' AND grace_until < now()`,
    );
    for (const row of ended) {
      try {
        await registrar().setAutoRenew(row.domain, false);
        await query(
          `UPDATE shop_domains SET status = 'released', auto_renew = false, updated_at = now() WHERE id = $1`,
          [row.id],
        );
      } catch (e) {
        await retryLater(row, e);
      }
    }

    // A registry can raise its price. Re-check anything renewing within 45 days;
    // over budget -> an alert for a person (auto-renew stays on: losing a
    // paying shop's address is worse than a few dollars).
    const { rows: renewing } = await query<Row>(
      `SELECT id, shop_id, domain, attempts FROM shop_domains
        WHERE status IN ('active', 'cert_pending') AND expires_at < now() + interval '45 days'`,
    );
    const cap = domainConfig().capCents;
    for (const row of renewing) {
      const r = await checkNow(row.domain).catch(() => null);
      if (!r) continue;
      await query(
        `UPDATE shop_domains SET renewal_cents = $2, alert = $3, updated_at = now() WHERE id = $1`,
        [row.id, r.renewalCents, r.renewalCents > cap ? `Renewal is ${r.renewalCents}c, over the ${cap}c budget` : null],
      );
    }
  } catch (e) {
    console.error("[domains] housekeeping failed:", e);
  }
}

// --- payment events (called from the Razorpay webhook) -----------------------

/** A premium subscription was paid: buy the held domain, or bring a lapsed one back. */
export async function onPremiumPaid(shopId: string) {
  await query("UPDATE shops SET plan = 'premium' WHERE id = $1", [shopId]);
  await query(
    `UPDATE shop_domains SET status = 'registering', held_until = NULL, attempts = 0,
            next_attempt_at = now(), updated_at = now()
      WHERE shop_id = $1 AND status = 'held'`,
    [shopId],
  );
  await query(
    `UPDATE shop_domains SET status = 'active', grace_until = NULL, updated_at = now()
      WHERE shop_id = $1 AND status = 'grace'`,
    [shopId],
  );
}

/**
 * The premium subscription ended: the address is kept for GRACE_DAYS, then let
 * go. A domain still being set up finishes first (it's bought and paid for);
 * the certificate step then sends it straight to grace (routes/internal.ts).
 */
export async function onPremiumLapsed(shopId: string) {
  await query(
    `UPDATE shop_domains SET status = 'grace', grace_until = now() + make_interval(days => ${GRACE_DAYS}),
            updated_at = now()
      WHERE shop_id = $1 AND status = 'active'`,
    [shopId],
  );
}

/** True if the shop has a paid, running premium subscription. */
export async function hasActivePremium(shopId: string): Promise<boolean> {
  const { rows } = await query(
    "SELECT 1 FROM shop_subscriptions WHERE shop_id = $1 AND plan = 'premium' AND status = 'active' LIMIT 1",
    [shopId],
  );
  return rows.length > 0;
}

export function startDomainWorker() {
  setTimeout(() => void tick(), 15_000);
  setInterval(() => void tick(), 30_000);
  setTimeout(() => void housekeeping(), 60_000);
  setInterval(() => void housekeeping(), 6 * 60 * 60_000);
}
