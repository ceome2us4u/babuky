import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";

export async function GET(request: Request) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { rows: leadRows } = await query(
    "SELECT 1 FROM user_lead_sources WHERE user_phone = $1 AND lead_source = 'LOCAL_BUYER'",
    [phone],
  );
  if (leadRows.length === 0) {
    return NextResponse.json(
      { error: "Shop discovery requires LOCAL_BUYER lead source" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusKm = Math.min(Number(searchParams.get("radiusKm") ?? 5), 10);
  const industry = searchParams.get("industry");
  const q = searchParams.get("q") ?? "";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng are required" }, { status: 400 });
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

  return NextResponse.json({ shops: rows });
}
