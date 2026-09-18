import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";

type RazorpayWebhookEvent = {
  event: string;
  payload?: {
    subscription?: { entity?: { id?: string; current_end?: number } };
    payment?: { entity?: { order_id?: string } };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
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

  return NextResponse.json({ ok: true });
}
