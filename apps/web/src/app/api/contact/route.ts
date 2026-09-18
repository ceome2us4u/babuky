import { NextResponse } from "next/server";

// TODO: wire up real delivery (e.g. AWS SES) once Google Workspace / a
// public contact address exists. For now this just validates the payload
// and confirms receipt without sending anything.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.message !== "string") {
    return NextResponse.json({ error: "name, email, and message are required" }, { status: 400 });
  }

  if (!body.name.trim() || !body.email.trim() || !body.message.trim()) {
    return NextResponse.json({ error: "name, email, and message cannot be empty" }, { status: 400 });
  }

  return NextResponse.json(
    { status: "received", detail: "TODO: email delivery is not wired up yet." },
    { status: 202 }
  );
}
