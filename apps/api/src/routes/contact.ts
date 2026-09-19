import { Hono } from "hono";
import { EMAIL_RE, LIMITS, NAME_RE, str, textError } from "../lib/validation.js";

export const contact = new Hono();

// TODO: wire up real delivery (e.g. AWS SES) once Google Workspace / a
// public contact address exists. For now this just validates the payload
// and confirms receipt without sending anything.
contact.post("/", async (c) => {
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

  return c.json({ status: "received", detail: "TODO: email delivery is not wired up yet." }, 202);
});
