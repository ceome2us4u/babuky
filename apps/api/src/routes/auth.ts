import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isTestMode, publicError } from "../lib/mode.js";
import { OTP_LENGTH, OTP_TEST_CODE, sendOtp, verifyOtp } from "../lib/msg91.js";
import { query } from "../lib/db.js";
import { createSession, destroySession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../lib/session.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { LEAD_SOURCES } from "../lib/constants.js";
import { hashPassword, passwordError, PASSWORD_MAX, verifyPassword } from "../lib/password.js";
import { issueProof, readProof } from "../lib/otp-proof.js";
import { EMAIL_RE, LIMITS, NAME_RE, PHONE_RE, str, textError } from "../lib/validation.js";

export const auth = new Hono();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const WRONG_LOGIN = "That phone number and password don't match. Forgot your password? Use “Forgot password”.";
const PROOF_EXPIRED = "Your phone check expired. Please start again.";
const ALREADY_REGISTERED = "This number already has an account. Log in with your password instead.";

async function signIn(c: Context, phone: string) {
  const { token } = await createSession(phone);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  const { rows } = await query("SELECT 1 FROM user_profiles WHERE user_phone = $1", [phone]);
  return c.json({ ok: true, hasProfile: rows.length > 0 });
}

async function tagLeadSource(phone: string, leadSource: unknown) {
  if (!LEAD_SOURCES.includes(leadSource as never)) return;
  await query(
    `INSERT INTO user_lead_sources (user_phone, lead_source) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [phone, leadSource],
  );
}

// OTP is only used to prove phone ownership: when signing up, and when
// resetting a forgotten password. Everyday login is phone + password.
auth.post("/otp/send", async (c) => {
  const body = await c.req.json().catch(() => null);
  const phoneDigits = typeof body?.phone === "string" ? body.phone : "";
  const purpose = body?.purpose;
  const leadSource = body?.leadSource;
  const consent = body?.consent === true;

  if (!PHONE_RE.test(phoneDigits)) {
    return c.json({ error: "Enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9)" }, 400);
  }
  if (purpose !== "signup" && purpose !== "reset") {
    return c.json({ error: "purpose is invalid" }, 400);
  }
  if (purpose === "signup" && !LEAD_SOURCES.includes(leadSource)) {
    return c.json({ error: "leadSource is invalid" }, 400);
  }
  if (purpose === "signup" && !consent) {
    return c.json({ error: "consent is required" }, 400);
  }

  const phone = `+91${phoneDigits}`;
  const { rows } = await query<{ has_password: boolean }>(
    "SELECT password_hash IS NOT NULL AS has_password FROM users WHERE phone = $1",
    [phone],
  );
  const user = rows[0];

  if (purpose === "signup" && user?.has_password) {
    return c.json({ error: ALREADY_REGISTERED }, 409);
  }

  try {
    // Forgot-password never reveals whether a number has an account: no SMS
    // goes to numbers without one, but the reply is identical either way.
    // APP_MODE=test: no SMS is ever sent; the code comes back as `devOtpHint`
    // (same field name Home uses) so the UI can show it instead of leaving
    // people waiting for a text that will never arrive.
    const sent = purpose === "reset" && !user ? { testMode: isTestMode() } : await sendOtp(phone);
    return c.json(sent.testMode ? { ok: true, devOtpHint: OTP_TEST_CODE } : { ok: true });
  } catch (error) {
    const message = publicError(error, "We couldn't send your OTP right now. Please try again in a moment.");
    return c.json({ error: message }, 503);
  }
});

// Checks the OTP and hands back a short-lived signed receipt. No session yet:
// the next step (signup or reset) sets the password and signs the user in.
auth.post("/otp/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  const phoneDigits = typeof body?.phone === "string" ? body.phone : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";
  const purpose = body?.purpose;

  if (!PHONE_RE.test(phoneDigits) || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
    return c.json({ error: "A valid mobile number and the OTP are required" }, 400);
  }
  if (purpose !== "signup" && purpose !== "reset") {
    return c.json({ error: "purpose is invalid" }, 400);
  }

  const phone = `+91${phoneDigits}`;

  let verified: boolean;
  try {
    verified = await verifyOtp(phone, otp);
  } catch (error) {
    const message = publicError(error, "We couldn't check your OTP right now. Please try again in a moment.");
    return c.json({ error: message }, 503);
  }
  if (!verified) {
    return c.json({ error: "Incorrect or expired OTP" }, 401);
  }

  return c.json({ ok: true, proof: issueProof(phone, purpose) });
});

auth.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const proof = readProof(body?.proof, "signup");
  if (!proof) return c.json({ error: PROOF_EXPIRED }, 401);

  const password = typeof body?.password === "string" ? body.password : "";
  const problem = passwordError(password, proof.phone.slice(3));
  if (problem) return c.json({ error: problem }, 400);
  if (!LEAD_SOURCES.includes(body?.leadSource)) return c.json({ error: "leadSource is invalid" }, 400);
  if (body?.consent !== true) return c.json({ error: "consent is required" }, 400);

  // Only succeeds while the account has no password yet, so a receipt can't be
  // replayed to overwrite an existing account's password.
  const { rows } = await query(
    `INSERT INTO users (phone, consent, verified_at, password_hash, password_set_at)
     VALUES ($1, true, now(), $2, now())
     ON CONFLICT (phone) DO UPDATE SET
       consent = true, verified_at = now(), password_hash = EXCLUDED.password_hash,
       password_set_at = now(), failed_login_count = 0, locked_until = NULL
     WHERE users.password_hash IS NULL
     RETURNING phone`,
    [proof.phone, await hashPassword(password)],
  );
  if (rows.length === 0) return c.json({ error: ALREADY_REGISTERED }, 409);

  await tagLeadSource(proof.phone, body.leadSource);
  return signIn(c, proof.phone);
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const phoneDigits = typeof body?.phone === "string" ? body.phone : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!PHONE_RE.test(phoneDigits) || !password) {
    return c.json({ error: "Enter your phone number and password" }, 400);
  }

  const phone = `+91${phoneDigits}`;
  const { rows } = await query<{ password_hash: string | null; locked_until: string | null }>(
    "SELECT password_hash, locked_until FROM users WHERE phone = $1",
    [phone],
  );
  const user = rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
    return c.json(
      { error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.` },
      429,
    );
  }

  const ok = password.length <= PASSWORD_MAX && (await verifyPassword(password, user?.password_hash ?? null));
  if (!user || !ok) {
    if (user) {
      const { rows: after } = await query<{ locked_until: string | null }>(
        `UPDATE users SET
           failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE phone = $1
         RETURNING locked_until`,
        [phone, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      if (after[0]?.locked_until && new Date(after[0].locked_until) > new Date()) {
        return c.json(
          { error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes, or reset your password.` },
          429,
        );
      }
    }
    return c.json({ error: WRONG_LOGIN }, 401);
  }

  await query("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE phone = $1", [phone]);
  await tagLeadSource(phone, body?.leadSource);
  return signIn(c, phone);
});

auth.post("/password/reset", async (c) => {
  const body = await c.req.json().catch(() => null);
  const proof = readProof(body?.proof, "reset");
  if (!proof) return c.json({ error: PROOF_EXPIRED }, 401);

  const password = typeof body?.password === "string" ? body.password : "";
  const problem = passwordError(password, proof.phone.slice(3));
  if (problem) return c.json({ error: problem }, 400);

  // The receipt is single-use: it stops working once a password has been set
  // after it was issued.
  const { rows } = await query(
    `UPDATE users SET password_hash = $2, password_set_at = now(), failed_login_count = 0, locked_until = NULL
     WHERE phone = $1 AND (password_set_at IS NULL OR password_set_at < $3)
     RETURNING phone`,
    [proof.phone, await hashPassword(password), proof.issuedAt],
  );
  if (rows.length === 0) {
    return c.json({ error: "This reset has expired or was already used. Please start again." }, 400);
  }

  // Anyone still signed in with the old password (e.g. a lost phone) is signed out.
  await query("DELETE FROM sessions WHERE user_phone = $1", [proof.phone]);
  return signIn(c, proof.phone);
});

auth.post("/profile", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const fullName = str(body?.fullName);
  const email = str(body?.email);
  const accountType = body?.accountType;
  const businessName = str(body?.businessName);
  const city = str(body?.city);

  if (!fullName) {
    return c.json({ error: "fullName is required" }, 400);
  }
  if (!NAME_RE.test(fullName)) {
    return c.json({ error: "Name can only contain letters, spaces and . ' -" }, 400);
  }
  if (accountType !== "business" && accountType !== "individual") {
    return c.json({ error: "accountType must be business or individual" }, 400);
  }
  if (email && !EMAIL_RE.test(email)) {
    return c.json({ error: "email is invalid" }, 400);
  }
  if (accountType === "business" && !businessName) {
    return c.json({ error: "businessName is required for business accounts" }, 400);
  }
  if (!city) {
    return c.json({ error: "city is required" }, 400);
  }
  const tooLong =
    textError("Name", fullName, LIMITS.fullName) ??
    textError("Email", email, LIMITS.email) ??
    textError("Business name", businessName, LIMITS.business) ??
    textError("City", city, LIMITS.city);
  if (tooLong) {
    return c.json({ error: tooLong }, 400);
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

// A signed-in user can pick up another lead-source tag without re-authenticating
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

  await tagLeadSource(phone, leadSource);
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
