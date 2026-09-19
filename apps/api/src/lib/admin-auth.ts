import { createHmac, randomBytes } from "node:crypto";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { query } from "./db.js";
import { isTestMode } from "./mode.js";

// Admin sessions: same opaque-token design as customer sessions (raw token in
// the cookie, only its HMAC in the DB) but a separate table, a separate cookie
// and a short lifetime. Who may be an admin is the ADMIN_EMAILS allowlist in
// the API's env (Home's FOUNDER_EMAIL idea) — no allowlist means nobody can.

export const ADMIN_COOKIE = "babuki_admin";
const ADMIN_SESSION_HOURS = 12;
export const ADMIN_SESSION_SECONDS = ADMIN_SESSION_HOURS * 60 * 60;

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isAdminEmail = (email: string) => adminEmails().includes(email.trim().toLowerCase());

function hashToken(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  // Own label so an admin token hash can never equal a customer session hash.
  return createHmac("sha256", secret).update(`admin|${token}`).digest("hex");
}

export async function createAdminSession(email: string) {
  const token = randomBytes(32).toString("hex");
  await query("INSERT INTO admin_sessions (admin_email, token_hash, expires_at) VALUES ($1, $2, $3)", [
    email,
    hashToken(token),
    new Date(Date.now() + ADMIN_SESSION_SECONDS * 1000),
  ]);
  return token;
}

export async function destroyAdminSession(token: string | undefined) {
  if (!token) return;
  await query("DELETE FROM admin_sessions WHERE token_hash = $1", [hashToken(token)]);
}

/** The signed-in admin's email, or null (no/expired session, or no longer on the allowlist). */
export async function getAdminEmail(c: Context): Promise<string | null> {
  const token = getCookie(c, ADMIN_COOKIE);
  if (!token) return null;
  const { rows } = await query<{ admin_email: string; expires_at: string }>(
    "SELECT admin_email, expires_at FROM admin_sessions WHERE token_hash = $1",
    [hashToken(token)],
  );
  const s = rows[0];
  if (!s || new Date(s.expires_at) < new Date() || !isAdminEmail(s.admin_email)) return null;
  return s.admin_email;
}

// The admin UI is only ever served from babuki.com. Refusing any other Origin
// (the API's CORS otherwise trusts every *.babuki.com vendor subdomain) means a
// vendor-subdomain page can't drive admin endpoints even if it tried. The cookie
// is also SameSite=Strict. Localhost is allowed only in APP_MODE=test.
const ADMIN_ORIGINS = new Set(["https://babuki.com", "https://www.babuki.com"]);

function originAllowed(origin: string | undefined) {
  if (!origin) return false;
  if (ADMIN_ORIGINS.has(origin)) return true;
  return isTestMode() && /^http:\/\/localhost(:\d+)?$/.test(origin);
}

export const adminOriginGuard: MiddlewareHandler = async (c, next) => {
  // Preflights are answered by the CORS middleware before this point.
  if (c.req.method !== "OPTIONS" && !originAllowed(c.req.header("origin"))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
};

export type AdminEnv = { Variables: { adminEmail: string } };

/** 401 unless the request carries a valid admin session; sets `adminEmail` for the handler. */
export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const email = await getAdminEmail(c);
  if (!email) return c.json({ error: "Not signed in" }, 401);
  c.set("adminEmail", email);
  await next();
};

/** Records what an admin changed. */
export async function auditAdmin(
  email: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
) {
  await query(
    "INSERT INTO admin_actions (admin_email, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)",
    [email, action, targetType, targetId, JSON.stringify(details)],
  );
}
