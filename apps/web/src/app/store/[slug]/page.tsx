import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Storefront } from "@/components/store/Storefront";
import { fetchStore } from "@/lib/store-api";

// Always rendered per request: stock, prices and shop status change whenever
// the vendor edits, and a lapsed shop must go offline immediately.
export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await fetchStore(params.slug);
  if (!store) return { title: "Storefront not found — Babuki" };
  const { shop } = store;
  return {
    title: `${shop.name} — ${shop.industry} · Babuki`,
    description: `Browse ${shop.name}'s catalog and order directly${shop.address_text ? ` — ${shop.address_text}` : ""}.`,
    openGraph: { title: shop.name, description: `${shop.industry} on Babuki` },
  };
}

export default async function StorePage({ params }: Props) {
  const store = await fetchStore(params.slug);
  if (!store) notFound();
  return <Storefront shop={store.shop} items={store.items} />;
}
