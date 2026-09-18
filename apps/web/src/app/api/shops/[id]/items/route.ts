import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { requireShopOwner } from "@/lib/require-shop-owner";

// Public — a storefront's catalog is browsable without logging in. Each row
// carries its category (for client-side grouping) and a derived in_stock
// flag (stock_quantity IS NULL means untracked/always in stock).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { rows: shopRows } = await query("SELECT 1 FROM shops WHERE id = $1 AND status = 'active'", [
    params.id,
  ]);
  if (shopRows.length === 0) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { rows } = await query(
    `SELECT i.id, i.name, i.brand, i.description, i.price_paise, i.image_url,
            i.is_available, i.stock_quantity,
            (i.stock_quantity IS NULL OR i.stock_quantity > 0) AS in_stock,
            i.category_id, c.name AS category_name
     FROM shop_items i
     LEFT JOIN shop_categories c ON c.id = i.category_id
     WHERE i.shop_id = $1
     ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, i.sort_order, i.name`,
    [params.id],
  );
  return NextResponse.json({ items: rows });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await requireShopOwner(params.id, phone))) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const brand = typeof body?.brand === "string" ? body.brand.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;
  const priceInPaise = Number(body?.priceInPaise);
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : null;
  const stockQuantity =
    body?.stockQuantity === null || body?.stockQuantity === undefined
      ? null
      : Number(body.stockQuantity);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Number.isFinite(priceInPaise) || priceInPaise < 0) {
    return NextResponse.json({ error: "priceInPaise must be a non-negative number" }, { status: 400 });
  }
  if (stockQuantity !== null && (!Number.isFinite(stockQuantity) || stockQuantity < 0)) {
    return NextResponse.json({ error: "stockQuantity must be a non-negative number or null" }, { status: 400 });
  }

  if (categoryId) {
    const { rows } = await query("SELECT 1 FROM shop_categories WHERE id = $1 AND shop_id = $2", [
      categoryId,
      params.id,
    ]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "categoryId does not belong to this shop" }, { status: 400 });
    }
  }

  const { rows } = await query(
    `INSERT INTO shop_items (shop_id, category_id, name, brand, description, price_paise, image_url, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, category_id, name, brand, description, price_paise, image_url, is_available, stock_quantity`,
    [params.id, categoryId, name, brand, description, priceInPaise, imageUrl, stockQuantity],
  );

  return NextResponse.json({ item: rows[0] }, { status: 201 });
}
