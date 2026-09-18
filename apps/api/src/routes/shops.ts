import { Hono } from "hono";
import { query } from "../lib/db.js";
import { getSessionUserPhone } from "../lib/auth-middleware.js";
import { requireShopOwner } from "../lib/require-shop-owner.js";
import { createVendorSubscription, validateVpa } from "../lib/razorpay.js";
import { createItemImageUploadUrl } from "../lib/storage.js";
import { SHOP_INDUSTRIES, SHOP_MODES } from "../lib/constants.js";

export const shops = new Hono();

const RESERVED_SLUGS = new Set([
  "www", "api", "admin", "app", "mail", "ftp",
  "babuki", "babuky", "shop", "shops", "estimator", "terms", "contact", "get-started", "services",
]);

// --- create / discover --------------------------------------------------

shops.get("/slug-available", async (c) => {
  const slug = (c.req.query("slug") ?? "").toLowerCase();

  if (!/^[a-z0-9-]{3,24}$/.test(slug)) {
    return c.json({ available: false, reason: "invalid" });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return c.json({ available: false, reason: "reserved" });
  }

  const { rows } = await query("SELECT 1 FROM shops WHERE slug = $1", [slug]);
  return c.json({ available: rows.length === 0 });
});

// The signed-in vendor's own shops, with lifecycle state: 'draft' until the
// subscription payment webhook activates it, 'suspended' if it lapses. Drives
// the post-checkout "is it live yet?" check and the vendor dashboard.
shops.get("/mine", async (c) => {
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  const { rows } = await query(
    `SELECT s.id, s.slug, s.name, s.industry, s.mode, s.status, s.address_text,
            s.upi_id, s.verified_merchant_name, s.is_upi_verified,
            sub.status AS subscription_status
     FROM shops s
     LEFT JOIN LATERAL (
       SELECT status FROM shop_subscriptions
       WHERE shop_id = s.id ORDER BY created_at DESC LIMIT 1
     ) sub ON true
     WHERE s.owner_phone = $1
     ORDER BY s.created_at DESC`,
    [phone],
  );
  return c.json({ shops: rows });
});

// Public storefront lookup (slug.babuki.com resolves here) — the checkout
// page builds its UPI deep link (upi://pay?pa=...&pn=...&am=...&cu=INR)
// client-side from upi_id/verified_merchant_name, so only ever expose
// those once is_upi_verified is true; an unverified upi_id is never
// returned, so a QR can't be built from a VPA Razorpay hasn't confirmed.
shops.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug").toLowerCase();

  const { rows } = await query(
    `SELECT id, slug, name, industry, mode, address_text,
            CASE WHEN is_upi_verified THEN upi_id END AS upi_id,
            CASE WHEN is_upi_verified THEN verified_merchant_name END AS verified_merchant_name,
            is_upi_verified
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
  const slug = typeof body?.slug === "string" ? body.slug.toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  const industry = body?.industry;
  const mode = body?.mode;
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const addressText = typeof body?.addressText === "string" ? body.addressText : "";

  if (!/^[a-z0-9-]{3,24}$/.test(slug)) return c.json({ error: "slug is invalid" }, 400);
  if (!name || !ownerName) return c.json({ error: "name and ownerName are required" }, 400);
  if (!SHOP_INDUSTRIES.includes(industry)) return c.json({ error: "industry is invalid" }, 400);
  if (!SHOP_MODES.includes(mode)) return c.json({ error: "mode is invalid" }, 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return c.json({ error: "lat/lng are required" }, 400);

  // Direct Order mode shops start unverified — UPI VPA collection/
  // verification is its own follow-up step (POST /:id/upi/validate then
  // /:id/upi/confirm), not part of initial shop creation.

  try {
    const { rows } = await query(
      `INSERT INTO shops (owner_phone, slug, name, owner_name, industry, mode, geog, address_text)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9)
       RETURNING id, slug`,
      [phone, slug, name, ownerName, industry, mode, lng, lat, addressText],
    );
    return c.json({ shop: rows[0] }, 201);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
      return c.json({ error: "slug is already taken" }, 409);
    }
    throw error;
  }
});

// --- UPI VPA verification (Direct Order mode) -----------------------------
// Two-step: /validate is a pure preview (calls Razorpay, persists nothing)
// so the UI can show "is this your business? [Confirm]"; /confirm re-runs
// the same Razorpay validation server-side and only then persists — never
// trusts a client-supplied name, only what Razorpay itself returned.

const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{2,64}$/;

shops.post("/:id/upi/validate", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const upiId = typeof body?.upiId === "string" ? body.upiId.trim() : "";
  if (!VPA_PATTERN.test(upiId)) return c.json({ error: "upiId is not a valid UPI VPA" }, 400);

  try {
    const result = await validateVpa(upiId);
    if (!result.valid) return c.json({ error: "This UPI ID could not be verified" }, 422);
    return c.json({ valid: true, upiId, customerName: result.customerName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate UPI ID";
    return c.json({ error: message }, 503);
  }
});

shops.post("/:id/upi/confirm", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);
  if (!(await requireShopOwner(shopId, phone))) return c.json({ error: "Shop not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const upiId = typeof body?.upiId === "string" ? body.upiId.trim() : "";
  if (!VPA_PATTERN.test(upiId)) return c.json({ error: "upiId is not a valid UPI VPA" }, 400);

  try {
    const result = await validateVpa(upiId);
    if (!result.valid || !result.customerName) {
      return c.json({ error: "This UPI ID could not be verified" }, 422);
    }

    const { rows } = await query(
      `UPDATE shops
       SET upi_id = $2, verified_merchant_name = $3, is_upi_verified = true
       WHERE id = $1
       RETURNING id, upi_id, verified_merchant_name, is_upi_verified`,
      [shopId, upiId, result.customerName],
    );
    return c.json({ shop: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm UPI ID";
    return c.json({ error: message }, 503);
  }
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
  const radiusKm = Math.min(Number(c.req.query("radiusKm") ?? 5), 10);
  const industry = c.req.query("industry");
  const q = c.req.query("q") ?? "";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat/lng are required" }, 400);
  }

  const params: unknown[] = [lng, lat, radiusKm * 1000];
  let filter = "";
  if (industry && industry !== "All") {
    params.push(industry);
    filter += ` AND industry = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    filter += ` AND lower(name) LIKE $${params.length}`;
  }

  const { rows } = await query(
    `SELECT id, slug, name, industry, mode,
            ST_Y(geog::geometry) AS lat, ST_X(geog::geometry) AS lng,
            ST_Distance(geog, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distance_km
     FROM shops
     WHERE status = 'active'
       AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ${filter}
     ORDER BY distance_km ASC
     LIMIT 100`,
    params,
  );

  return c.json({ shops: rows });
});

