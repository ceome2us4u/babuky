import { Hono } from "hono";
import { query } from "../lib/db.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { createOrder } from "../lib/razorpay.js";

export const consultancy = new Hono();

const DEPOSIT_PAISE = 10000; // ₹100 refundable commitment deposit

function generateTicketRef() {
  const n = Math.floor(100000 + Math.random() * 899999);
  return `BBK-SR-${n}`;
}

type CartItem = { id: string; low: number; high: number };

consultancy.post("/leads", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  const { rows: leadRows } = await query(
    "SELECT 1 FROM user_lead_sources WHERE user_phone = $1 AND lead_source = 'CONSULTANCY_LEAD'",
    [phone],
  );
  if (leadRows.length === 0) {
    return c.json({ error: "Requires CONSULTANCY_LEAD lead source" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const selectedItems: CartItem[] = Array.isArray(body?.selectedItems) ? body.selectedItems : [];
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!name) return c.json({ error: "name is required" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "email is invalid" }, 400);
  if (selectedItems.length === 0) return c.json({ error: "selectedItems is required" }, 400);

  const budgetLow = selectedItems.reduce((sum, item) => sum + Number(item.low || 0), 0);
  const budgetHigh = selectedItems.reduce((sum, item) => sum + Number(item.high || 0), 0);
  const ticketRef = generateTicketRef();

  try {
    const order = await createOrder(DEPOSIT_PAISE, ticketRef);

    await query(
      `INSERT INTO consultancy_leads
         (user_phone, ticket_ref, selected_items, budget_low, budget_high, name, email, description, razorpay_order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [phone, ticketRef, JSON.stringify(selectedItems), budgetLow, budgetHigh, name, email, description, order.id],
    );

    return c.json({ ticketRef, order }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create consultancy lead";
    return c.json({ error: message }, 503);
  }
});
