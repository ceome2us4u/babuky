// Runs ON the box via scripts/set-admin-password.sh. Sets (or resets) the
// admin console password for one allowlisted email. The password arrives on
// STDIN — never in argv, env or a log — is hashed here, and only the hash is
// stored. There is deliberately no other way to create an admin.
import { adminEmails } from "../lib/admin-auth.js";
import { query } from "../lib/db.js";
import { hashPassword, passwordError } from "../lib/password.js";

const ADMIN_PASSWORD_MIN = 12;

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || !adminEmails().includes(email)) {
  console.error(`"${email}" is not in ADMIN_EMAILS on this server — add it there first (scripts/deploy.sh sets it).`);
  process.exit(1);
}

const password = await readStdin();
const problem =
  password.length < ADMIN_PASSWORD_MIN
    ? `Admin password must be at least ${ADMIN_PASSWORD_MIN} characters`
    : passwordError(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

await query(
  `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)
   ON CONFLICT (email) DO UPDATE SET
     password_hash = EXCLUDED.password_hash, password_set_at = now(), failed_login_count = 0, locked_until = NULL`,
  [email, await hashPassword(password)],
);
// A password change signs out any admin session that already exists.
await query("DELETE FROM admin_sessions WHERE admin_email = $1", [email]);

console.log(`Admin password set for ${email}. You can now sign in at https://babuki.com/admin`);
process.exit(0);
