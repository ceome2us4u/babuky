import { NextResponse } from "next/server";
import { sendOtp } from "@/lib/msg91";
import { LEAD_SOURCES } from "@/lib/constants";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const leadSource = body?.leadSource;
  const consent = body?.consent === true;

  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: "phone must be a 10-digit mobile number" }, { status: 400 });
  }
  if (!LEAD_SOURCES.includes(leadSource)) {
    return NextResponse.json({ error: "leadSource is invalid" }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "consent is required" }, { status: 400 });
  }

  try {
    await sendOtp(`+91${phone}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send OTP";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
