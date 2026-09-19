import { Hono } from "hono";
import { query } from "../lib/db.js";
import { vendorPlanId, verifyWebhookSignature } from "../lib/razorpay.js";

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
// than Babuki's own (RAZORPAY_VENDOR_PLAN_ID) are ignored outright, before
// touching the database at all.
function isBabukiPlan(planId: string | undefined): boolean {
  try {
    return !!planId && planId === vendorPlanId();
  } catch {
    return false; // this mode's plan isn't configured -> nothing is "ours"
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
        // Lapsed subscription: take the storefront offline (data is kept).
        await query(
          `UPDATE shops SET status = 'suspended'
           WHERE id = (SELECT shop_id FROM shop_subscriptions WHERE razorpay_subscription_id = $1)`,
          [entity.id],
        );
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
