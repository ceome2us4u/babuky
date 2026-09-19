"use client";

// Thin wrapper over Razorpay Checkout.js. Only the publishable key id is used
// here, and it comes FROM THE API with each payment (`keyId` in the
// subscribe / lead responses) — the API picks the LIVE or TEST key by
// APP_MODE, so flipping the mode needs no frontend rebuild. The secret never
// leaves apps/api. Babuki uses Razorpay for exactly three things: vendor
// subscriptions, the ₹100 consultancy deposit, and UPI VPA validation
// (server-side). Buyer-to-vendor payments are peer-to-peer UPI and never
// touch Razorpay.

type CheckoutOptions = {
  key: string;
  name: string;
  description?: string;
  order_id?: string;
  subscription_id?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: () => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout needs a browser"));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Couldn't load Razorpay Checkout")));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

export async function openRazorpayCheckout(opts: {
  /** Publishable key id for the API's active mode (returned with the order/subscription). */
  keyId: string;
  orderId?: string;
  subscriptionId?: string;
  description: string;
  prefill?: CheckoutOptions["prefill"];
  onSuccess: () => void;
  onDismiss?: () => void;
}) {
  if (!opts.keyId) throw new Error("Payments aren't configured yet");

  await loadCheckoutScript();
  const checkout = new window.Razorpay!({
    key: opts.keyId,
    name: "Babuki",
    description: opts.description,
    order_id: opts.orderId,
    subscription_id: opts.subscriptionId,
    prefill: opts.prefill,
    theme: { color: "#5a0f1f" },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss },
  });
  checkout.open();
}
