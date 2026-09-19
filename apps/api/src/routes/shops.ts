import { Hono } from "hono";
import type { Context } from "hono";
import { query } from "../lib/db.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { requireShopOwner } from "../lib/require-shop-owner.js";
import { publicError } from "../lib/mode.js";
import { createVendorSubscription, razorpayKeyId } from "../lib/razorpay.js";
import { createItemImageUploadUrl } from "../lib/storage.js";
import { SHOP_MODES } from "../lib/constants.js";
import { industryFilter, normalizeIndustry } from "../lib/industries.js";
import { parseRadiusKm } from "../lib/search.js";
import { findSlugHolder, noPaymentInFlight, releaseDraft } from "../lib/slug-hold.js";
import { VENDOR_SUBSCRIPTION_CYCLES, fetchSubscription, type ShopPlan } from "../lib/razorpay.js";
import { ownDomainEnabled } from "../lib/features.js";
import { holdDomain, isOfferedDomain } from "../lib/domains.js";
import { LIMITS, NAME_RE, UPI_NAME_RE, isIntInRange, isSlug, isUuid, str, textError } from "../lib/validation.js";

export const shops = new Hono();

const RESERVED_SLUGS = new Set([
  "www", "api", "admin", "app", "mail", "ftp",
  "babuki", "babuky", "shop", "shops", "estimator", "terms", "contact", "get-started", "services",
]);

// A shop's catalog is public once the shop is 'active'; before that (draft,
// awaiting payment) or after (suspended) only its owner may read it, so a
// vendor can build the catalog before paying and still see it if they lapse.
async function shopVisibleTo(c: Context, shopId: string): Promise<boolean> {
  if (!isUuid(shopId)) return false;
  const { rows } = await query<{ status: string; owner_phone: string }>(
    "SELECT status, owner_phone FROM shops WHERE id = $1",
    [shopId],
  );
  if (rows.length === 0) return false;
  if (rows[0].status === "active") return true;
  const phone = await getSessionUserPhone(c);
  return !!phone && phone === rows[0].owner_phone;
}

