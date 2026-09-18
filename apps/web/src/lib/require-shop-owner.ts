import { query } from "./db";

// Reusable ownership check for every vendor-only shop-scoped route
// (categories, items, upload-url, subscribe).
export async function requireShopOwner(shopId: string, phone: string): Promise<boolean> {
  const { rows } = await query("SELECT 1 FROM shops WHERE id = $1 AND owner_phone = $2", [
    shopId,
    phone,
  ]);
  return rows.length > 0;
}
