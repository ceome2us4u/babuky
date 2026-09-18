import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

// Requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in apps/web/.env.local.
// See .env.example at the repo root.
function getClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function createOrder(amountInPaise: number, receipt: string) {
  const client = getClient();

  if (!client) {
    throw new Error("Razorpay is not configured yet — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.");
  }

  return client.orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt,
  });
}

// Track 1 (hyperlocal vendors): one Razorpay Plan per locked-in rate cohort.
// RAZORPAY_VENDOR_PLAN_ID is the ₹500/mo early-bird plan — its amount is
// immutable on Razorpay's side, so pointing a subscription at this specific
// plan id *is* the lifetime-lock mechanism. A future ₹1,500/mo cohort gets
// a different plan id; existing subscriptions are unaffected.
export async function createVendorSubscription(shopId: string) {
  const client = getClient();
  const planId = process.env.RAZORPAY_VENDOR_PLAN_ID;

  if (!client || !planId) {
    throw new Error(
      "Razorpay subscriptions are not configured yet — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_VENDOR_PLAN_ID.",
    );
  }

  return client.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: 1200, // ~100 years of monthly cycles; Razorpay subscriptions require a bound
    notes: { shop_id: shopId },
  });
}

// Verifies an inbound Razorpay webhook payload against its signature header.
// Rejects tampered/forged payloads before we act on them.
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
