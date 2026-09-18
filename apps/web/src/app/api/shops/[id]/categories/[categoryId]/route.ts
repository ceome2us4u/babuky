import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { requireShopOwner } from "@/lib/require-shop-owner";

type Params = { params: { id: string; categoryId: string } };

export async function PATCH(request: Request, { params }: Params) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await requireShopOwner(params.id, phone))) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const sortOrder = Number.isFinite(body?.sortOrder) ? Number(body.sortOrder) : undefined;

  if (name === undefined && sortOrder === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const { rows } = await query(
    `UPDATE shop_categories
     SET name = COALESCE($3, name), sort_order = COALESCE($4, sort_order)
     WHERE id = $2 AND shop_id = $1
     RETURNING id, name, sort_order`,
    [params.id, params.categoryId, name ?? null, sortOrder ?? null],
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  return NextResponse.json({ category: rows[0] });
}

export async function DELETE(request: Request, { params }: Params) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await requireShopOwner(params.id, phone))) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { rowCount } = await query("DELETE FROM shop_categories WHERE id = $1 AND shop_id = $2", [
    params.categoryId,
    params.id,
  ]);

  if (rowCount === 0) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
