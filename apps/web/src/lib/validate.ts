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
  upiName: 60,
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
// The name a shop owner's UPI app shows for their UPI ID (same rule as the API's UPI_NAME_RE).
export const UPI_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .&'()-]{1,59}$/u;
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

// Same rules as passwordError() in apps/api/src/lib/password.ts (which also
// rejects a short list of very common passwords).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/** The rules a new password has to meet, each with whether `v` currently meets it. */
export function passwordChecks(v: string, phoneDigits = ""): { label: string; ok: boolean }[] {
  return [
    { label: `At least ${PASSWORD_MIN} characters`, ok: v.length >= PASSWORD_MIN },
    { label: "A letter and a number", ok: /[A-Za-z]/.test(v) && /\d/.test(v) },
    ...(phoneDigits.length === 10
      ? [{ label: "Not your phone number", ok: !v.includes(phoneDigits) }]
      : []),
  ];
}

/** null when fine (or still being typed); otherwise what to tell the user. */
export function passwordError(v: string, phoneDigits = ""): string | null {
  if (v.length === 0) return null;
  return passwordChecks(v, phoneDigits).find((c) => !c.ok)?.label ?? null;
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

// Own web address search (mirrors apps/api/src/lib/domains.ts parseDomainQuery):
// a name of 3–40 of a-z0-9 with single inner hyphens, optionally followed by
// an ending the merchant typed (".shop", ".co.in").
const DOMAIN_LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_ENDING_RE = /^(\.[a-z]{2,24}){1,2}$/;

/** Sanitises as you type: lower-case, only a-z 0-9 - and dots, one dot at a time. */
export function domainInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^[-.]+/, "")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .slice(0, 60);
}

export function domainQueryError(q: string): string | null {
  if (!q) return null;
  const dot = q.indexOf(".");
  const label = dot < 0 ? q : q.slice(0, dot);
  const ending = dot < 0 ? "" : q.slice(dot);
  if (label.length < 3) return "At least 3 letters or numbers";
  if (label.length > 40) return "At most 40 letters or numbers";
  if (!DOMAIN_LABEL_RE.test(label)) return "Can't start or end with a hyphen";
  if (ending && ending !== "." && !DOMAIN_ENDING_RE.test(ending.replace(/\.$/, ""))) return "That ending doesn't look right";
  return null;
}

export function upiInput(raw: string): string {
  return raw.replace(/\s/g, "").slice(0, LIMITS.upi);
}

/** Keeps only characters a UPI name can contain. */
export function upiNameInput(raw: string): string {
  return raw.replace(/[^\p{L}\p{M}\p{N} .&'()-]/gu, "").slice(0, LIMITS.upiName);
}

export function upiNameError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s.length < 2) return "Type the whole name your UPI app showed";
  return UPI_NAME_RE.test(s) ? null : "Use letters, numbers and . & ' ( ) - only";
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
