// Input rules shared by every form in the web app. apps/api enforces the same
// rules again in apps/api/src/lib/validation.ts (the API never trusts the
// browser) — keep the two in sync.

export const LIMITS = {
  fullName: 100,
  email: 255,
  business: 120,
  city: 100,
  shopName: 120,
  itemName: 120,
  brand: 80,
  description: 500,
  category: 60,
  projectDescription: 2000,
  message: 2000,
  search: 60,
  upi: 100,
  stock: 999_999,
  maxPriceRupees: 1_000_000,
} as const;

// Sign-in code length — must match OTP_LENGTH in apps/api/src/lib/msg91.ts.
export const OTP_LENGTH = 5;

// Indian mobile numbers are 10 digits and start with 6-9.
export const PHONE_RE = /^[6-9]\d{9}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// DNS-safe label: a-z0-9 with single inner hyphens, 3-24 chars.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Same pattern the API uses for UPI VPAs (name@bank).
export const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{2,64}$/;
// Person names: letters (any script), spaces, and . ' - only — no digits.
export const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]{1,99}$/u;

/**
 * Keeps only digits, max 10. Also copes with pasted numbers: "+91 98765 43210"
 * and "098765 43210" become the 10-digit number instead of a mangled prefix.
 */
export function phoneInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** null when fine (or still being typed); otherwise what to tell the user. */
export function phoneError(digits: string): string | null {
  if (digits.length === 0) return null;
  if (!/^[6-9]/.test(digits)) return "Mobile numbers start with 6, 7, 8 or 9";
  if (digits.length < 10) return `Enter all 10 digits (${digits.length}/10)`;
  return null;
}

export function nameError(v: string, what = "name"): string | null {
  const s = v.trim();
  if (!s) return null; // emptiness is reported by the required-field check
  if (s.length < 2) return `Enter your full ${what}`;
  if (!NAME_RE.test(s)) return "Use letters only (spaces, . ' - allowed)";
  return null;
}

export function emailError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  return EMAIL_RE.test(s) ? null : "Enter a valid email address";
}

export function slugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 24);
}

export function slugError(slug: string): string | null {
  if (!slug) return null;
  if (slug.length < 3) return "At least 3 characters";
  if (!SLUG_RE.test(slug)) return "Can't start or end with a hyphen";
  return null;
}

export function upiInput(raw: string): string {
  return raw.replace(/\s/g, "").slice(0, LIMITS.upi);
}

export function upiError(v: string): string | null {
  if (!v) return null;
  return UPI_RE.test(v) ? null : "Enter a valid UPI ID, like name@bank";
}

/** Digits and at most one dot, max 2 decimals and 7 integer digits. */
export function priceInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const [int = "", ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, 2);
  const head = int.slice(0, 7);
  return rest.length > 0 ? `${head}.${decimals}` : head;
}

export function priceError(v: string): string | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Enter a valid price";
  if (n > LIMITS.maxPriceRupees) return "Price is too high";
  return null;
}

/** Whole, non-negative digits only. */
export function intInput(raw: string, maxDigits = 6): string {
  return raw.replace(/\D/g, "").slice(0, maxDigits);
}
