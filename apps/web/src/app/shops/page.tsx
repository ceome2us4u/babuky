import type { Metadata } from "next";

import { ShopsView } from "@/components/shops/ShopsView";

export const metadata: Metadata = {
  title: "Hyperlocal Shop Provisioning — Babuki",
  description:
    "Provision your shop on [yourname].babuki.com for ₹500/month locked for life, or discover verified shops within 5–10 km of you.",
  openGraph: {
    title: "Hyperlocal Shop Provisioning — Babuki",
    description: "Early bird: lock in ₹500/month for life before our native apps launch.",
  },
};

export default function ShopsPage() {
  return <ShopsView />;
}
