import { Hono } from "hono";

export const geocode = new Hono();

// Server-side proxy to Nominatim — keeps a single controlled User-Agent and
// avoids calling the OSM service directly from the browser.
geocode.get("/reverse", async (c) => {
  const lat = c.req.query("lat");
  const lng = c.req.query("lng");

  if (!lat || !lng) {
    return c.json({ error: "lat/lng are required" }, 400);
  }
  // Only well-formed coordinates go to Nominatim.
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
    return c.json({ error: "lat/lng must be valid coordinates" }, 400);
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Babuki/1.0 (https://babuki.com)" },
    });
    const data = (await res.json()) as { display_name?: string };
    return c.json({ address: data.display_name ?? null });
  } catch {
    return c.json({ address: null });
  }
});
