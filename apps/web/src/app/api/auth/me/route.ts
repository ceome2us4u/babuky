import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserPhone } from "@/lib/require-session";

export async function GET() {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [{ rows: leadRows }, { rows: profileRows }] = await Promise.all([
    query<{ lead_source: string }>(
      "SELECT lead_source FROM user_lead_sources WHERE user_phone = $1",
      [phone],
    ),
    query(
      "SELECT full_name, email, account_type, business_name, city FROM user_profiles WHERE user_phone = $1",
      [phone],
    ),
  ]);

  return NextResponse.json({
    phone,
    leadSources: leadRows.map((row) => row.lead_source),
    profile: profileRows[0] ?? null,
  });
}
