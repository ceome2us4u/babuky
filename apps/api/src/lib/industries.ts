// What kind of business a shop is. A wide, grouped list (so a grocer, a
// tailor, a tyre shop and a tutor can all find themselves) plus "Other" with
// free text. Keep in sync with apps/web/src/lib/industries.ts.
//
// `shops.industry` is a plain text column: it holds one of the names below, or
// — for a business not on the list — the vendor's own words. The four names
// the first version shipped with (Bakery, Grocery, Hotel, Retail) are kept
// exactly so existing shops stay in their place.

export const INDUSTRY_GROUPS = [
  {
    group: "Food & Drink",
    items: ["Bakery", "Sweets & Snacks", "Hotel", "Restaurant", "Cafe & Juice Bar", "Tea & Coffee", "Tiffin & Catering", "Meat & Fish", "Fruits & Vegetables", "Milk & Dairy", "Ice Cream"],
  },
  {
    group: "Grocery & Daily Needs",
    items: ["Grocery", "Supermarket", "General Store", "Stationery", "Pooja & Flowers", "Packaged Water & Gas"],
  },
  {
    group: "Fashion & Beauty",
    items: ["Clothing & Garments", "Footwear", "Jewellery", "Tailoring & Boutique", "Salon & Beauty Parlour", "Cosmetics & Personal Care", "Bags & Accessories", "Watches"],
  },
  {
    group: "Home & Living",
    items: ["Furniture", "Home Decor", "Kitchenware & Utensils", "Hardware & Paints", "Electricals & Lighting", "Plumbing & Sanitary", "Building Materials", "Mattresses & Bedding", "Curtains & Furnishing"],
  },
  {
    group: "Electronics & Mobile",
    items: ["Mobile Shop", "Electronics & Appliances", "Computers & Laptops", "Mobile & Appliance Repair", "CCTV & Security", "Batteries & Inverters"],
  },
  {
    group: "Health & Wellness",
    items: ["Pharmacy", "Clinic & Diagnostics", "Optical Store", "Gym & Fitness", "Ayurveda & Herbal", "Medical Equipment"],
  },
  {
    group: "Services",
    items: ["Laundry & Dry Cleaning", "Printing & Xerox", "Photography & Studio", "Event & Decoration", "Travel & Tickets", "Tuition & Coaching", "Courier & Packing", "Repair & Maintenance", "Cleaning & Pest Control"],
  },
  {
    group: "Vehicles",
    items: ["Auto Spares", "Two-Wheeler Shop & Garage", "Car Accessories", "Tyres", "Car & Bike Wash"],
  },
  {
    group: "Farm & Pets",
    items: ["Agri Inputs & Seeds", "Nursery & Plants", "Pet Shop & Supplies", "Poultry & Feed"],
  },
  {
    group: "Kids, Gifts & Books",
    items: ["Toys & Games", "Gifts & Novelties", "Books", "Sports Goods", "Baby Products", "Party Supplies"],
  },
  {
    group: "General & Retail",
    items: ["Retail", "Wholesale", "Departmental Store", "Second-hand & Resale"],
  },
] as const;

export const OTHER_GROUP = "Other";

export const SHOP_INDUSTRIES: readonly string[] = INDUSTRY_GROUPS.flatMap((g) => g.items);

// A vendor's own description when nothing on the list fits: letters/digits and a
// few punctuation marks, 2-40 characters.
const CUSTOM_INDUSTRY_RE = /^[\p{L}\p{N}][\p{L}\p{N} &/,.'()+-]{1,39}$/u;

/** The value to store, or null if `v` isn't a listed industry or a sensible custom one. */
export function normalizeIndustry(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (SHOP_INDUSTRIES.includes(s)) return s;
  return CUSTOM_INDUSTRY_RE.test(s) ? s : null;
}

/**
 * What the buyer's filter means: "All" → no filter, a group name → any
 * industry in it ("Other" → anything not on the list), a listed industry → just
 * that one. null = not a recognised filter.
 */
export function industryFilter(v: string): { any: string[] } | { notIn: string[] } | { eq: string } | null {
  if (v === OTHER_GROUP) return { notIn: [...SHOP_INDUSTRIES] };
  const group = INDUSTRY_GROUPS.find((g) => g.group === v);
  if (group) return { any: [...group.items] };
  if (SHOP_INDUSTRIES.includes(v)) return { eq: v };
  return null;
}
