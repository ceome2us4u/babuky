import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { getSessionPhone, SESSION_COOKIE } from "./session.js";

// Reads the session cookie via Hono's context. The cookie is host-only for
// api.babuki.com (no explicit Domain attribute needed) — babuki.com and
// every *.babuki.com vendor subdomain share a registrable domain with
// api.babuki.com, so it's "same-site" for SameSite=Lax purposes even
// though it's a different origin; the browser attaches it on any fetch()
// to api.babuki.com regardless of which subdomain's page made the call.
export async function getSessionUserPhone(c: Context): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  return getSessionPhone(token);
}