// An item photo must be one this API issued an upload URL for: an object in
// Babuki's own bucket under this shop's prefix. Otherwise a vendor could point
// an item at any external URL (tracking pixels, other people's images).
function isOwnImageUrl(shopId: string, url: string): boolean {
  const bucket = process.env.BABUKI_S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return false;
  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/shops/${shopId}/items/`;
  return url.startsWith(prefix) && !url.includes("..") && url.length <= 512;
}

// --- create / discover --------------------------------------------------

shops.get("/slug-available", async (c) => {
  const slug = (c.req.query("slug") ?? "").toLowerCase();

  if (!isSlug(slug)) {
    return c.json({ available: false, reason: "invalid" });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return c.json({ available: false, reason: "reserved" });
  }

  const holder = await findSlugHolder(slug);
  if (!holder) return c.json({ available: true });

  // Your own unfinished shop: you can carry on with the name (not "taken").
  const phone = await getSessionUserPhone(c);
  if (phone && holder.owner_phone === phone && holder.status === "draft") {
    return c.json({ available: true, yours: true });
  }
  // An unpaid, empty draft only holds its address for a couple of hours (lib/slug-hold.ts).
  if (holder.abandoned) return c.json({ available: true });
  return c.json({ available: false, reason: "taken" });
});

// The signed-in vendor's own shops, with lifecycle state: 'draft' until the
// subscription payment webhook activates it, 'suspended' if it lapses. Drives
// the post-checkout "is it live yet?" check and the vendor dashboard.
shops.get("/mine", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  const { rows } = await query(
    `SELECT s.id, s.slug, s.name, s.industry, s.mode, s.status, s.address_text,
            s.upi_id, s.verified_merchant_name, s.is_upi_verified, s.plan,
            sub.status AS subscription_status,
            d.domain AS own_domain, d.status AS own_domain_status, d.grace_until AS own_domain_grace_until
     FROM shops s
     LEFT JOIN LATERAL (
       SELECT status FROM shop_subscriptions
       WHERE shop_id = s.id ORDER BY created_at DESC LIMIT 1
     ) sub ON true
     LEFT JOIN LATERAL (
       SELECT domain, status, grace_until FROM shop_domains
       WHERE shop_id = s.id AND status <> 'released' ORDER BY created_at DESC LIMIT 1
     ) d ON true
     WHERE s.owner_phone = $1
     ORDER BY s.created_at DESC`,
    [phone],
  );
  return c.json({ shops: rows });
});

// Vendor-editable shop settings. Only the catalog mode for now: switching to
// 'order' still needs a confirmed UPI ID before the storefront will
// offer online payment (the cart falls back to WhatsApp until then).
shops.patch("/:id", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const mode = body?.mode;
  if (!SHOP_MODES.includes(mode)) return c.json({ error: "mode is invalid" }, 400);

  const { rows } = await query(
    "UPDATE shops SET mode = $2 WHERE id = $1 RETURNING id, mode",
    [shopId, mode],
  );
  return c.json({ shop: rows[0] });
});

// Public storefront lookup (slug.babuki.com resolves here) — the checkout
// page builds its UPI deep link (upi://pay?pa=...&pn=...&am=...&cu=INR)
// client-side from upi_id/verified_merchant_name, so only ever expose
// those once is_upi_verified is true (the owner confirmed it - see /upi/confirm);
// an unconfirmed upi_id is never returned, so no QR is built from it.
shops.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug").toLowerCase();

  const { rows } = await query(
    // owner_phone -> contact_phone: a public storefront lists how to reach the
    // vendor (Call / WhatsApp / order handoff); the vendor opts in by
    // publishing a shop.
    // own_domain: the shop's own address once it's served (for the canonical link).
    `SELECT id, slug, name, industry, mode, address_text,
            owner_phone AS contact_phone,
            CASE WHEN is_upi_verified THEN upi_id END AS upi_id,
            CASE WHEN is_upi_verified THEN verified_merchant_name END AS verified_merchant_name,
            is_upi_verified,
            (SELECT d.domain FROM shop_domains d WHERE d.shop_id = shops.id AND d.status = 'active' LIMIT 1) AS own_domain
     FROM shops
     WHERE slug = $1 AND status = 'active'`,
    [slug],
  );
  if (rows.length === 0) return c.json({ error: "Shop not found" }, 404);
  return c.json({ shop: rows[0] });
});

shops.post("/", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  const { rows: leadRows } = await query(
    "SELECT 1 FROM user_lead_sources WHERE user_phone = $1 AND lead_source = 'MERCHANT'",
    [phone],
  );
  if (leadRows.length === 0) {
    return c.json({ error: "Merchant onboarding requires MERCHANT lead source" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const slug = str(body?.slug).toLowerCase();
  const name = str(body?.name);
  const ownerName = str(body?.ownerName);
  const industry = normalizeIndustry(body?.industry);
  const mode = body?.mode;
  const lat = typeof body?.lat === "number" ? body.lat : NaN;
  const lng = typeof body?.lng === "number" ? body.lng : NaN;
  const addressText = str(body?.addressText);

  if (!isSlug(slug)) return c.json({ error: "Subdomain must be 3-24 letters/digits, with single hyphens inside" }, 400);
  if (RESERVED_SLUGS.has(slug)) return c.json({ error: "That subdomain is reserved" }, 400);
  if (!name || !ownerName) return c.json({ error: "name and ownerName are required" }, 400);
  if (!NAME_RE.test(ownerName)) return c.json({ error: "Owner name can only contain letters, spaces and . ' -" }, 400);
  const tooLong =
    textError("Store name", name, LIMITS.shopName) ??
    textError("Owner name", ownerName, LIMITS.fullName) ??
    textError("Address", addressText, LIMITS.address);
  if (tooLong) return c.json({ error: tooLong }, 400);
  if (!industry) return c.json({ error: "Pick the kind of business, or describe it in a few words" }, 400);
  if (!SHOP_MODES.includes(mode)) return c.json({ error: "mode is invalid" }, 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: "lat/lng are required and must be valid coordinates" }, 400);
  }

  // Direct Order shops start without a UPI ID — the owner adds and confirms it
  // in a follow-up step (POST /:id/upi/confirm), not at shop creation.

  // "own web address" plan (₹1,500): only while FEATURE_OWN_DOMAIN is on.
  const plan: ShopPlan = body?.plan === "premium" ? "premium" : "standard";
  const domain = str(body?.domain).toLowerCase();
  if (plan === "premium") {
    if (!ownDomainEnabled()) return c.json({ error: "That plan isn't available right now." }, 400);
    if (!isOfferedDomain(domain)) return c.json({ error: "Pick a web address marked Available." }, 400);
  }
  // Sets the draft's plan and (for premium) holds its chosen domain. On a
  // problem with the domain the shop is kept; the merchant just picks again.
  const withPlan = async (shop: { id: string; slug: string }, status: 200 | 201, resumed = false) => {
    await query("UPDATE shops SET plan = $2 WHERE id = $1 AND status = 'draft'", [shop.id, plan]);
    if (plan === "premium") {
      const problem = await holdDomain(shop.id, domain);
      if (problem) return c.json({ error: problem, field: "domain", shop }, 409);
    } else {
      await query(
        "UPDATE shop_domains SET status = 'released', updated_at = now() WHERE shop_id = $1 AND status = 'held'",
        [shop.id],
      );
    }
    return c.json(resumed ? { shop, resumed } : { shop }, status);
  };

  const holder = await findSlugHolder(slug);
  if (holder) {
    if (holder.owner_phone === phone && holder.status === "draft") {
      // Backed out at payment and came back: carry on with the same shop instead of "already taken".
      const { rows } = await query<{ id: string; slug: string }>(
        `UPDATE shops SET name = $2, owner_name = $3, industry = $4, mode = $5,
                geog = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, address_text = $8
          WHERE id = $1 AND status = 'draft' RETURNING id, slug`,
        [holder.id, name, ownerName, industry, mode, lng, lat, addressText],
      );
      return withPlan(rows[0], 200, true);
    }
    if (holder.abandoned && (await noPaymentInFlight(holder.id))) {
      await releaseDraft(holder.id);
    } else {
      return c.json({ error: "slug is already taken" }, 409);
    }
  }

  try {
    const { rows } = await query<{ id: string; slug: string }>(
      `INSERT INTO shops (owner_phone, slug, name, owner_name, industry, mode, geog, address_text)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9)
       RETURNING id, slug`,
      [phone, slug, name, ownerName, industry, mode, lng, lat, addressText],
    );
    return withPlan(rows[0], 201);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
      return c.json({ error: "slug is already taken" }, 409);
    }
    throw error;
  }
});

// --- UPI ID (Direct Order mode): confirmed by the shop owner --------------
// Razorpay can no longer look a UPI ID up for us (see the note in lib/razorpay.ts),
// so the OWNER confirms it: they enter the UPI ID, scan a test QR with their own
// UPI app, read the name it shows, type that name and tick that it is theirs.
// We store exactly that. The columns keep their old names (`is_upi_verified`,
// `verified_merchant_name`) but now mean "confirmed by the owner" / "the name
// their UPI app showed" — self-reported, so the UI says so and never claims
// more. Buyers' own UPI apps show the payee name before they pay.

const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{2,64}$/;

shops.post("/:id/upi/confirm", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const upiId = typeof body?.upiId === "string" ? body.upiId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

  if (!VPA_PATTERN.test(upiId)) return c.json({ error: "That doesn't look like a UPI ID (it should be like name@bank)" }, 400);
  if (!UPI_NAME_RE.test(name)) {
    return c.json({ error: "Enter the name your UPI app showed (letters, numbers and . & ' ( ) - only, up to 60 characters)" }, 400);
  }
  if (body?.confirmed !== true) {
    return c.json({ error: "Please confirm that this is your own UPI ID and the name is exactly what your app showed" }, 400);
  }

  const { rows } = await query(
    `UPDATE shops
        SET upi_id = $2, verified_merchant_name = $3, is_upi_verified = true
      WHERE id = $1
    RETURNING id, upi_id, verified_merchant_name, is_upi_verified`,
    [shopId, upiId, name],
  );
  return c.json({ shop: rows[0] });
});

shops.get("/nearby", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  const { rows: leadRows } = await query(
    "SELECT 1 FROM user_lead_sources WHERE user_phone = $1 AND lead_source = 'LOCAL_BUYER'",
    [phone],
  );
  if (leadRows.length === 0) {
    return c.json({ error: "Shop discovery requires LOCAL_BUYER lead source" }, 403);
  }

  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  // A distance in km (1-200), or "any" for no distance limit — the finder isn't
  // only for "near me": people search other towns or the whole country too.
  const radiusKm = parseRadiusKm(c.req.query("radiusKm"));
  const industry = c.req.query("industry");
  const q = (c.req.query("q") ?? "").trim().slice(0, LIMITS.search);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: "lat/lng are required and must be valid coordinates" }, 400);
  }

  const params: unknown[] = [lng, lat];
  let filter = "";
  if (radiusKm !== null) {
    params.push(radiusKm * 1000);
    filter += ` AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $${params.length})`;
  }
  if (industry && industry !== "All") {
    const f = industryFilter(industry);
    if (!f) return c.json({ error: "industry is invalid" }, 400);
    if ("eq" in f) {
      params.push(f.eq);
      filter += ` AND industry = $${params.length}`;
    } else if ("any" in f) {
      params.push(f.any);
      filter += ` AND industry = ANY($${params.length}::text[])`;
    } else {
      params.push(f.notIn);
      filter += ` AND NOT (industry = ANY($${params.length}::text[]))`;
    }
  }
  if (q) {
    // Escape LIKE wildcards so a search for "50%_off" matches literally.
    params.push(`%${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`);
    // Matches the shop's name, its kind of business ("kirana", "tailor") or where
    // it is (a locality, city or pincode in its address).
    filter += ` AND (lower(name) LIKE $${params.length} OR lower(industry) LIKE $${params.length} OR lower(address_text) LIKE $${params.length})`;
  }

  const { rows } = await query(
    // owner_phone is exposed here on purpose: the Shops Nearby cards have
    // Call / WhatsApp buttons, and this endpoint is already gated to
    // signed-in LOCAL_BUYER sessions. UPI fields only once the owner has confirmed them.
    `SELECT id, slug, name, industry, mode,
            owner_phone AS phone,
            CASE WHEN is_upi_verified THEN upi_id END AS upi_id,
            CASE WHEN is_upi_verified THEN verified_merchant_name END AS verified_merchant_name,
            ST_Y(geog::geometry) AS lat, ST_X(geog::geometry) AS lng,
            ST_Distance(geog, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distance_km
     FROM shops
     WHERE status = 'active'
       ${filter}
     ORDER BY distance_km ASC
     LIMIT 100`,
    params,
  );

  // LIMIT 100: when a wide search hits it, the UI tells people to narrow it down.
  return c.json({ shops: rows, truncated: rows.length >= 100 });
});

// A vendor can throw away a shop they never paid for, which frees its web address.
shops.delete("/:id", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const { rows } = await query<{ status: string; paid: boolean }>(
    `SELECT s.status::text AS status,
            EXISTS (SELECT 1 FROM shop_subscriptions x WHERE x.shop_id = s.id AND x.status <> 'pending') AS paid
       FROM shops s WHERE s.id = $1`,
    [shopId],
  );
  if (rows[0].status !== "draft" || rows[0].paid) {
    return c.json({ error: "Only a shop that was never published can be deleted here." }, 409);
  }
  // A payment might have just gone through with the confirmation still on its way.
  if (!(await noPaymentInFlight(shopId))) {
    return c.json({ error: "A payment for this shop may still be going through. Please check again in a few minutes." }, 409);
  }
  await releaseDraft(shopId);
  return c.json({ ok: true });
});

shops.post("/:id/subscribe", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  if (!(await requireShopOwner(shopId, phone))) {
    return c.json({ error: "Shop not found" }, 404);
  }

  // The shop's plan picks the Razorpay plan: ₹500 (standard) or ₹1,500 (own web
  // address). A premium shop keeps renewing on premium even if the feature
  // switch is later turned off — the switch only stops new sales.
  const { rows: planRows } = await query<{ plan: ShopPlan }>("SELECT plan::text AS plan FROM shops WHERE id = $1", [shopId]);
  const plan: ShopPlan = planRows[0]?.plan === "premium" ? "premium" : "standard";

  try {
    // Backed out and came back? Reuse the subscription that is still waiting for a
    // payment instead of piling up a new one at Razorpay on every attempt — but only
    // one of the right length and plan: an old subscription made with a length that
    // banks refuse (see VENDOR_SUBSCRIPTION_CYCLES) would just fail the payment again.
    const { rows: open } = await query<{ razorpay_subscription_id: string; razorpay_plan_id: string }>(
      `SELECT razorpay_subscription_id, razorpay_plan_id FROM shop_subscriptions
        WHERE shop_id = $1 AND status = 'pending' AND razorpay_subscription_id IS NOT NULL AND plan = $2
        ORDER BY created_at DESC LIMIT 1`,
      [shopId, plan],
    );
    if (open[0]) {
      try {
        const existing = await fetchSubscription(open[0].razorpay_subscription_id);
        if (existing.status === "created" && existing.totalCount === VENDOR_SUBSCRIPTION_CYCLES) {
          return c.json({
            subscription: { id: open[0].razorpay_subscription_id, plan_id: open[0].razorpay_plan_id },
            keyId: razorpayKeyId(),
          });
        }
      } catch {
        /* can't tell - just start a fresh one below */
      }
    }

    const subscription = await createVendorSubscription(shopId, plan);
    await query(
      `INSERT INTO shop_subscriptions (shop_id, razorpay_subscription_id, razorpay_plan_id, status, plan, locked_monthly_amount)
       VALUES ($1, $2, $3, 'pending', $4, $5)`,
      [shopId, subscription.id, subscription.plan_id, plan, plan === "premium" ? 1500 : 500],
    );
    // keyId: the browser opens Checkout with the key for the ACTIVE mode.
    return c.json({ subscription, keyId: razorpayKeyId() });
  } catch (error) {
    const message = publicError(error, "We couldn't start the subscription payment right now. Please try again in a moment.");
    return c.json({ error: message }, 503);
  }
});

// --- catalog: categories --------------------------------------------------

shops.get("/:id/categories", async (c) => {
  const shopId = c.req.param("id");
  if (!(await shopVisibleTo(c, shopId))) return c.json({ error: "Shop not found" }, 404);

  const { rows } = await query(
    "SELECT id, name, sort_order FROM shop_categories WHERE shop_id = $1 ORDER BY sort_order, name",
    [shopId],
  );
  return c.json({ categories: rows });
});

shops.post("/:id/categories", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const name = str(body?.name);
  const sortOrder = isIntInRange(body?.sortOrder, 0, 10_000) ? body.sortOrder : 0;
  if (!name) return c.json({ error: "name is required" }, 400);
  const nameErr = textError("Category name", name, LIMITS.category);
  if (nameErr) return c.json({ error: nameErr }, 400);

  try {
    const { rows } = await query(
      "INSERT INTO shop_categories (shop_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name, sort_order",
      [shopId, name, sortOrder],
    );
    return c.json({ category: rows[0] }, 201);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
      return c.json({ error: "A category with this name already exists" }, 409);
    }
    throw error;
  }
});

shops.patch("/:id/categories/:categoryId", async (c) => {
  const shopId = c.req.param("id");
  const categoryId = c.req.param("categoryId");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  if (!isUuid(categoryId)) return c.json({ error: "Category not found" }, 404);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const sortOrder = isIntInRange(body?.sortOrder, 0, 10_000) ? body.sortOrder : undefined;

  if (name === undefined && sortOrder === undefined) return c.json({ error: "Nothing to update" }, 400);
  if (name !== undefined && !name) return c.json({ error: "name cannot be empty" }, 400);
  const nameErr = name === undefined ? null : textError("Category name", name, LIMITS.category);
  if (nameErr) return c.json({ error: nameErr }, 400);

  const { rows } = await query(
    `UPDATE shop_categories
     SET name = COALESCE($3, name), sort_order = COALESCE($4, sort_order)
     WHERE id = $2 AND shop_id = $1
     RETURNING id, name, sort_order`,
    [shopId, categoryId, name ?? null, sortOrder ?? null],
  );
  if (rows.length === 0) return c.json({ error: "Category not found" }, 404);
  return c.json({ category: rows[0] });
});

shops.delete("/:id/categories/:categoryId", async (c) => {
  const shopId = c.req.param("id");
  const categoryId = c.req.param("categoryId");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  if (!isUuid(categoryId)) return c.json({ error: "Category not found" }, 404);
  const { rowCount } = await query("DELETE FROM shop_categories WHERE id = $1 AND shop_id = $2", [categoryId, shopId]);
  if (rowCount === 0) return c.json({ error: "Category not found" }, 404);
  return c.json({ ok: true });
});

// --- catalog: items --------------------------------------------------------

shops.get("/:id/items", async (c) => {
  const shopId = c.req.param("id");
  if (!(await shopVisibleTo(c, shopId))) return c.json({ error: "Shop not found" }, 404);

  const { rows } = await query(
    `SELECT i.id, i.name, i.brand, i.description, i.price_paise, i.image_url,
            i.is_available, i.stock_quantity,
            (i.stock_quantity IS NULL OR i.stock_quantity > 0) AS in_stock,
            i.category_id, c.name AS category_name
     FROM shop_items i
     LEFT JOIN shop_categories c ON c.id = i.category_id
     WHERE i.shop_id = $1
     ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, i.sort_order, i.name`,
    [shopId],
  );
  return c.json({ items: rows });
});

shops.post("/:id/items", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const name = str(body?.name);
  const brand = str(body?.brand);
  const description = str(body?.description);
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? body.categoryId : null;
  const priceInPaise = body?.priceInPaise;
  const imageUrl = typeof body?.imageUrl === "string" && body.imageUrl ? body.imageUrl : null;
  const stockQuantity = body?.stockQuantity === null || body?.stockQuantity === undefined ? null : body.stockQuantity;

  if (!name) return c.json({ error: "name is required" }, 400);
  const tooLong =
    textError("Item name", name, LIMITS.itemName) ??
    textError("Brand", brand, LIMITS.brand) ??
    textError("Description", description, LIMITS.description);
  if (tooLong) return c.json({ error: tooLong }, 400);
  if (!isIntInRange(priceInPaise, 0, LIMITS.maxPricePaise)) {
    return c.json({ error: "Price must be between ₹0 and ₹10,00,000" }, 400);
  }
  if (stockQuantity !== null && !isIntInRange(stockQuantity, 0, LIMITS.maxStock)) {
    return c.json({ error: "Stock must be a whole number from 0 to 999999, or left untracked" }, 400);
  }
  if (categoryId && !isUuid(categoryId)) return c.json({ error: "categoryId is invalid" }, 400);
  if (imageUrl && !isOwnImageUrl(shopId, imageUrl)) {
    return c.json({ error: "imageUrl must be a photo uploaded through Babuki" }, 400);
  }

  if (categoryId) {
    const { rows } = await query("SELECT 1 FROM shop_categories WHERE id = $1 AND shop_id = $2", [categoryId, shopId]);
    if (rows.length === 0) return c.json({ error: "categoryId does not belong to this shop" }, 400);
  }

  const { rows } = await query(
    `INSERT INTO shop_items (shop_id, category_id, name, brand, description, price_paise, image_url, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, category_id, name, brand, description, price_paise, image_url, is_available, stock_quantity`,
    [shopId, categoryId, name, brand, description, priceInPaise, imageUrl, stockQuantity],
  );
  return c.json({ item: rows[0] }, 201);
});

shops.patch("/:id/items/:itemId", async (c) => {
  const shopId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Invalid body" }, 400);

  const fields: string[] = [];
  const values: unknown[] = [shopId, itemId];
  function set(column: string, value: unknown) {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  }

  if (!isUuid(itemId)) return c.json({ error: "Item not found" }, 404);

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return c.json({ error: "name cannot be empty" }, 400);
    const err = textError("Item name", name, LIMITS.itemName);
    if (err) return c.json({ error: err }, 400);
    set("name", name);
  }
  if (typeof body.brand === "string") {
    const err = textError("Brand", body.brand.trim(), LIMITS.brand);
    if (err) return c.json({ error: err }, 400);
    set("brand", body.brand.trim());
  }
  if (typeof body.description === "string") {
    const err = textError("Description", body.description.trim(), LIMITS.description);
    if (err) return c.json({ error: err }, 400);
    set("description", body.description.trim());
  }
  if (body.categoryId === null) {
    set("category_id", null);
  } else if (typeof body.categoryId === "string") {
    if (!isUuid(body.categoryId)) return c.json({ error: "categoryId is invalid" }, 400);
    const { rows } = await query("SELECT 1 FROM shop_categories WHERE id = $1 AND shop_id = $2", [
      body.categoryId,
      shopId,
    ]);
    if (rows.length === 0) return c.json({ error: "categoryId does not belong to this shop" }, 400);
    set("category_id", body.categoryId);
  }
  if (body.priceInPaise !== undefined) {
    if (!isIntInRange(body.priceInPaise, 0, LIMITS.maxPricePaise)) {
      return c.json({ error: "Price must be between ₹0 and ₹10,00,000" }, 400);
    }
    set("price_paise", body.priceInPaise);
  }
  if (body.imageUrl === null || body.imageUrl === "") {
    set("image_url", null);
  } else if (typeof body.imageUrl === "string") {
    if (!isOwnImageUrl(shopId, body.imageUrl)) {
      return c.json({ error: "imageUrl must be a photo uploaded through Babuki" }, 400);
    }
    set("image_url", body.imageUrl);
  }
  if (typeof body.isAvailable === "boolean") set("is_available", body.isAvailable);
  if (body.stockQuantity !== undefined) {
    const stock = body.stockQuantity;
    if (stock !== null && !isIntInRange(stock, 0, LIMITS.maxStock)) {
      return c.json({ error: "Stock must be a whole number from 0 to 999999, or left untracked" }, 400);
    }
    set("stock_quantity", stock);
  }

  if (fields.length === 0) return c.json({ error: "Nothing to update" }, 400);

  const { rows } = await query(
    `UPDATE shop_items SET ${fields.join(", ")}
     WHERE shop_id = $1 AND id = $2
     RETURNING id, category_id, name, brand, description, price_paise, image_url, is_available, stock_quantity`,
    values,
  );
  if (rows.length === 0) return c.json({ error: "Item not found" }, 404);
  return c.json({ item: rows[0] });
});

shops.delete("/:id/items/:itemId", async (c) => {
  const shopId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  if (!isUuid(itemId)) return c.json({ error: "Item not found" }, 404);
  const { rowCount } = await query("DELETE FROM shop_items WHERE id = $1 AND shop_id = $2", [itemId, shopId]);
  if (rowCount === 0) return c.json({ error: "Item not found" }, 404);
  return c.json({ ok: true });
});

shops.post("/:id/upload-url", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";

  try {
    const result = await createItemImageUploadUrl(shopId, contentType);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create upload URL";
    return c.json({ error: message }, 400);
  }
});
