"use client";

import Script from "next/script";
import { useState } from "react";
import { apiUrl } from "@/lib/api";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type PayButtonProps = {
  amountInPaise: number;
  label?: string;
};

export function PayButton({ amountInPaise, label = "Pay deposit" }: PayButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  async function handlePay() {
    if (!keyId) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch(apiUrl("/razorpay/create-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountInPaise }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order creation failed");

      const razorpay = new window.Razorpay!({
        key: keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        order_id: data.order.id,
        name: "Babuky",
      });
      razorpay.open();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <button
        onClick={handlePay}
        disabled={status === "loading"}
        className="rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {status === "loading" ? "Preparing..." : label}
      </button>
      {status === "error" && !keyId && (
        <p className="mt-2 text-sm text-red-600">
          Payments aren&apos;t configured yet — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.
        </p>
      )}
      {status === "error" && keyId && (
        <p className="mt-2 text-sm text-red-600">Couldn&apos;t start the payment — please try again.</p>
      )}
    </>
  );
}
