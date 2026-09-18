import { Hono } from "hono";
import { query } from "../lib/db.js";
import { verifyWebhookSignature } from "../lib/razorpay.js";

export const webhooks = new Hono();

type RazorpayWebhookEvent = {
  event: string;
  payload?: {
    subscription?: { entity?: { id?: string; current_end?: number } };
    payment?: { entity?: { order_id?: string } };
  };
};

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
      const subscriptionId = event.payload?.subscription?.entity?.id;
      const currentEnd = event.payload?.subscription?.entity?.current_end;
      if (subscriptionId) {
        await query(
          `UPDATE shop_subscriptions
           SET status = 'active', current_period_end = to_timestamp($2)
           WHERE razorpay_subscription_id = $1`,
          [subscriptionId, currentEnd ?? null],
        );
      }
      break;
    }
    case "subscription.cancelled":
    case "subscription.halted": {
      const subscriptionId = event.payload?.subscription?.entity?.id;
      if (subscriptionId) {
        await query(
          "UPDATE shop_subscriptions SET status = 'cancelled' WHERE razorpay_subscription_id = $1",
          [subscriptionId],
        );
      }
      break;
    }
    case "payment.captured": {
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
