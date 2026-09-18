import { createHmac, randomBytes } from "node:crypto";
import { query } from "./db.js";

export const SESSION_COOKIE = "babuki_session";
const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

function hashToken(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return createHmac("sha256", secret).update(token).digest("hex");
}

// Opaque bearer token: the cookie holds the raw token, only its HMAC is
// stored server-side, so a DB leak alone can't be replayed as a session.
export async function createSession(phone: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await query("INSERT INTO sessions (user_phone, token_hash, expires_at) VALUES ($1, $2, $3)", [
    phone,
    hashToken(token),
    expiresAt,
  ]);

  return { token, expiresAt };
}

export async function getSessionPhone(token: string | undefined): Promise<string | null> {
  if (!token) return null;

  const { rows } = await query<{ user_phone: string; expires_at: string }>(
    "SELECT user_phone, expires_at FROM sessions WHERE token_hash = $1",
    [hashToken(token)],
  );

  const session = rows[0];
  if (!session || new Date(session.expires_at) < new Date()) return null;

  return session.user_phone;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}
