import { NextResponse } from "next/server";
import { createOrder } from "@/lib/razorpay";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const amountInPaise = Number(body?.amountInPaise);

  if (!amountInPaise || amountInPaise <= 0) {
    return NextResponse.json({ error: "amountInPaise must be a positive number" }, { status: 400 });
  }

  try {
    const order = await createOrder(amountInPaise, `babuky_${Date.now()}`);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create order";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
