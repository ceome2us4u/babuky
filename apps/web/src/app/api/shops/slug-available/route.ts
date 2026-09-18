import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const RESERVED = new Set([
  "www", "api", "admin", "app", "mail", "ftp",
  "babuki", "babuky", "shop", "shops", "estimator", "terms", "contact", "get-started", "services",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get("slug") ?? "").toLowerCase();

  if (!/^[a-z0-9-]{3,24}$/.test(slug)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }
  if (RESERVED.has(slug)) {
    return NextResponse.json({ available: false, reason: "reserved" });
  }

  const { rows } = await query("SELECT 1 FROM shops WHERE slug = $1", [slug]);
  return NextResponse.json({ available: rows.length === 0 });
}
