import { Hono } from "hono";

export const contact = new Hono();

// TODO: wire up real delivery (e.g. AWS SES) once Google Workspace / a
// public contact address exists. For now this just validates the payload
// and confirms receipt without sending anything.
contact.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.message !== "string") {
    return c.json({ error: "name, email, and message are required" }, 400);
  }
  if (!body.name.trim() || !body.email.trim() || !body.message.trim()) {
    return c.json({ error: "name, email, and message cannot be empty" }, 400);
  }

  return c.json({ status: "received", detail: "TODO: email delivery is not wired up yet." }, 202);
});
