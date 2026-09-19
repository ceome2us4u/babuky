// Shop-finder search limits. The finder started as "shops within 5–10 km of
// you"; people also look for shops in another town, a pincode they're moving
// to, or anywhere at all, so the radius can be much wider — or absent.

export const MAX_RADIUS_KM = 200;
export const DEFAULT_RADIUS_KM = 5;

/**
 * `radiusKm` query value → kilometres, or null for "anywhere" (no distance
 * limit; results are still ordered nearest-first). Missing/garbage falls back
 * to the default; numbers are clamped to 1..MAX_RADIUS_KM.
 */
export function parseRadiusKm(raw: string | undefined): number | null {
  if (raw === "any") return null;
  const n = Number(raw ?? DEFAULT_RADIUS_KM);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_KM;
  return Math.min(Math.max(n, 1), MAX_RADIUS_KM);
}

export type Place = { label: string; lat: number; lng: number };

/** Nominatim /search results → the few fields the UI needs; drops anything without valid coordinates. */
export function toPlaces(rows: unknown): Place[] {
  if (!Array.isArray(rows)) return [];
  const out: Place[] = [];
  for (const r of rows) {
    const lat = Number(r?.lat);
    const lng = Number(r?.lon);
    const label = typeof r?.display_name === "string" ? r.display_name.slice(0, 160) : "";
    if (label && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      out.push({ label, lat, lng });
    }
  }
  return out.slice(0, 5);
}
