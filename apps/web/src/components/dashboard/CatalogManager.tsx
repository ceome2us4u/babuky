"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemDialog } from "@/components/dashboard/ItemDialog";
import { apiFetch, apiPost } from "@/lib/api";
import type { StoreItem } from "@/lib/store-api";
import { inr } from "@/lib/upi";
import { LIMITS } from "@/lib/validate";

export type Category = { id: string; name: string; sort_order: number };

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function CatalogManager({ shopId }: { shopId: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [items, setItems] = useState<StoreItem[] | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dialog, setDialog] = useState<{ item: StoreItem | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        apiFetch<{ categories: Category[] }>(`/shops/${shopId}/categories`),
        apiFetch<{ items: StoreItem[] }>(`/shops/${shopId}/items`),
      ]);
      setCategories(c.categories);
      setItems(i.items);
    } catch (e) {
      toast.error(errorText(e, "Couldn't load your catalog"));
      setCategories([]);
      setItems([]);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      await apiPost(`/shops/${shopId}/categories`, { name, sortOrder: (categories?.length ?? 0) + 1 });
      setNewCategory("");
      await load();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add the category"));
    }
  };

  const saveRename = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    const current = categories?.find((c) => c.id === renaming.id);
    setRenaming(null);
    if (!name || name === current?.name) return;
    try {
      await apiFetch(`/shops/${shopId}/categories/${renaming.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await load();
    } catch (e) {
      toast.error(errorText(e, "Couldn't rename the category"));
    }
  };

  const removeCategory = async (c: Category) => {
    if (!window.confirm(`Delete "${c.name}"? Its items are kept and move to "Uncategorised".`)) return;
    try {
      await apiFetch(`/shops/${shopId}/categories/${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete the category"));
    }
  };

  const removeItem = async (item: StoreItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await apiFetch(`/shops/${shopId}/items/${item.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete the item"));
    }
  };

  const toggleAvailable = async (item: StoreItem) => {
    try {
      await apiFetch(`/shops/${shopId}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable: !item.is_available }),
      });
      await load();
    } catch (e) {
      toast.error(errorText(e, "Couldn't update the item"));
    }
  };

  if (categories === null || items === null) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Loader2 className="mx-auto size-6 animate-spin" />
      </div>
    );
  }

  const grouped = items.reduce<Record<string, StoreItem[]>>((acc, i) => {
    (acc[i.category_name ?? "Uncategorised"] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <section className="panel rounded-xl p-6">
        <h2 className="text-lg font-bold">Categories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Group your items — buyers browse, and their cart is broken down, by category.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) =>
            renaming?.id === c.id ? (
              <Input
                key={c.id}
                autoFocus
                className="h-9 w-44"
                maxLength={LIMITS.category}
                aria-label="Category name"
                value={renaming.name}
                onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                onBlur={() => void saveRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveRename();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-secondary/80 py-1 pl-3.5 pr-1.5 text-sm font-medium text-burgundy"
              >
                {c.name}
                <button
                  onClick={() => setRenaming({ id: c.id, name: c.name })}
                  className="rounded-full p-1 hover:bg-card"
                  aria-label={`Rename ${c.name}`}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => void removeCategory(c)}
                  className="rounded-full p-1 hover:bg-card"
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ),
          )}
          {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
        </div>
        <div className="mt-4 flex max-w-sm gap-2">
          <Input
            placeholder="New category name"
            aria-label="New category name"
            value={newCategory}
            maxLength={LIMITS.category}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addCategory()}
          />
          <Button variant="outline" onClick={() => void addCategory()} disabled={!newCategory.trim()}>
            Add
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Items</h2>
          <Button onClick={() => setDialog({ item: null })}>
            <Plus className="size-4" /> Add item
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="panel rounded-xl p-10 text-center text-sm text-muted-foreground">
            No items yet. Add your first item with a photo and price — buyers get a + / − cart on your storefront.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gold">{cat}</h3>
                <ul className="space-y-2">
                  {list.map((item) => (
                    <li key={item.id} className="panel flex items-center gap-4 rounded-xl p-3">
                      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-secondary/50">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="grid size-full place-items-center text-gold/60">
                            <ImageIcon className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {item.name}
                          {item.brand && <span className="text-sm font-normal text-muted-foreground"> · {item.brand}</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{inr(item.price_paise)}</span>
                          {" · "}
                          {item.stock_quantity === null
                            ? "Stock not tracked"
                            : item.stock_quantity === 0
                              ? "Out of stock"
                              : `${item.stock_quantity} in stock`}
                        </p>
                      </div>
                      {!item.is_available && <Badge className="hidden bg-muted text-muted-foreground sm:inline-flex">Hidden</Badge>}
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => void toggleAvailable(item)}>
                          {item.is_available ? "Hide" : "Show"}
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => setDialog({ item })} aria-label={`Edit ${item.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => void removeItem(item)} aria-label={`Delete ${item.name}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {dialog && (
        <ItemDialog
          shopId={shopId}
          categories={categories}
          item={dialog.item}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
