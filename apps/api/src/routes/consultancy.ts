import { Hono } from "hono";
import { query } from "../lib/db.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { publicError } from "../lib/mode.js";
import { createOrder, razorpayKeyId } from "../lib/razorpay.js";
import { EMAIL_RE, LIMITS, NAME_RE, isIntInRange, str, textError } from "../lib/validation.js";

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
  const name = str(body?.name);
  const email = str(body?.email);
  const description = str(body?.description);

  if (!name) return c.json({ error: "name is required" }, 400);
  if (!NAME_RE.test(name)) return c.json({ error: "Name can only contain letters, spaces and . ' -" }, 400);
  if (email && !EMAIL_RE.test(email)) return c.json({ error: "email is invalid" }, 400);
  const tooLong =
    textError("Name", name, LIMITS.fullName) ??
    textError("Email", email, LIMITS.email) ??
    textError("Description", description, LIMITS.projectDescription);
  if (tooLong) return c.json({ error: tooLong }, 400);
  if (selectedItems.length === 0) return c.json({ error: "selectedItems is required" }, 400);
  // Bounds on what the client says it selected. (The estimator's price list
  // lives in the browser today, so the stored budget is the client's figure —
  // a rough baseline for discovery, not a billed amount.)
  const validItem = (i: unknown): i is CartItem =>
    !!i &&
    typeof (i as CartItem).id === "string" &&
    (i as CartItem).id.length <= 20 &&
    isIntInRange((i as CartItem).low, 0, 10_000_000) &&
    isIntInRange((i as CartItem).high, 0, 10_000_000) &&
    (i as CartItem).low <= (i as CartItem).high;
  if (selectedItems.length > LIMITS.maxLeadItems || !selectedItems.every(validItem)) {
    return c.json({ error: "selectedItems is invalid" }, 400);
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
      [phone, ticketRef, JSON.stringify(selectedItems), budgetLow, budgetHigh, name, email, description, order.id],
    );

    // keyId: the browser opens Checkout with the key for the ACTIVE mode, so a
    // TEST/LIVE flip needs no frontend rebuild.
    return c.json({ ticketRef, order, keyId: razorpayKeyId() }, 201);
  } catch (error) {
    const message = publicError(error, "We couldn't start your booking payment right now. Please try again in a moment.");
    return c.json({ error: message }, 503);
  }
});
