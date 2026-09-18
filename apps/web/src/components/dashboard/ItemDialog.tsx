"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/components/dashboard/CatalogManager";
import { apiFetch, apiPost } from "@/lib/api";
import type { StoreItem } from "@/lib/store-api";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Same look as <Input>; the mock's kit has no Select, and a native <select>
// is the right control for a short list on mobile anyway.
const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ItemDialog({
  shopId,
  categories,
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  shopId: string;
  categories: Category[];
  item: StoreItem | null; // null = new item
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? "");
  const [price, setPrice] = useState(item ? String(item.price_paise / 100) : "");
  const [trackStock, setTrackStock] = useState(item ? item.stock_quantity !== null : false);
  const [stock, setStock] = useState(item?.stock_quantity != null ? String(item.stock_quantity) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Photos go browser -> S3 through a short-lived presigned URL; no image
  // bytes pass through the API server.
  const upload = async (file: File) => {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Use a JPEG, PNG or WebP image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is too large — keep it under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await apiPost<{ uploadUrl: string; publicUrl: string }>(
        `/shops/${shopId}/upload-url`,
        { contentType: file.type },
      );
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload failed");
      setImageUrl(publicUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload the photo");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const rupees = Number(price);
    if (!name.trim()) return toast.error("Give the item a name");
    if (!price.trim() || !Number.isFinite(rupees) || rupees < 0) return toast.error("Enter a valid price");
    const stockQuantity = trackStock ? Number(stock) : null;
    if (trackStock && (!stock.trim() || !Number.isInteger(stockQuantity) || (stockQuantity as number) < 0)) {
      return toast.error("Enter the stock as a whole number (0 or more)");
    }

    const body = {
      name: name.trim(),
      brand: brand.trim(),
      description: description.trim(),
      categoryId: categoryId || null,
      priceInPaise: Math.round(rupees * 100),
      imageUrl,
      stockQuantity,
    };

    setSaving(true);
    try {
      if (item) {
        await apiFetch(`/shops/${shopId}/items/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiPost(`/shops/${shopId}/items`, body);
      }
      toast.success(item ? "Item updated" : "Item added");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the item");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/50">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-gold/60">
                  <ImageIcon className="size-7" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium shadow-sm hover:border-gold/50 hover:bg-secondary/60">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {imageUrl ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(f);
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Chocolate truffle cake" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-brand">
                Brand <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="item-brand" value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-category">Category</Label>
              <select id="item-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-desc">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="item-desc" rows={3} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-price">Price (₹)</Label>
              <Input id="item-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="120" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-stock">Units in stock</Label>
              <Input
                id="item-stock"
                inputMode="numeric"
                disabled={!trackStock}
                value={trackStock ? stock : ""}
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                placeholder={trackStock ? "0" : "Not tracked"}
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground">
            <Checkbox checked={trackStock} onCheckedChange={(v) => setTrackStock(v === true)} className="mt-0.5" />
            <span>
              Track stock for this item. Buyers see &quot;Out of stock&quot; at 0 and can&apos;t add more than
              you have. Leave off if it&apos;s always available. You update the count yourself — Babuki never
              sees the sale.
            </span>
          </label>

          <Button className="w-full" disabled={saving || uploading} onClick={() => void save()}>
            {saving ? "Saving…" : item ? "Save changes" : "Add item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
