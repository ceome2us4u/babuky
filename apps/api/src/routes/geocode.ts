import { Hono } from "hono";
import { allow, clientIp } from "../lib/rate-limit.js";
import { toPlaces, type Place } from "../lib/search.js";

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

// Forward geocoding for the shop finder: "Coimbatore", "Indiranagar Bengaluru",
// "600017" -> a few places in India with coordinates, so people can search away
// from where they are. Same proxy idea as /reverse. Nominatim's usage policy is
// max ~1 request/second and identifiable traffic, so: cached for an hour and
// rate-limited (per IP, plus a global ceiling).
const placeCache = new Map<string, { at: number; places: Place[] }>();
const PLACE_CACHE_MS = 60 * 60 * 1000;

geocode.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  // Control characters and very short input never go upstream.
  // eslint-disable-next-line no-control-regex
  if (q.length < 3 || /[\u0000-\u001f\u007f]/.test(q)) return c.json({ places: [] });

  const key = q.toLowerCase();
  const hit = placeCache.get(key);
  if (hit && Date.now() - hit.at < PLACE_CACHE_MS) return c.json({ places: hit.places });

  if (!allow(`geo:ip:${clientIp(c)}`, 30, 60_000) || !allow("geo:all", 50, 60_000)) {
    return c.json({ error: "Too many searches — please wait a moment and try again." }, 429);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=5&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Babuki/1.0 (https://babuki.com)" } });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const places = toPlaces(await res.json());
    if (placeCache.size > 500) placeCache.clear();
    placeCache.set(key, { at: Date.now(), places });
    return c.json({ places });
  } catch {
    return c.json({ error: "We couldn't look that up right now. Please try again in a moment." }, 503);
  }
});
