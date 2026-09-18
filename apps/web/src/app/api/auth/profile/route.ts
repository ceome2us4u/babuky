import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";

export async function POST(request: Request) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const accountType = body?.accountType;
  const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";

  if (!fullName) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }
  if (accountType !== "business" && accountType !== "individual") {
    return NextResponse.json({ error: "accountType must be business or individual" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "email is invalid" }, { status: 400 });
  }
  if (accountType === "business" && !businessName) {
    return NextResponse.json({ error: "businessName is required for business accounts" }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }

  await query(
    `INSERT INTO user_profiles (user_phone, full_name, email, account_type, business_name, city, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_phone) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       email = EXCLUDED.email,
       account_type = EXCLUDED.account_type,
       business_name = EXCLUDED.business_name,
       city = EXCLUDED.city,
       updated_at = now()`,
    [phone, fullName, email, accountType, accountType === "business" ? businessName : "", city],
  );

  return NextResponse.json({ ok: true });
}
