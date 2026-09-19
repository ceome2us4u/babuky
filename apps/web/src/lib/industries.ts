// Kinds of business a shop can be. Keep in sync with
// apps/api/src/lib/industries.ts (the API enforces it again). A shop's industry
// is one of these names, or — when nothing fits — the vendor's own words.

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

/** The dropdown value meaning "my business isn't listed — let me type it". */
export const OTHER_INDUSTRY = "__other__";
export const OTHER_GROUP = "Other";
export const CUSTOM_INDUSTRY_MAX = 40;

export const ALL_INDUSTRIES: readonly string[] = INDUSTRY_GROUPS.flatMap((g) => g.items);

// Same pattern as the API: letters/digits and a few punctuation marks, 2-40 chars.
const CUSTOM_INDUSTRY_RE = /^[\p{L}\p{N}][\p{L}\p{N} &/,.'()+-]{1,39}$/u;

export function customIndustryInput(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} &/,.'()+-]/gu, "").slice(0, CUSTOM_INDUSTRY_MAX);
}

/** null when fine (or still being typed); otherwise what to tell the user. */
export function customIndustryError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s.length < 2) return "Describe your business in a few words";
  return CUSTOM_INDUSTRY_RE.test(s) ? null : "Use letters and numbers only";
}

/** What to send to the API for the current picker state; "" if not ready yet. */
export function industryValue(selected: string, custom: string): string {
  return selected === OTHER_INDUSTRY ? custom.trim().replace(/\s+/g, " ") : selected;
}
