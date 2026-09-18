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
