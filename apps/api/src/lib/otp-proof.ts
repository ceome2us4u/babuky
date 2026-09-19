import { createHmac, timingSafeEqual } from "node:crypto";

// A short-lived, signed receipt that "this phone just passed an OTP check".
// The OTP is checked once (MSG91 won't accept the same code twice), and the
// signup / reset-password step that follows presents this receipt instead.
//
//   purpose "signup" -> may create an account / set the first password
//   purpose "reset"  -> may replace the password of an existing account
//
// Format: base64url(`phone|purpose|issuedAtMs`) . base64url(hmac). Keyed with
// SESSION_SECRET under its own label, so it can never double as a session token.

export type ProofPurpose = "signup" | "reset";
export const PROOF_TTL_MS = 10 * 60 * 1000;

function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(`otp-proof|${payload}`).digest();
}

export function issueProof(phone: string, purpose: ProofPurpose, now = Date.now()): string {
  const payload = Buffer.from(`${phone}|${purpose}|${now}`).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

/** The proof's phone + issue time if it is genuine, unexpired and for `purpose`; otherwise null. */
export function readProof(
  proof: unknown,
  purpose: ProofPurpose,
  now = Date.now(),
): { phone: string; issuedAt: Date } | null {
  if (typeof proof !== "string" || proof.length > 300) return null;
  const [payload, mac] = proof.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const [phone, proofPurpose, issued] = Buffer.from(payload, "base64url").toString().split("|");
  const issuedAt = Number(issued);
  if (proofPurpose !== purpose || !phone || !Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > PROOF_TTL_MS || issuedAt > now + 60_000) return null;
  return { phone, issuedAt: new Date(issuedAt) };
}
