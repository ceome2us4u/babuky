import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/msg91";
import { query } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { LEAD_SOURCES } from "@/lib/constants";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phoneDigits = typeof body?.phone === "string" ? body.phone : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";
  const leadSource = body?.leadSource;
  const consent = body?.consent === true;

  if (!/^\d{10}$/.test(phoneDigits) || !/^\d{4,6}$/.test(otp)) {
    return NextResponse.json({ error: "phone and otp are required" }, { status: 400 });
  }
  if (!LEAD_SOURCES.includes(leadSource)) {
    return NextResponse.json({ error: "leadSource is invalid" }, { status: 400 });
  }

  const phone = `+91${phoneDigits}`;

  let verified: boolean;
  try {
    verified = await verifyOtp(phone, otp);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify OTP";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  if (!verified) {
    return NextResponse.json({ error: "Incorrect or expired OTP" }, { status: 401 });
  }

  await query(
    `INSERT INTO users (phone, consent, verified_at)
     VALUES ($1, $2, now())
     ON CONFLICT (phone) DO UPDATE SET consent = EXCLUDED.consent, verified_at = now()`,
    [phone, consent],
  );
  await query(
    `INSERT INTO user_lead_sources (user_phone, lead_source) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [phone, leadSource],
  );

  const { rows: profileRows } = await query("SELECT 1 FROM user_profiles WHERE user_phone = $1", [phone]);
  const hasProfile = profileRows.length > 0;

  const { token, expiresAt } = await createSession(phone);

  const response = NextResponse.json({ ok: true, hasProfile });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
