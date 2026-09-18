import { NextResponse } from "next/server";

// Server-side proxy to Nominatim — keeps a single controlled User-Agent and
// avoids calling the OSM service directly from the browser.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat/lng are required" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Babuki/1.0 (https://babuki.com)" },
    });
    const data = (await res.json()) as { display_name?: string };
    return NextResponse.json({ address: data.display_name ?? null });
  } catch {
    return NextResponse.json({ address: null });
  }
}
