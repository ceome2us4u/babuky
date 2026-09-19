import { query } from "./db.js";
import { isUuid } from "./validation.js";

// Reusable ownership check for every vendor-only shop-scoped route
// (categories, items, upload-url, subscribe). A malformed id is simply "not
// yours" — never a Postgres uuid-syntax error surfacing as a 500.
export async function requireShopOwner(shopId: string, phone: string): Promise<boolean> {
  if (!isUuid(shopId)) return false;
  const { rows } = await query("SELECT 1 FROM shops WHERE id = $1 AND owner_phone = $2", [
    shopId,
    phone,
  ]);
  return rows.length > 0;
}
