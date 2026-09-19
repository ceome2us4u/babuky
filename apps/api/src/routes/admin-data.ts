import { Hono, type Context } from "hono";
import { query } from "../lib/db.js";
import { auditAdmin, requireAdmin, type AdminEnv } from "../lib/admin-auth.js";
import { LIMITS, isUuid, str, textError } from "../lib/validation.js";

// Read views over every enquiry/entity with all of its inputs, plus status and
// notes on the two enquiry types. Mounted under /admin by routes/admin.ts;
// every route needs an admin session.
export const adminData = new Hono<AdminEnv>();

const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
const MESSAGE_STATUSES = ["new", "replied", "closed"] as const;
const NOTES_MAX = 2000;

function paging(c: Context) {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  return { limit, offset };
}

/** Case-insensitive "contains" pattern with LIKE wildcards escaped. */
function likePattern(raw: string | undefined) {
  const q = (raw ?? "").trim().slice(0, LIMITS.search);
  return q ? `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%` : null;
}

adminData.get("/overview", requireAdmin, async (c) => {
  const [{ rows: counts }, { rows: feed }, { rows: actions }] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*)::int FROM consultancy_leads) AS estimates_total,
         (SELECT count(*)::int FROM consultancy_leads WHERE status = 'new') AS estimates_new,
         (SELECT count(*)::int FROM consultancy_leads WHERE deposit_status = 'paid') AS estimates_paid,
         (SELECT count(*)::int FROM consultancy_leads WHERE deposit_status = 'pending') AS estimates_unpaid,
         (SELECT count(*)::int FROM contact_messages) AS messages_total,
         (SELECT count(*)::int FROM contact_messages WHERE status = 'new') AS messages_new,
         (SELECT count(*)::int FROM shops) AS shops_total,
         (SELECT count(*)::int FROM shops WHERE status = 'active') AS shops_active,
         (SELECT count(*)::int FROM shops WHERE status = 'draft') AS shops_draft,
         (SELECT count(*)::int FROM shops WHERE status = 'suspended') AS shops_suspended,
         (SELECT count(*)::int FROM users) AS users_total`,
    ),
    query(
      `SELECT * FROM (
         (SELECT 'estimate' AS kind, id::text AS id, name AS title,
                 ticket_ref || CASE WHEN deposit_status = 'paid' THEN ' · paid' ELSE ' · not paid yet' END AS detail, created_at
            FROM consultancy_leads ORDER BY created_at DESC LIMIT 10)
         UNION ALL
         (SELECT 'message', id::text, name, left(message, 90), created_at FROM contact_messages ORDER BY created_at DESC LIMIT 10)
         UNION ALL
         (SELECT 'shop', id::text, name, slug || ' · ' || status::text, created_at FROM shops ORDER BY created_at DESC LIMIT 10)
         UNION ALL
         (SELECT 'signup', phone, phone, '', created_at FROM users ORDER BY created_at DESC LIMIT 10)
       ) f ORDER BY created_at DESC LIMIT 15`,
    ),
    query(
      "SELECT admin_email, action, target_type, target_id, details, created_at FROM admin_actions ORDER BY created_at DESC LIMIT 15",
    ),
  ]);
  return c.json({ counts: counts[0], feed, actions });
});

// ---- Estimator requests (consultancy_leads) --------------------------------

adminData.get("/estimates", requireAdmin, async (c) => {
  const { limit, offset } = paging(c);
  const status = c.req.query("status");
  const paid = c.req.query("paid");
  const q = likePattern(c.req.query("q"));

  const params: unknown[] = [];
  let where = "WHERE true";
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where += ` AND l.status = $${params.length}`;
  }
  if (paid === "paid" || paid === "pending") {
    params.push(paid);
    where += ` AND l.deposit_status = $${params.length}::deposit_status`;
  }
  if (q) {
    params.push(q);
    where += ` AND (lower(l.name) LIKE $${params.length} OR lower(l.email) LIKE $${params.length}
                    OR lower(l.ticket_ref) LIKE $${params.length} OR l.user_phone LIKE $${params.length}
                    OR lower(l.description) LIKE $${params.length})`;
  }

  const { rows: total } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM consultancy_leads l ${where}`, params);
  const { rows } = await query(
    `SELECT l.id, l.ticket_ref, l.status, l.deposit_status, l.budget_low::float8 AS budget_low,
            l.budget_high::float8 AS budget_high, l.selected_items, l.name, l.email, l.description,
            l.admin_notes, l.razorpay_order_id, l.created_at, l.updated_at, l.user_phone AS phone, l.requested_domain,
            p.full_name AS profile_name, p.email AS profile_email, p.account_type, p.business_name, p.city
       FROM consultancy_leads l
       LEFT JOIN user_profiles p ON p.user_phone = l.user_phone
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return c.json({ total: total[0].n, items: rows });
});

adminData.patch("/estimates/:id", requireAdmin, (c) => updateFollowUp(c, "consultancy_leads", "estimate", LEAD_STATUSES));

// ---- Contact messages --------------------------------------------------------

adminData.get("/messages", requireAdmin, async (c) => {
  const { limit, offset } = paging(c);
  const status = c.req.query("status");
  const q = likePattern(c.req.query("q"));

  const params: unknown[] = [];
  let where = "WHERE true";
  if (status && (MESSAGE_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (q) {
    params.push(q);
    where += ` AND (lower(name) LIKE $${params.length} OR lower(email) LIKE $${params.length} OR lower(message) LIKE $${params.length})`;
  }
  const { rows: total } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM contact_messages ${where}`, params);
  const { rows } = await query(
    `SELECT id, name, email, message, status, admin_notes, created_at
       FROM contact_messages ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return c.json({ total: total[0].n, items: rows });
});

adminData.patch("/messages/:id", requireAdmin, (c) => updateFollowUp(c, "contact_messages", "message", MESSAGE_STATUSES));

// Shared PATCH for the two enquiry tables: change the status and/or the notes.
async function updateFollowUp(
  c: Context<AdminEnv>,
  table: "consultancy_leads" | "contact_messages",
  targetType: string,
  statuses: readonly string[],
) {
  const id = c.req.param("id") ?? "";
  if (!isUuid(id)) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const status = body?.status;
  const notes = typeof body?.notes === "string" ? str(body.notes) : undefined;

  if (status !== undefined && !statuses.includes(status)) return c.json({ error: "status is invalid" }, 400);
  if (status === undefined && notes === undefined) return c.json({ error: "Nothing to change" }, 400);
  if (notes !== undefined) {
    const problem = textError("Notes", notes, NOTES_MAX);
    if (problem) return c.json({ error: problem }, 400);
  }

  // table is one of two literals above, never user input.
  const { rows: before } = await query<{ status: string; admin_notes: string }>(
    `SELECT status, admin_notes FROM ${table} WHERE id = $1`,
    [id],
  );
  if (before.length === 0) return c.json({ error: "Not found" }, 404);

  const touch = table === "consultancy_leads" ? ", updated_at = now()" : "";
  const { rows } = await query(
    `UPDATE ${table} SET status = COALESCE($2, status), admin_notes = COALESCE($3, admin_notes)${touch}
     WHERE id = $1 RETURNING id, status, admin_notes`,
    [id, status ?? null, notes ?? null],
  );

  await auditAdmin(c.get("adminEmail"), `${targetType}.update`, targetType, id, {
    ...(status !== undefined && status !== before[0].status ? { status: { from: before[0].status, to: status } } : {}),
    ...(notes !== undefined && notes !== before[0].admin_notes ? { notesChanged: true } : {}),
  });
  return c.json({ item: rows[0] });
}

// ---- Shops (vendor onboarding) ----------------------------------------------

adminData.get("/shops", requireAdmin, async (c) => {
  const { limit, offset } = paging(c);
  const status = c.req.query("status");
  const q = likePattern(c.req.query("q"));

  const params: unknown[] = [];
  let where = "WHERE true";
  if (status === "draft" || status === "active" || status === "suspended") {
    params.push(status);
    where += ` AND s.status = $${params.length}::shop_status`;
  }
  if (q) {
    params.push(q);
    where += ` AND (lower(s.name) LIKE $${params.length} OR lower(s.slug) LIKE $${params.length}
                    OR lower(s.owner_name) LIKE $${params.length} OR s.owner_phone LIKE $${params.length}
                    OR lower(s.industry) LIKE $${params.length})`;
  }
  const { rows: total } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM shops s ${where}`, params);
  const { rows } = await query(
    `SELECT s.id, s.slug, s.name, s.owner_name, s.industry, s.mode, s.status, s.address_text,
            s.upi_id, s.verified_merchant_name, s.is_upi_verified, s.created_at,
            s.owner_phone AS phone, p.full_name AS profile_name, p.email AS profile_email,
            p.business_name, p.city,
            sub.status AS subscription_status, sub.current_period_end,
            (SELECT count(*)::int FROM shop_items i WHERE i.shop_id = s.id) AS item_count,
            s.plan, d.domain AS own_domain, d.status AS own_domain_status, d.cost_cents AS own_domain_cost_cents,
            d.renewal_cents AS own_domain_renewal_cents, d.expires_at AS own_domain_expires_at,
            d.alert AS own_domain_alert, d.last_error AS own_domain_last_error
       FROM shops s
       LEFT JOIN user_profiles p ON p.user_phone = s.owner_phone
       LEFT JOIN LATERAL (
         SELECT status, current_period_end FROM shop_subscriptions WHERE shop_id = s.id ORDER BY created_at DESC LIMIT 1
       ) sub ON true
       LEFT JOIN LATERAL (
         SELECT domain, status, cost_cents, renewal_cents, expires_at, alert, last_error FROM shop_domains
          WHERE shop_id = s.id AND status <> 'released' ORDER BY created_at DESC LIMIT 1
       ) d ON true
       ${where}
       ORDER BY s.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return c.json({ total: total[0].n, items: rows });
});

// ---- Users -------------------------------------------------------------------

adminData.get("/users", requireAdmin, async (c) => {
  const { limit, offset } = paging(c);
  const q = likePattern(c.req.query("q"));

  const params: unknown[] = [];
  let where = "WHERE true";
  if (q) {
    params.push(q);
    where += ` AND (u.phone LIKE $${params.length} OR lower(p.full_name) LIKE $${params.length}
                    OR lower(p.email) LIKE $${params.length} OR lower(p.business_name) LIKE $${params.length})`;
  }
  const { rows: total } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM users u LEFT JOIN user_profiles p ON p.user_phone = u.phone ${where}`,
    params,
  );
  const { rows } = await query(
    `SELECT u.phone, u.consent, u.created_at, u.password_hash IS NOT NULL AS has_password,
            p.full_name, p.email, p.account_type, p.business_name, p.city,
            COALESCE((SELECT array_agg(lead_source::text ORDER BY lead_source::text)
                        FROM user_lead_sources ls WHERE ls.user_phone = u.phone), '{}') AS lead_sources,
            (SELECT count(*)::int FROM shops s WHERE s.owner_phone = u.phone) AS shop_count,
            (SELECT count(*)::int FROM consultancy_leads l WHERE l.user_phone = u.phone) AS estimate_count
       FROM users u
       LEFT JOIN user_profiles p ON p.user_phone = u.phone
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return c.json({ total: total[0].n, items: rows });
});
