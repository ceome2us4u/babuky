// Input rules enforced server-side. apps/web has the same rules for instant
// feedback (apps/web/src/lib/validate.ts) — keep the two in sync; this side is
// the one that actually protects the database.

export const LIMITS = {
  fullName: 100,
  email: 255,
  business: 120,
  city: 100,
  shopName: 120,
  address: 500,
  itemName: 120,
  brand: 80,
  description: 500,
  category: 60,
  projectDescription: 2000,
  message: 2000,
  search: 60,
  upiName: 60,
  maxPricePaise: 100_000_000, // ₹10,00,000
  maxStock: 999_999,
  maxLeadItems: 30,
} as const;

// Indian mobile: 10 digits, starts with 6-9.
export const PHONE_RE = /^[6-9]\d{9}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The name a shop owner sees in their own UPI app for their UPI ID (shown to buyers next to the QR).
export const UPI_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .&'()-]{1,59}$/u;
// DNS-safe label: a-z0-9 with single inner hyphens, 3-24 chars.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSlug = (s: string) => s.length >= 3 && s.length <= 24 && SLUG_RE.test(s);
// Person names: letters (any script), spaces, and . ' - only — no digits.
export const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]{1,99}$/u;

// Control characters (other than tab/newline) have no business in any field.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Trimmed string, or "" if the value isn't a string. */
export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Returns an error message if `s` is over `max` or has control characters. */
export function textError(label: string, s: string, max: number): string | null {
  if (s.length > max) return `${label} must be at most ${max} characters`;
  if (CONTROL_RE.test(s)) return `${label} contains invalid characters`;
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

export function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}
