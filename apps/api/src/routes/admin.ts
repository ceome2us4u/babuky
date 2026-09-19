import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { query } from "../lib/db.js";
import { verifyPassword, PASSWORD_MAX } from "../lib/password.js";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminOriginGuard,
  createAdminSession,
  destroyAdminSession,
  isAdminEmail,
  requireAdmin,
  type AdminEnv,
} from "../lib/admin-auth.js";
import { EMAIL_RE, LIMITS } from "../lib/validation.js";
import { adminData } from "./admin-data.js";

// Internal console for the founder (babuki.com/admin). Everything here is
// behind adminOriginGuard (only the babuki.com site may call it) and, except
// login, requireAdmin. See docs/architecture.md → "Admin console".
export const admin = new Hono<AdminEnv>();

admin.use("*", adminOriginGuard);

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const WRONG_LOGIN = "That email and password don't match.";

admin.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email) || email.length > LIMITS.email || !password) {
    return c.json({ error: "Enter your email and password" }, 400);
  }

  const allowed = isAdminEmail(email);
  const { rows } = allowed
    ? await query<{ password_hash: string; locked_until: string | null }>(
        "SELECT password_hash, locked_until FROM admin_users WHERE email = $1",
        [email],
      )
    : { rows: [] };
  const user = rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    return c.json({ error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes.` }, 429);
  }

  // Always spend the same hashing time, whether or not the email is an admin.
  const ok = password.length <= PASSWORD_MAX && (await verifyPassword(password, user?.password_hash ?? null));
  if (!user || !ok) {
    if (user) {
      const { rows: after } = await query<{ locked_until: string | null }>(
        `UPDATE admin_users SET
           failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE email = $1
         RETURNING locked_until`,
        [email, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      if (after[0]?.locked_until && new Date(after[0].locked_until) > new Date()) {
        return c.json({ error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes.` }, 429);
      }
    }
    return c.json({ error: WRONG_LOGIN }, 401);
  }

  await query("UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE email = $1", [email]);
  // A fresh login replaces any earlier admin sessions for this email.
  await query("DELETE FROM admin_sessions WHERE admin_email = $1", [email]);
  const token = await createAdminSession(email);
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return c.json({ ok: true, email });
});

admin.post("/logout", async (c) => {
  await destroyAdminSession(getCookie(c, ADMIN_COOKIE));
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

admin.get("/me", requireAdmin, (c) => c.json({ email: c.get("adminEmail") }));

admin.route("/", adminData);
