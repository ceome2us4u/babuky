import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { requireShopOwner } from "@/lib/require-shop-owner";

// Public — a storefront's catalog is browsable without logging in.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { rows: shopRows } = await query("SELECT 1 FROM shops WHERE id = $1 AND status = 'active'", [
    params.id,
  ]);
  if (shopRows.length === 0) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { rows } = await query(
    "SELECT id, name, sort_order FROM shop_categories WHERE shop_id = $1 ORDER BY sort_order, name",
    [params.id],
  );
  return NextResponse.json({ categories: rows });
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
  const sortOrder = Number.isFinite(body?.sortOrder) ? Number(body.sortOrder) : 0;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const { rows } = await query(
      "INSERT INTO shop_categories (shop_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name, sort_order",
      [params.id, name, sortOrder],
    );
    return NextResponse.json({ category: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}
