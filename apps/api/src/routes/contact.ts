import { Hono } from "hono";
import { query } from "../lib/db.js";
import { allow, clientIp } from "../lib/rate-limit.js";
import { EMAIL_RE, LIMITS, NAME_RE, str, textError } from "../lib/validation.js";

export const contact = new Hono();

// Messages are stored (see the admin console at babuki.com/admin) — this used
// to validate and then drop them. Public and unauthenticated, so it is
// rate-limited per IP: 5 an hour, 40 a day.
contact.post("/", async (c) => {
  const ip = clientIp(c);
  if (!allow(`contact:h:${ip}`, 5, 60 * 60 * 1000) || !allow(`contact:d:${ip}`, 40, 24 * 60 * 60 * 1000)) {
    return c.json({ error: "You've sent a few messages already — please try again later." }, 429);
  }

  const body = await c.req.json().catch(() => null);

  const name = str(body?.name);
  const email = str(body?.email);
  const message = str(body?.message);

  if (!name || !email || !message) {
    return c.json({ error: "name, email, and message are required" }, 400);
  }
  if (!NAME_RE.test(name)) {
    return c.json({ error: "Name can only contain letters, spaces and . ' -" }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: "email is invalid" }, 400);
  }
  if (message.length < 5) {
    return c.json({ error: "message is too short" }, 400);
  }
  const tooLong =
    textError("Name", name, LIMITS.fullName) ??
    textError("Email", email, LIMITS.email) ??
    textError("Message", message, LIMITS.message);
  if (tooLong) {
    return c.json({ error: tooLong }, 400);
  }

  await query("INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)", [name, email, message]);
  return c.json({ status: "received" }, 201);
});
