// Phone codes (OTP). Used only to prove a phone number: at signup and for
// "forgot password" — never for everyday login (see routes/auth.ts).
//
// How it works:
//  - Babuki generates the code, stores only a keyed hash of it (otp_codes),
//    and asks MSG91 to DELIVER it via the Flow API. MSG91 doesn't know the
//    code's meaning and isn't asked to check it — verification is ours, so the
//    code is single-use, expires, and locks after a few wrong tries.
//  - Why Flow and not MSG91's /otp endpoint: the DLT-approved template we use
//    (currently Me2Us4U's existing one, until Babuki gets its own header +
//    template) has a merge variable called `number`; /otp only drives a
//    variable literally named `OTP`. Flow maps any variable name.
//  - Required env: MSG91_AUTH_KEY (same MSG91 account as Me2Us4U's other
//    products), MSG91_OTP_TEMPLATE_ID. Optional: MSG91_OTP_VAR (merge-variable
//    name, default "number").
//  - APP_MODE=test (see ./mode.ts): nothing is sent, nothing is stored, and the
//    fixed code below passes for any number.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";
import { isTestMode } from "./mode.js";

const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";

// OTP length shared by the code we generate, the verify check and the UI
// (apps/web/src/lib/validate.ts OTP_LENGTH) — keep them in sync.
export const OTP_LENGTH = 5;

// In APP_MODE=test no SMS is ever sent and this fixed code is accepted for ANY
// phone number (returned to the UI as `devOtpHint`, like Home). That means
// anyone can pass the phone check as anyone, so it exists only for the period
// before real SMS is switched on.
export const OTP_TEST_CODE = "12345";

const CODE_TTL_MINUTES = 10;
const MAX_WRONG_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_SENDS_PER_HOUR = 5;

export type OtpPurpose = "signup" | "reset";

/** A limit was hit (too soon / too many). The message is safe to show the user. */
export class OtpLimitError extends Error {}

function getConfig() {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  if (!authKey || !templateId) {
    throw new Error("MSG91 is not configured yet — set MSG91_AUTH_KEY / MSG91_OTP_TEMPLATE_ID.");
  }
  return { authKey, templateId, varName: process.env.MSG91_OTP_VAR || "number" };
}

function hashCode(phone: string, purpose: OtpPurpose, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(`otp|${phone}|${purpose}|${code}`).digest("hex");
}

// phone is +91XXXXXXXXXX; MSG91 expects it without the "+".
const toMsg91Mobile = (phone: string) => phone.replace(/^\+/, "");

export async function sendOtp(phone: string, purpose: OtpPurpose): Promise<{ testMode: boolean }> {
  if (isTestMode()) return { testMode: true };

  // Per-phone limits, kept in the database so they survive restarts.
  const { rows } = await query<{ recent: number; last_age: number | null }>(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS recent,
            extract(epoch FROM now() - max(created_at))::float8 AS last_age
       FROM otp_sends WHERE phone = $1`,
    [phone],
  );
  const { recent, last_age: lastAge } = rows[0];
  if (lastAge !== null && lastAge < RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - lastAge);
    throw new OtpLimitError(`Please wait ${wait} seconds before asking for another code.`);
  }
  if (recent >= MAX_SENDS_PER_HOUR) {
    throw new OtpLimitError("Too many codes were requested for this number. Please try again in an hour.");
  }

  const { authKey, templateId, varName } = getConfig();

  // No leading zero, so the code is always exactly OTP_LENGTH digits.
  const code = String(randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH));
  await query(
    `INSERT INTO otp_codes (phone, purpose, code_hash, attempts, expires_at, created_at)
     VALUES ($1, $2, $3, 0, now() + make_interval(mins => $4), now())
     ON CONFLICT (phone, purpose) DO UPDATE SET
       code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()`,
    [phone, purpose, hashCode(phone, purpose, code), CODE_TTL_MINUTES],
  );

  try {
    const res = await fetch(MSG91_FLOW_URL, {
      method: "POST",
      headers: { authkey: authKey, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        realTimeResponse: "1",
        recipients: [{ mobiles: toMsg91Mobile(phone), [varName]: code }],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || data.type !== "success") {
      throw new Error(`MSG91 send failed: ${data.message ?? res.status}`);
    }
  } catch (error) {
    // Nothing reached the phone, so the stored code is useless — and a failed
    // send shouldn't count against the person's hourly allowance.
    await query("DELETE FROM otp_codes WHERE phone = $1 AND purpose = $2", [phone, purpose]);
    throw error;
  }

  await query("INSERT INTO otp_sends (phone) VALUES ($1)", [phone]);
  // Housekeeping: the log only needs the last day.
  await query("DELETE FROM otp_sends WHERE created_at < now() - interval '1 day'");
  return { testMode: false };
}

export async function verifyOtp(phone: string, otp: string, purpose: OtpPurpose): Promise<boolean> {
  if (isTestMode()) return otp === OTP_TEST_CODE;

  const { rows } = await query<{ code_hash: string; attempts: number }>(
    "SELECT code_hash, attempts FROM otp_codes WHERE phone = $1 AND purpose = $2 AND expires_at > now()",
    [phone, purpose],
  );
  const row = rows[0];
  if (!row || row.attempts >= MAX_WRONG_ATTEMPTS) return false;

  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(hashCode(phone, purpose, otp), "hex");
  if (expected.length === given.length && timingSafeEqual(expected, given)) {
    // Single use: the code is gone the moment it's accepted.
    await query("DELETE FROM otp_codes WHERE phone = $1 AND purpose = $2", [phone, purpose]);
    return true;
  }

  await query("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1 AND purpose = $2", [phone, purpose]);
  return false;
}
