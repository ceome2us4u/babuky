"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, MessageCircle, Minus, Plus, QrCode, ShoppingBag, Smartphone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { maxQty, type useCart } from "@/lib/cart";
import type { StoreShop } from "@/lib/store-api";
import { buildUpiLink, inr } from "@/lib/upi";

type Cart = ReturnType<typeof useCart>;

// The order as plain text, grouped by category — what the vendor receives on
// WhatsApp. Babuki never sees or stores it.
function orderMessage(shop: StoreShop, cart: Cart) {
  const body = cart.groups
    .map(
      (g) =>
        `*${g.category}*\n` +
        g.lines
          .map(
            (l) =>
              `• ${l.item.name}${l.item.brand ? ` (${l.item.brand})` : ""} × ${l.qty} — ${inr(l.qty * l.item.price_paise)}`,
          )
          .join("\n"),
    )
    .join("\n\n");
  return `Hi ${shop.name}, I'd like to order:\n\n${body}\n\nTotal: ${inr(cart.totalPaise)}`;
}

export function CartDialog({
  shop,
  cart,
  open,
  onOpenChange,
}: {
  shop: StoreShop;
  cart: Cart;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [view, setView] = useState<"cart" | "pay">("cart");

  useEffect(() => {
    if (!open) setView("cart");
  }, [open]);

  // Direct Order needs a UPI ID the owner has confirmed; without one it degrades
  // to the WhatsApp handoff rather than showing a QR built from unconfirmed input.
  const canPayOnline = shop.mode === "order" && shop.is_upi_verified && !!shop.upi_id;
  const upi = canPayOnline
    ? buildUpiLink({
        vpa: shop.upi_id!,
        name: shop.verified_merchant_name ?? shop.name,
        amountPaise: cart.totalPaise,
        note: `Order ${shop.name}`,
      })
    : null;
  const whatsapp = `https://wa.me/${shop.contact_phone.replace(/^\+/, "")}?text=${encodeURIComponent(orderMessage(shop, cart))}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === "pay" ? <QrCode className="size-5 text-gold" /> : <ShoppingBag className="size-5 text-gold" />}
            {view === "pay" ? "Pay via UPI" : "Your cart"} — {shop.name}
          </DialogTitle>
        </DialogHeader>

        {cart.count === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Your cart is empty.</p>
        ) : view === "cart" ? (
          <div className="space-y-5">
            {cart.groups.map((g) => (
              <section key={g.category}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gold">{g.category}</h3>
                <ul className="space-y-3">
                  {g.lines.map(({ item, qty }) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                        <p className="text-xs text-muted-foreground">
                          {inr(item.price_paise)} × {qty} ={" "}
                          <span className="font-semibold text-foreground">{inr(qty * item.price_paise)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button size="icon" variant="outline" className="size-8" onClick={() => cart.dec(item)} aria-label={`Remove one ${item.name}`}>
                          {qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                        </Button>
                        <span className="w-5 text-center text-sm font-bold">{qty}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-8"
                          disabled={qty >= maxQty(item)}
                          onClick={() => cart.inc(item)}
                          aria-label={`Add one ${item.name}`}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <div className="flex items-center justify-between rounded-lg border border-gold/40 bg-secondary/40 p-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-black text-gold-gradient">{inr(cart.totalPaise)}</span>
            </div>

            <div className="grid gap-2">
              {canPayOnline && (
                <Button size="lg" onClick={() => setView("pay")}>
                  <QrCode className="size-4" /> Pay {inr(cart.totalPaise)} via UPI
                </Button>
              )}
              <Button asChild size="lg" variant={canPayOnline ? "outline" : "default"}>
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> {canPayOnline ? "Send order on WhatsApp" : "Order on WhatsApp"}
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={cart.clear}>
                Clear cart
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-2xl font-black text-gold-gradient">{inr(cart.totalPaise)}</p>
            <div className="mx-auto grid w-fit place-items-center rounded-lg border border-gold/40 bg-white p-3">
              <QRCodeSVG value={upi!} size={200} level="M" />
            </div>
            <p className="text-sm font-medium">
              {shop.verified_merchant_name}
              <span className="block text-xs font-normal text-muted-foreground">{shop.upi_id}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Your UPI app shows who you&apos;re paying before you confirm — check it matches this shop.
            </p>
            <Button asChild className="w-full" size="lg">
              <a href={upi!}>
                <Smartphone className="size-4" /> Open in my UPI app
              </a>
            </Button>
            <Button asChild className="w-full" variant="outline">
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> Send order on WhatsApp
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView("cart")}>
              <ArrowLeft className="size-4" /> Back to cart
            </Button>
            <p className="text-xs text-muted-foreground">
              Payment goes directly from you to the merchant&apos;s UPI account. Babuki is an intermediary
              and never holds your money or confirms your payment — share the order with the vendor
              after paying.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
