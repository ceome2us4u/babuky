import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { createOrder } from "@/lib/razorpay";

const DEPOSIT_PAISE = 10000; // ₹100 refundable commitment deposit

function generateTicketRef() {
  const n = Math.floor(100000 + Math.random() * 899999);
  return `BBK-SR-${n}`;
}

type CartItem = { id: string; low: number; high: number };

export async function POST(request: Request) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { rows: leadRows } = await query(
    "SELECT 1 FROM user_lead_sources WHERE user_phone = $1 AND lead_source = 'CONSULTANCY_LEAD'",
    [phone],
  );
  if (leadRows.length === 0) {
    return NextResponse.json({ error: "Requires CONSULTANCY_LEAD lead source" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const selectedItems: CartItem[] = Array.isArray(body?.selectedItems) ? body.selectedItems : [];
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "email is invalid" }, { status: 400 });
  }
  if (selectedItems.length === 0) {
    return NextResponse.json({ error: "selectedItems is required" }, { status: 400 });
  }

  const budgetLow = selectedItems.reduce((sum, item) => sum + Number(item.low || 0), 0);
  const budgetHigh = selectedItems.reduce((sum, item) => sum + Number(item.high || 0), 0);
  const ticketRef = generateTicketRef();

  try {
    const order = await createOrder(DEPOSIT_PAISE, ticketRef);

    await query(
      `INSERT INTO consultancy_leads
         (user_phone, ticket_ref, selected_items, budget_low, budget_high, name, email, description, razorpay_order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        phone,
        ticketRef,
        JSON.stringify(selectedItems),
        budgetLow,
        budgetHigh,
        name,
        email,
        description,
        order.id,
      ],
    );

    return NextResponse.json({ ticketRef, order }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create consultancy lead";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
