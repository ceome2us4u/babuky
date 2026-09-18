import { NextResponse } from "next/server";
import { getSessionUserPhone } from "@/lib/require-session";
import { requireShopOwner } from "@/lib/require-shop-owner";
import { createItemImageUploadUrl } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const phone = await getSessionUserPhone();
  if (!phone) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await requireShopOwner(params.id, phone))) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";

  try {
    const result = await createItemImageUploadUrl(params.id, contentType);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create upload URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
