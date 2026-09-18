import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { createVendorSubscription } from "@/lib/razorpay";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { rows } = await query<{ id: string; owner_phone: string }>(
    "SELECT id, owner_phone FROM shops WHERE id = $1",
    [params.id],
  );
  const shop = rows[0];
  if (!shop || shop.owner_phone !== phone) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  try {
    const subscription = await createVendorSubscription(shop.id);
    await query(
      `INSERT INTO shop_subscriptions (shop_id, razorpay_subscription_id, razorpay_plan_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [shop.id, subscription.id, subscription.plan_id],
    );
    return NextResponse.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create subscription";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
