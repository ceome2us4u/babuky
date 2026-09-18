import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";
import { SHOP_INDUSTRIES, SHOP_MODES } from "@/lib/constants";

export async function POST(request: Request) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { rows: leadRows } = await query(
    "SELECT 1 FROM user_lead_sources WHERE user_phone = $1 AND lead_source = 'MERCHANT'",
    [phone],
  );
  if (leadRows.length === 0) {
    return NextResponse.json(
      { error: "Merchant onboarding requires MERCHANT lead source" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug.toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  const industry = body?.industry;
  const mode = body?.mode;
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const addressText = typeof body?.addressText === "string" ? body.addressText : "";
  const upiQrUrl = typeof body?.upiQrUrl === "string" ? body.upiQrUrl : null;

  if (!/^[a-z0-9-]{3,24}$/.test(slug)) {
    return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  }
  if (!name || !ownerName) {
    return NextResponse.json({ error: "name and ownerName are required" }, { status: 400 });
  }
  if (!SHOP_INDUSTRIES.includes(industry)) {
    return NextResponse.json({ error: "industry is invalid" }, { status: 400 });
  }
  if (!SHOP_MODES.includes(mode)) {
    return NextResponse.json({ error: "mode is invalid" }, { status: 400 });
  }
  if (mode === "order" && !upiQrUrl) {
    return NextResponse.json({ error: "upiQrUrl is required for Direct Order mode" }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng are required" }, { status: 400 });
  }

  try {
    const { rows } = await query(
      `INSERT INTO shops (owner_phone, slug, name, owner_name, industry, mode, upi_qr_url, geog, address_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10)
       RETURNING id, slug`,
      [phone, slug, name, ownerName, industry, mode, upiQrUrl, lng, lat, addressText],
    );
    return NextResponse.json({ shop: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "slug is already taken" }, { status: 409 });
    }
    throw error;
  }
}