shops.post("/:id/subscribe", async (c) => {
  const shopId = c.req.param("id");
  const phone = await getSessionUserPhone(c);
  if (!phone) return c.json({ error: "Not authenticated" }, 401);

  if (!(await requireShopOwner(shopId, phone))) {
    return c.json({ error: "Shop not found" }, 404);
  }

  try {
    const subscription = await createVendorSubscription(shopId);
    await query(
      `INSERT INTO shop_subscriptions (shop_id, razorpay_subscription_id, razorpay_plan_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [shopId, subscription.id, subscription.plan_id],
    );
    return c.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create subscription";
    return c.json({ error: message }, 503);
  }
});

// --- catalog: categories --------------------------------------------------

shops.get("/:id/categories", async (c) => {
  const shopId = c.req.param("id");
  const { rows: shopRows } = await query("SELECT 1 FROM shops WHERE id = $1 AND status = 'active'", [shopId]);
  if (shopRows.length === 0) return c.json({ error: "Shop not found" }, 404);

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
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const sortOrder = Number.isFinite(body?.sortOrder) ? Number(body.sortOrder) : 0;
  if (!name) return c.json({ error: "name is required" }, 400);

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
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const sortOrder = Number.isFinite(body?.sortOrder) ? Number(body.sortOrder) : undefined;

  if (name === undefined && sortOrder === undefined) return c.json({ error: "Nothing to update" }, 400);
  if (name !== undefined && !name) return c.json({ error: "name cannot be empty" }, 400);

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

  const { rowCount } = await query("DELETE FROM shop_categories WHERE id = $1 AND shop_id = $2", [categoryId, shopId]);
  if (rowCount === 0) return c.json({ error: "Category not found" }, 404);
  return c.json({ ok: true });
});

// --- catalog: items --------------------------------------------------------

shops.get("/:id/items", async (c) => {
  const shopId = c.req.param("id");
  const { rows: shopRows } = await query("SELECT 1 FROM shops WHERE id = $1 AND status = 'active'", [shopId]);
  if (shopRows.length === 0) return c.json({ error: "Shop not found" }, 404);

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
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const brand = typeof body?.brand === "string" ? body.brand.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;
  const priceInPaise = Number(body?.priceInPaise);
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : null;
  const stockQuantity =
    body?.stockQuantity === null || body?.stockQuantity === undefined ? null : Number(body.stockQuantity);

  if (!name) return c.json({ error: "name is required" }, 400);
  if (!Number.isFinite(priceInPaise) || priceInPaise < 0) {
    return c.json({ error: "priceInPaise must be a non-negative number" }, 400);
  }
  if (stockQuantity !== null && (!Number.isFinite(stockQuantity) || stockQuantity < 0)) {
    return c.json({ error: "stockQuantity must be a non-negative number or null" }, 400);
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

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return c.json({ error: "name cannot be empty" }, 400);
    set("name", name);
  }
  if (typeof body.brand === "string") set("brand", body.brand.trim());
  if (typeof body.description === "string") set("description", body.description.trim());
  if (body.categoryId === null) {
    set("category_id", null);
  } else if (typeof body.categoryId === "string") {
    const { rows } = await query("SELECT 1 FROM shop_categories WHERE id = $1 AND shop_id = $2", [
      body.categoryId,
      shopId,
    ]);
    if (rows.length === 0) return c.json({ error: "categoryId does not belong to this shop" }, 400);
    set("category_id", body.categoryId);
  }
  if (body.priceInPaise !== undefined) {
    const price = Number(body.priceInPaise);
    if (!Number.isFinite(price) || price < 0) {
      return c.json({ error: "priceInPaise must be a non-negative number" }, 400);
    }
    set("price_paise", price);
  }
  if (typeof body.imageUrl === "string" || body.imageUrl === null) set("image_url", body.imageUrl);
  if (typeof body.isAvailable === "boolean") set("is_available", body.isAvailable);
  if (body.stockQuantity !== undefined) {
    const stock = body.stockQuantity === null ? null : Number(body.stockQuantity);
    if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      return c.json({ error: "stockQuantity must be a non-negative number or null" }, 400);
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
