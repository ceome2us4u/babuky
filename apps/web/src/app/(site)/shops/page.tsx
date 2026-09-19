import type { Metadata } from "next";

import { ShopsView } from "@/components/shops/ShopsView";

export const metadata: Metadata = {
  title: "Get Your Shop Online — Babuki",
  description:
    "Get your own shop page at yourshop.babuki.com for ₹500/month, locked for life. Add your items and photos, or find shops within 5–10 km of you.",
  openGraph: {
    title: "Get Your Shop Online — Babuki",
    description: "Early bird: lock in ₹500/month for life before our native apps launch.",
  },
};

export default function ShopsPage() {
  return <ShopsView />;
}
