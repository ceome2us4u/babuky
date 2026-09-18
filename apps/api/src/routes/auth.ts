import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sendOtp, verifyOtp } from "../lib/msg91.js";
import { query } from "../lib/db.js";
import { createSession, destroySession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../lib/session.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { LEAD_SOURCES } from "../lib/constants.js";

export const auth = new Hono();

auth.post("/otp/send", async (c) => {
  const body = await c.req.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const leadSource = body?.leadSource;
  const consent = body?.consent === true;

  if (!/^\d{10}$/.test(phone)) {
    return c.json({ error: "phone must be a 10-digit mobile number" }, 400);
  }
  if (!LEAD_SOURCES.includes(leadSource)) {
    return c.json({ error: "leadSource is invalid" }, 400);
  }
  if (!consent) {
    return c.json({ error: "consent is required" }, 400);
  }

  try {
    await sendOtp(`+91${phone}`);
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send OTP";
    return c.json({ error: message }, 503);
  }
});

auth.post("/otp/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  const phoneDigits = typeof body?.phone === "string" ? body.phone : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";
  const leadSource = body?.leadSource;
  const consent = body?.consent === true;

  if (!/^\d{10}$/.test(phoneDigits) || !/^\d{4,6}$/.test(otp)) {
    return c.json({ error: "phone and otp are required" }, 400);
  }
  if (!LEAD_SOURCES.includes(leadSource)) {
    return c.json({ error: "leadSource is invalid" }, 400);
  }

  const phone = `+91${phoneDigits}`;

  let verified: boolean;
  try {
    verified = await verifyOtp(phone, otp);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify OTP";
    return c.json({ error: message }, 503);
  }

  if (!verified) {
    return c.json({ error: "Incorrect or expired OTP" }, 401);
  }

  await query(
    `INSERT INTO users (phone, consent, verified_at)
     VALUES ($1, $2, now())
     ON CONFLICT (phone) DO UPDATE SET consent = EXCLUDED.consent, verified_at = now()`,
    [phone, consent],
  );
  await query(
    `INSERT INTO user_lead_sources (user_phone, lead_source) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [phone, leadSource],
  );

  const { rows: profileRows } = await query("SELECT 1 FROM user_profiles WHERE user_phone = $1", [phone]);
  const hasProfile = profileRows.length > 0;

  const { token } = await createSession(phone);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({ ok: true, hasProfile });
});

auth.post("/profile", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const accountType = body?.accountType;
  const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";

  if (!fullName) {
    return c.json({ error: "fullName is required" }, 400);
  }
  if (accountType !== "business" && accountType !== "individual") {
    return c.json({ error: "accountType must be business or individual" }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "email is invalid" }, 400);
  }
  if (accountType === "business" && !businessName) {
    return c.json({ error: "businessName is required for business accounts" }, 400);
  }
  if (!city) {
    return c.json({ error: "city is required" }, 400);
  }

  await query(
    `INSERT INTO user_profiles (user_phone, full_name, email, account_type, business_name, city, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_phone) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       email = EXCLUDED.email,
       account_type = EXCLUDED.account_type,
       business_name = EXCLUDED.business_name,
       city = EXCLUDED.city,
       updated_at = now()`,
    [phone, fullName, email, accountType, accountType === "business" ? businessName : "", city],
  );

  return c.json({ ok: true });
});

// A signed-in user can pick up another lead-source tag without a fresh OTP
// (e.g. a buyer who later onboards a shop). Lead sources gate the
// merchant/buyer/consultancy endpoints, so the UI calls this before them.
auth.post("/lead-source", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const leadSource = body?.leadSource;
  if (!LEAD_SOURCES.includes(leadSource)) {
    return c.json({ error: "leadSource is invalid" }, 400);
  }

  await query(
    `INSERT INTO user_lead_sources (user_phone, lead_source) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [phone, leadSource],
  );
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const [{ rows: leadRows }, { rows: profileRows }] = await Promise.all([
    query<{ lead_source: string }>("SELECT lead_source FROM user_lead_sources WHERE user_phone = $1", [phone]),
    query(
      "SELECT full_name, email, account_type, business_name, city FROM user_profiles WHERE user_phone = $1",
      [phone],
    ),
  ]);

  return c.json({
    phone,
    leadSources: leadRows.map((row) => row.lead_source),
    profile: profileRows[0] ?? null,
  });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  await destroySession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
