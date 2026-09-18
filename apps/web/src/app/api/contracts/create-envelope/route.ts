import { NextResponse } from "next/server";
import { createEnvelope } from "@/lib/documenso";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.email !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  try {
    const envelope = await createEnvelope(body.email, body.name);
    return NextResponse.json({ envelope });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create envelope";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
