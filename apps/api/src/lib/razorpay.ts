import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

import { isTestMode, pick } from "./mode.js";

// Credentials are selected by APP_MODE (see ./mode.ts) — both sets sit side
// by side in the env, same as the Home repo:
//   RAZORPAY_KEY_ID_LIVE | _TEST, RAZORPAY_KEY_SECRET_LIVE | _TEST,
//   RAZORPAY_WEBHOOK_SECRET_LIVE | _TEST, RAZORPAY_VENDOR_PLAN_ID_LIVE | _TEST
// pick() throws if the active mode's value isn't configured, so test mode can
// never fall back to live keys and move real money.

/** The publishable key id for the active mode — handed to the browser with each payment. */
export const razorpayKeyId = () => pick("RAZORPAY_KEY_ID");
const razorpayKeySecret = () => pick("RAZORPAY_KEY_SECRET");
export const razorpayWebhookSecret = () => pick("RAZORPAY_WEBHOOK_SECRET");
/** Babuki's own ₹500/mo plan for the active mode (test mode needs its own plan in Razorpay's test dashboard). */
export const vendorPlanId = () => pick("RAZORPAY_VENDOR_PLAN_ID");

function getClient() {
  return new Razorpay({ key_id: razorpayKeyId(), key_secret: razorpayKeySecret() });
}

export async function createOrder(amountInPaise: number, receipt: string) {
  return getClient().orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt,
  });
}

// Track 1 (hyperlocal vendors): one Razorpay Plan per locked-in rate cohort.
// The vendor plan is the ₹500/mo early-bird plan — its amount is immutable on
// Razorpay's side, so pointing a subscription at this specific plan id *is*
// the lifetime-lock mechanism. A future ₹1,500/mo cohort gets a different plan
// id; existing subscriptions are unaffected.
export async function createVendorSubscription(shopId: string) {
  return getClient().subscriptions.create({
    plan_id: vendorPlanId(),
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
  // Razorpay's sandbox doesn't offer VPA validation: with test keys the same
  // call that is documented for live answers "The requested URL was not found
  // on the server" (checked 2026-09-19 — other endpoints work fine with the
  // same key). So in APP_MODE=test the check is SIMULATED and no request is
  // made, the same "no real external calls in test mode" idea as the OTP. It
  // follows Razorpay's own test-VPA convention: failure@razorpay fails, any
  // other well-formed VPA succeeds with an obviously fake registered name.
  if (isTestMode()) {
    const local = vpa.split("@")[0];
    return local.toLowerCase().startsWith("failure")
      ? { valid: false, customerName: null }
      : { valid: true, customerName: `TEST ACCOUNT (${local})` };
  }

  const keyId = razorpayKeyId();
  const keySecret = razorpayKeySecret();

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

const razorpayAuth = () =>
  `Basic ${Buffer.from(`${razorpayKeyId()}:${razorpayKeySecret()}`).toString("base64")}`;

/** A subscription's current state at Razorpay (created, authenticated, active, cancelled, ...). */
export async function fetchSubscriptionStatus(subscriptionId: string): Promise<string> {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: razorpayAuth() },
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string };
  if (!res.ok || !data.status) throw new Error(`Razorpay subscription lookup failed: ${res.status}`);
  return data.status;
}

/** Cancels a subscription immediately (used when an unpaid draft shop is released). */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    headers: { Authorization: razorpayAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  if (!res.ok) throw new Error(`Razorpay cancel failed: ${res.status}`);
}

// Verifies an inbound Razorpay webhook payload against its signature header.
// Rejects tampered/forged payloads before we act on them. Uses the active
// mode's webhook secret; if that isn't configured, nothing can verify.
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  let secret: string;
  try {
    secret = razorpayWebhookSecret();
  } catch {
    return false;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
