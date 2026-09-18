import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { requireShopOwner } from "@/lib/require-shop-owner";

type Params = { params: { id: string; itemId: string } };

export async function PATCH(request: Request, { params }: Params) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await requireShopOwner(params.id, phone))) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const fields: string[] = [];
  const values: unknown[] = [params.id, params.itemId];

  function set(column: string, value: unknown) {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    set("name", name);
  }
  if (typeof body.brand === "string") set("brand", body.brand.trim());
  if (typeof body.description === "string") set("description", body.description.trim());
  if (body.categoryId === null) {
    set("category_id", null);
  } else if (typeof body.categoryId === "string") {
    const { rows } = await query("SELECT 1 FROM shop_categories WHERE id = $1 AND shop_id = $2", [
      body.categoryId,
      params.id,
    ]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "categoryId does not belong to this shop" }, { status: 400 });
    }
    set("category_id", body.categoryId);
  }
  if (body.priceInPaise !== undefined) {
    const price = Number(body.priceInPaise);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "priceInPaise must be a non-negative number" }, { status: 400 });
    }
    set("price_paise", price);
  }
  if (typeof body.imageUrl === "string" || body.imageUrl === null) {
    set("image_url", body.imageUrl);
  }
  if (typeof body.isAvailable === "boolean") {
    set("is_available", body.isAvailable);
  }
  if (body.stockQuantity !== undefined) {
    const stock = body.stockQuantity === null ? null : Number(body.stockQuantity);
    if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      return NextResponse.json({ error: "stockQuantity must be a non-negative number or null" }, { status: 400 });
    }
    set("stock_quantity", stock);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { rows } = await query(
    `UPDATE shop_items SET ${fields.join(", ")}
     WHERE shop_id = $1 AND id = $2
     RETURNING id, category_id, name, brand, description, price_paise, image_url, is_available, stock_quantity`,
    values,
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ item: rows[0] });
}

export async function DELETE(request: Request, { params }: Params) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await requireShopOwner(params.id, phone))) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { rowCount } = await query("DELETE FROM shop_items WHERE id = $1 AND shop_id = $2", [
    params.itemId,
    params.id,
  ]);

  if (rowCount === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
