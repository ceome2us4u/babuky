import type { Context } from "hono";

// Small in-memory fixed-window limiter for public endpoints that write to the
// database (e.g. the contact form). One API process, so a Map is enough; it
// resets on restart, which is acceptable for spam control.

const hits = new Map<string, { count: number; resetAt: number }>();

/** The caller's IP. Behind Nginx the LAST X-Forwarded-For entry is the one Nginx itself appended. */
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",").pop()!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

/** true = allowed; false = over the limit for this key in the current window. */
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
