import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

// Requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (same Razorpay account as
// Me2Us4U's other products). See .env.example at the repo root.
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

// Track 1 (Direct Order shops): validates a vendor's UPI VPA via Razorpay's
// VPA validation endpoint and returns the registered account name Razorpay
// has on file for it. Not wrapped by the razorpay npm SDK (it only covers
// orders/subscriptions/payments), so this calls the REST endpoint directly
// with the same Basic Auth every other Razorpay API call here uses.
// NOTE: unverified against a live account in this session (no real
// RAZORPAY_KEY_ID/SECRET configured yet) — confirm the exact response
// shape against Razorpay's own docs/a test call once real credentials
// exist, before relying on this in production.
export async function validateVpa(vpa: string): Promise<{ valid: boolean; customerName: string | null }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured yet — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.");
  }

  const res = await fetch("https://api.razorpay.com/v1/payments/validate/vpa", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ vpa }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay VPA validation failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { success?: boolean; customer_name?: string };
  return { valid: data.success === true, customerName: data.customer_name ?? null };
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
