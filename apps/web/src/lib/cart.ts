"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { StoreItem } from "@/lib/store-api";

const MAX_UNTRACKED_QTY = 99;

export const isPurchasable = (item: StoreItem) => item.is_available && item.in_stock;
// A vendor-set stock count is a hard cap; no count means untracked/always available.
export const maxQty = (item: StoreItem) => item.stock_quantity ?? MAX_UNTRACKED_QTY;

export type CartLine = { item: StoreItem; qty: number };
export type CartGroup = { category: string; lines: CartLine[] };

/**
 * Client-side cart for one storefront. Deliberately not persisted server-side:
 * checkout is either a UPI QR the buyer pays directly or an order handed to
 * the vendor over WhatsApp/phone — Babuki never sees the transaction.
 * Persists per shop in localStorage and is re-validated against the live
 * catalog on load, so a price/stock change or a removed item can't leave a
 * stale line in the cart.
 */
export function useCart(slug: string, items: StoreItem[]) {
  const key = `babuki-cart:${slug}`;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
      const clean: Record<string, number> = {};
      for (const [id, q] of Object.entries(saved)) {
        const item = byId.get(id);
        if (item && isPurchasable(item) && Number.isInteger(q) && q > 0) {
          clean[id] = Math.min(q, maxQty(item));
        }
      }
      setQty(clean);
    } catch {
      /* storage unavailable or corrupt — start with an empty cart */
    }
    setReady(true);
  }, [key, byId]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(qty));
    } catch {
      /* private mode etc. — the cart just won't survive a reload */
    }
  }, [key, qty, ready]);

  const inc = useCallback((item: StoreItem) => {
    if (!isPurchasable(item)) return;
    setQty((q) => ({ ...q, [item.id]: Math.min((q[item.id] ?? 0) + 1, maxQty(item)) }));
  }, []);

  const dec = useCallback((item: StoreItem) => {
    setQty((q) => {
      const next = (q[item.id] ?? 0) - 1;
      const { [item.id]: _removed, ...rest } = q;
      void _removed;
      return next > 0 ? { ...rest, [item.id]: next } : rest;
    });
  }, []);

  const clear = useCallback(() => setQty({}), []);

  const lines: CartLine[] = useMemo(
    () => items.filter((i) => (qty[i.id] ?? 0) > 0).map((item) => ({ item, qty: qty[item.id] })),
    [items, qty],
  );

  // Grouped by category (falling back to "Other"), in catalog order.
  const groups: CartGroup[] = useMemo(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of lines) {
      const cat = line.item.category_name ?? "Other";
      map.set(cat, [...(map.get(cat) ?? []), line]);
    }
    return [...map.entries()].map(([category, l]) => ({ category, lines: l }));
  }, [lines]);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const totalPaise = lines.reduce((s, l) => s + l.qty * l.item.price_paise, 0);

  return { qty, inc, dec, clear, lines, groups, count, totalPaise, ready };
}
