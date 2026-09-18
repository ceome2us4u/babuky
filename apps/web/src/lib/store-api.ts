import { API_BASE_URL } from "@/lib/api";

export type StoreShop = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  mode: "display" | "order";
  address_text: string;
  contact_phone: string; // +91XXXXXXXXXX
  // Only present once Razorpay has verified the vendor's UPI ID.
  upi_id: string | null;
  verified_merchant_name: string | null;
  is_upi_verified: boolean;
};

export type StoreItem = {
  id: string;
  name: string;
  brand: string;
  description: string;
  price_paise: number;
  image_url: string | null;
  is_available: boolean;
  stock_quantity: number | null; // null = vendor isn't tracking stock
  in_stock: boolean;
  category_id: string | null;
  category_name: string | null;
};

// Server-side calls go to the API on the same box (loopback) when
// API_INTERNAL_URL is set — no TLS/DNS round trip out and back in.
const SERVER_API = process.env.API_INTERNAL_URL ?? API_BASE_URL;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Public storefront data for slug.babuki.com; null when the shop isn't live. */
export async function fetchStore(slug: string): Promise<{ shop: StoreShop; items: StoreItem[] } | null> {
  const shopRes = await getJson<{ shop: StoreShop }>(`/shops/by-slug/${encodeURIComponent(slug)}`);
  if (!shopRes) return null;
  const itemsRes = await getJson<{ items: StoreItem[] }>(`/shops/${shopRes.shop.id}/items`);
  return { shop: shopRes.shop, items: itemsRes?.items ?? [] };
}
