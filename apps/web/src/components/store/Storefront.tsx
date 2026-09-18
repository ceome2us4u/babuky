"use client";

import { useMemo, useState } from "react";
import { ImageIcon, MapPin, MessageCircle, Minus, Phone, Plus, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CartDialog } from "@/components/store/CartDialog";
import { isPurchasable, maxQty, useCart } from "@/lib/cart";
import type { StoreItem, StoreShop } from "@/lib/store-api";
import { inr } from "@/lib/upi";

const LOW_STOCK_AT = 5;

export function Storefront({ shop, items }: { shop: StoreShop; items: StoreItem[] }) {
  const cart = useCart(shop.slug, items);
  const [cartOpen, setCartOpen] = useState(false);
  const [category, setCategory] = useState<string>("All");

  // Categories in catalog order (the API sorts by the vendor's category order).
  const sections = useMemo(() => {
    const map = new Map<string, StoreItem[]>();
    for (const item of items) {
      const cat = item.category_name ?? "Other";
      map.set(cat, [...(map.get(cat) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  const visible = category === "All" ? sections : sections.filter(([c]) => c === category);
  const phoneDigits = shop.contact_phone.replace(/^\+/, "");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 pb-32">
      <header className="panel mb-8 flex flex-col gap-4 rounded-xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{shop.industry}</Badge>
            <Badge className={shop.mode === "order" ? "" : "bg-muted text-muted-foreground"}>
              {shop.mode === "order" ? "Order & pay online" : "Call or WhatsApp to order"}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-black md:text-3xl">{shop.name}</h1>
          {shop.address_text && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" /> {shop.address_text}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline">
            <a href={`tel:${shop.contact_phone}`}>
              <Phone className="size-4" /> Call
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="panel rounded-xl p-10 text-center">
          <ShoppingBag className="mx-auto size-8 text-gold" />
          <h2 className="mt-4 text-xl font-bold">Catalog coming soon</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {shop.name} hasn&apos;t listed any items yet. You can still call or WhatsApp them.
          </p>
        </div>
      ) : (
        <>
          {sections.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {["All", ...sections.map(([c]) => c)].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    category === c
                      ? "border-gold bg-secondary text-burgundy"
                      : "border-border bg-card text-muted-foreground hover:border-gold/50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-10">
            {visible.map(([cat, list]) => (
              <section key={cat}>
                <h2 className="mb-4 text-lg font-bold text-gold">{cat}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      qty={cart.qty[item.id] ?? 0}
                      onInc={() => cart.inc(item)}
                      onDec={() => cart.dec(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/25 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {cart.count} item{cart.count === 1 ? "" : "s"} in cart
              </p>
              <p className="text-lg font-bold text-gold-gradient">{inr(cart.totalPaise)}</p>
            </div>
            <Button size="lg" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="size-4" /> View cart
            </Button>
          </div>
        </div>
      )}

      <CartDialog shop={shop} cart={cart} open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}

function ItemCard({
  item,
  qty,
  onInc,
  onDec,
}: {
  item: StoreItem;
  qty: number;
  onInc: () => void;
  onDec: () => void;
}) {
  const purchasable = isPurchasable(item);
  const atMax = qty >= maxQty(item);
  const low = purchasable && item.stock_quantity !== null && item.stock_quantity <= LOW_STOCK_AT;

  return (
    <article className={`panel flex flex-col overflow-hidden rounded-xl ${purchasable ? "" : "opacity-75"}`}>
      <div className="relative aspect-[4/3] bg-secondary/50">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-gold/60">
            <ImageIcon className="size-10" />
          </div>
        )}
        {!purchasable && (
          <Badge className="absolute left-3 top-3 border-destructive/30 bg-card text-destructive">Out of stock</Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {item.brand && <p className="text-xs font-semibold uppercase text-gold">{item.brand}</p>}
        <h3 className="font-semibold leading-snug">{item.name}</h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-lg font-bold">{inr(item.price_paise)}</p>
            {low && <p className="text-xs font-medium text-destructive">Only {item.stock_quantity} left</p>}
          </div>
          {qty === 0 ? (
            <Button size="sm" disabled={!purchasable} onClick={onInc}>
              <Plus className="size-4" /> Add
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="size-8" onClick={onDec} aria-label={`Remove one ${item.name}`}>
                <Minus className="size-4" />
              </Button>
              <span className="w-6 text-center text-sm font-bold">{qty}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                disabled={atMax}
                onClick={onInc}
                aria-label={`Add one ${item.name}`}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
