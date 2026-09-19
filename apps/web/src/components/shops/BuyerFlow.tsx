"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { LocateFixed, MapPin, MessageCircle, Phone, QrCode, Search, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShopsMap, type ShopPin } from "@/components/shops/MapLazy";
import { BASE } from "@/components/shops/MerchantFlow";
import { SELECT_CLASS } from "@/components/shops/IndustryPicker";
import { INDUSTRY_GROUPS, OTHER_GROUP } from "@/lib/industries";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { buildUpiLink, inr } from "@/lib/upi";
import { LIMITS } from "@/lib/validate";

type NearbyShop = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  mode: "display" | "order";
  phone: string; // +91XXXXXXXXXX
  // Only present once Razorpay has verified the vendor's UPI ID.
  upi_id: string | null;
  verified_merchant_name: string | null;
  lat: number;
  lng: number;
  distance_km: number;
};

type CatalogItem = {
  id: string;
  name: string;
  brand: string;
  price_paise: number;
  is_available: boolean;
  in_stock: boolean;
  category_name: string | null;
};

// Amount-less UPI intent: the buyer's UPI app opens with the payee prefilled
// and they enter the amount (the storefront cart builds the amounted one).
const upiLink = (shop: NearbyShop) =>
  buildUpiLink({ vpa: shop.upi_id ?? "", name: shop.verified_merchant_name ?? shop.name });

export function BuyerFlow() {
  const { user, requestLogin } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [center, setCenter] = useState<[number, number]>(BASE);
  const [radius, setRadius] = useState(5);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [shops, setShops] = useState<NearbyShop[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<{ shop: NearbyShop; kind: "catalog" | "qr" } | null>(null);
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => toast.error("Couldn't get your location — showing the default area"),
    );
  };

  // Ask for the location once, right after the buyer chose "shops near me".
  useEffect(() => {
    if (unlocked) locate();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || !user) return;
    let stale = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          lat: String(center[0]),
          lng: String(center[1]),
          radiusKm: String(radius),
        });
        if (filter !== "All") params.set("industry", filter);
        if (query.trim()) params.set("q", query.trim());
        const res = await apiFetch<{ shops: NearbyShop[] }>(`/shops/nearby?${params}`);
        if (!stale) setShops(res.shops);
      } catch (e) {
        if (!stale) toast.error(e instanceof Error ? e.message : "Couldn't load nearby shops");
      } finally {
        if (!stale) setLoading(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [unlocked, user, center, radius, filter, query]);

  // The catalog is public; load it when the Catalog dialog opens.
  useEffect(() => {
    if (active?.kind !== "catalog") return;
    let stale = false;
    setItems(null);
    apiFetch<{ items: CatalogItem[] }>(`/shops/${active.shop.id}/items`)
      .then((res) => !stale && setItems(res.items))
      .catch(() => {
        if (!stale) {
          setItems([]);
          toast.error("Couldn't load this catalog");
        }
      });
    return () => {
      stale = true;
    };
  }, [active]);

  if (!unlocked || !user) {
    return (
      <div className="panel rounded-xl p-10 text-center">
        <MapPin className="mx-auto size-8 text-gold" />
        <h2 className="mt-4 text-2xl font-bold">Find shops near you</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Confirm your mobile number to see the shops around you, call or message them, and browse what they sell. It only
          takes a minute.
        </p>
        <Button className="mt-6" size="lg" onClick={() => requestLogin("LOCAL_BUYER", () => setUnlocked(true))}>
          Show me shops near me
        </Button>
      </div>
    );
  }

  const pins: ShopPin[] = shops.map((s) => ({
    id: s.id,
    name: s.name,
    industry: s.industry,
    lat: s.lat,
    lng: s.lng,
    distanceKm: s.distance_km,
  }));

  const grouped = (items ?? []).reduce<Record<string, CatalogItem[]>>((acc, i) => {
    (acc[i.category_name ?? "Other"] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by shop name or what it sells"
            aria-label="Search shops near you"
            maxLength={LIMITS.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className={`${SELECT_CLASS} md:w-56`}
          aria-label="Kind of shop"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="All">All kinds of shops</option>
          {INDUSTRY_GROUPS.map((g) => (
            <option key={g.group} value={g.group}>
              {g.group}
            </option>
          ))}
          <option value={OTHER_GROUP}>Other</option>
        </select>
        <div className="flex gap-2">
          {[5, 10].map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                radius === r ? "border-gold text-gold" : "border-border text-muted-foreground"
              }`}
            >
              {r} km
            </button>
          ))}
          <button
            onClick={locate}
            aria-label="Use my location"
            className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:border-gold hover:text-gold"
          >
            <LocateFixed className="size-4" />
          </button>
        </div>
      </div>

      <div className="h-80 overflow-hidden rounded-xl border border-gold/25">
        <ShopsMap center={center} radiusKm={radius} shops={pins} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shops.map((s) => (
          <div key={s.id} className="panel rounded-xl p-5">
            <p className="font-semibold">{s.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {s.industry} · {s.distance_km.toFixed(1)} km away
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${s.phone}`}>
                  <Phone className="size-4" /> Call
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`https://wa.me/${s.phone.replace(/^\+/, "")}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActive({ shop: s, kind: "catalog" })}>
                <Store className="size-4" /> Catalog
              </Button>
              <Button
                size="sm"
                disabled={!s.upi_id}
                title={s.upi_id ? undefined : "This shop hasn't enabled UPI payments yet"}
                onClick={() => setActive({ shop: s, kind: "qr" })}
              >
                <QrCode className="size-4" /> Pay via QR
              </Button>
            </div>
          </div>
        ))}
        {!loading && shops.length === 0 && (
          <p className="text-sm text-muted-foreground">No shops match this filter within {radius} km.</p>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="panel max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {active?.kind === "qr" ? "Pay via UPI QR" : "Catalog"} — {active?.shop.name}
            </DialogTitle>
          </DialogHeader>
          {active?.kind === "qr" ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto grid w-fit place-items-center rounded-lg border border-gold/40 bg-white p-3">
                <QRCodeSVG value={upiLink(active.shop)} size={176} level="M" />
              </div>
              <p className="text-sm font-medium">
                {active.shop.verified_merchant_name}
                <span className="block text-xs font-normal text-muted-foreground">{active.shop.upi_id}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Payment goes directly from you to the merchant&apos;s UPI account. Babuki is an
                intermediary and never holds your money.
              </p>
            </div>
          ) : items === null ? (
            <p className="text-sm text-muted-foreground">Loading catalog…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">This shop hasn&apos;t listed any items yet.</p>
          ) : (
            <div className="space-y-4 text-sm">
              {Object.entries(grouped).map(([category, list]) => (
                <section key={category}>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-gold">{category}</h3>
                  <ul className="space-y-2">
                    {list.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3 border-b border-border/60 pb-2">
                        <span className={i.in_stock && i.is_available ? "" : "text-muted-foreground"}>
                          {i.name}
                          {i.brand && <span className="text-xs text-muted-foreground"> · {i.brand}</span>}
                          {!(i.in_stock && i.is_available) && (
                            <span className="ml-2 text-xs font-medium text-destructive">Out of stock</span>
                          )}
                        </span>
                        <span className="shrink-0 text-gold">{inr(i.price_paise)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
