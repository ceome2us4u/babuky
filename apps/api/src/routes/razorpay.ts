import { Hono } from "hono";
import { createOrder } from "../lib/razorpay.js";

export const razorpay = new Hono();

// Generic one-time order creation — used by the marketing scaffold's
// placeholder "Get Started" deposit button (apps/web PayButton). The real
// product-specific flows (vendor subscription, consultancy deposit) go
// through /shops/:id/subscribe and /consultancy/leads instead.
razorpay.post("/create-order", async (c) => {
  const body = await c.req.json().catch(() => null);
  const amountInPaise = Number(body?.amountInPaise);

  if (!amountInPaise || amountInPaise <= 0) {
    return c.json({ error: "amountInPaise must be a positive number" }, 400);
  }

  try {
    const order = await createOrder(amountInPaise, `babuky_${Date.now()}`);
    return c.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create order";
    return c.json({ error: message }, 503);
  }
});
