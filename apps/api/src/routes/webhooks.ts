import { Hono } from "hono";
import { query } from "../lib/db.js";
import { babukiPlanOf, cancelSubscription, verifyWebhookSignature } from "../lib/razorpay.js";
import { onPremiumLapsed, onPremiumPaid } from "../lib/domain-worker.js";

export const webhooks = new Hono();

type RazorpayWebhookEvent = {
  event: string;
  payload?: {
    subscription?: { entity?: { id?: string; plan_id?: string; current_end?: number } };
    payment?: { entity?: { order_id?: string } };
  };
};

// This webhook is registered with "all event types" on the shared Razorpay
// account (same account as Me2Us4U's other products — see
// docs/architecture.md), so it receives every subscription/payment event
// across the WHOLE account, not just Babuki's. Every DB write below is
// already scoped by WHERE razorpay_subscription_id/razorpay_order_id
// against Babuki's own separate database, so a non-Babuki event matches
// zero rows and no-ops by construction. This plan_id check is an explicit,
// additional guard on top of that — subscription events for any plan other
// than Babuki's own (RAZORPAY_VENDOR_PLAN_ID ₹500, RAZORPAY_PREMIUM_PLAN_ID
// ₹1,500) are ignored outright, before touching the database at all.
//
// Premium ("own web address") payments are handled whatever FEATURE_OWN_DOMAIN
// says: the switch stops new sales, never money that was already taken.
const isBabukiPlan = (planId: string | undefined) => babukiPlanOf(planId) !== null;

/** The shop behind a subscription, and whether it has ANOTHER active subscription. */
async function subscriptionShop(subscriptionId: string) {
  const { rows } = await query<{ shop_id: string; plan: string; other_active: boolean; other_active_premium: boolean }>(
    `SELECT x.shop_id, x.plan::text AS plan,
            EXISTS (SELECT 1 FROM shop_subscriptions o WHERE o.shop_id = x.shop_id AND o.id <> x.id
                      AND o.status = 'active') AS other_active,
            EXISTS (SELECT 1 FROM shop_subscriptions o WHERE o.shop_id = x.shop_id AND o.id <> x.id
                      AND o.status = 'active' AND o.plan = 'premium') AS other_active_premium
       FROM shop_subscriptions x WHERE x.razorpay_subscription_id = $1`,
    [subscriptionId],
  );
  return rows[0] ?? null;
}

// An upgrade (₹500 -> ₹1,500) runs as a second subscription on the same shop.
// Once the premium one is paid, the old ₹500 one is cancelled — only then, so
// the shop is never left without a plan. (Its own "cancelled" event then
// arrives; the shop stays live because the premium one is active.)
async function cancelReplacedStandard(shopId: string) {
  const { rows } = await query<{ razorpay_subscription_id: string }>(
    `SELECT razorpay_subscription_id FROM shop_subscriptions
      WHERE shop_id = $1 AND plan = 'standard' AND status IN ('active', 'pending') AND razorpay_subscription_id IS NOT NULL`,
    [shopId],
  );
  for (const r of rows) {
    try {
      await cancelSubscription(r.razorpay_subscription_id);
      await query("UPDATE shop_subscriptions SET status = 'cancelled' WHERE razorpay_subscription_id = $1", [
        r.razorpay_subscription_id,
      ]);
    } catch (e) {
      // Left as is: a person can cancel it from the Razorpay dashboard. Logged loudly.
      console.error(`[upgrade] couldn't cancel the old ₹500 subscription ${r.razorpay_subscription_id}:`, e);
    }
  }
}

webhooks.post("/razorpay", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-razorpay-signature") ?? null;

  if (!verifyWebhookSignature(rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(rawBody) as RazorpayWebhookEvent;

  switch (event.event) {
    case "subscription.activated":
    case "subscription.charged": {
      const entity = event.payload?.subscription?.entity;
      if (entity?.id && isBabukiPlan(entity.plan_id)) {
        await query(
          `UPDATE shop_subscriptions
           SET status = 'active', current_period_end = to_timestamp($2)
           WHERE razorpay_subscription_id = $1`,
          [entity.id, entity.current_end ?? null],
        );
        // A paid subscription is what makes the storefront go live (shops
        // are created as 'draft'; by-slug/nearby/catalog only serve 'active').
        // Also covers renewals: a suspended shop comes back on a new charge.
        await query(
          `UPDATE shops SET status = 'active'
           WHERE id = (SELECT shop_id FROM shop_subscriptions WHERE razorpay_subscription_id = $1)`,
          [entity.id],
        );
        const sub = await subscriptionShop(entity.id);
        if (sub?.plan === "premium") {
          await onPremiumPaid(sub.shop_id);
          await cancelReplacedStandard(sub.shop_id);
        }
      }
      break;
    }
    case "subscription.cancelled":
    case "subscription.halted":
    // All authorised cycles were paid (see VENDOR_SUBSCRIPTION_CYCLES): the shop goes
    // offline until renewed — on the same plan, so the price lock is unaffected.
    case "subscription.completed": {
      const entity = event.payload?.subscription?.entity;
      if (entity?.id && isBabukiPlan(entity.plan_id)) {
        await query(
          "UPDATE shop_subscriptions SET status = 'cancelled' WHERE razorpay_subscription_id = $1",
          [entity.id],
        );
        const sub = await subscriptionShop(entity.id);
        // Lapsed subscription: take the storefront offline (data is kept) —
        // unless the shop is still paying through another one (an upgrade).
        if (sub && !sub.other_active) {
          await query("UPDATE shops SET status = 'suspended' WHERE id = $1", [sub.shop_id]);
        }
        if (sub?.plan === "premium" && !sub.other_active_premium) await onPremiumLapsed(sub.shop_id);
      }
      break;
    }
    case "payment.captured": {
      // Orders (unlike subscriptions) carry no plan_id — the ₹100
      // consultancy deposit is a plain one-time order, not tied to any
      // plan. The razorpay_order_id WHERE match is the only, and
      // sufficient, scoping key here: it only ever matches a row if this
      // order was one Babuki itself created (see lib/razorpay.ts
      // createOrder), same "matches zero rows if it's not ours" reasoning
      // as the subscription cases above.
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) {
        await query(
          "UPDATE consultancy_leads SET deposit_status = 'paid' WHERE razorpay_order_id = $1",
          [orderId],
        );
      }
      break;
    }
    default:
      break;
  }

  return c.json({ ok: true });
});
