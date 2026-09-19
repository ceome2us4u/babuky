"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { LocateFixed, MapPin, MessageCircle, Phone, QrCode, Search, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShopsMap, type ShopPin } from "@/components/shops/MapLazy";
import { BASE } from "@/components/shops/MerchantFlow";
import { SELECT_CLASS } from "@/components/shops/IndustryPicker";
import { PlaceSearch, type Place } from "@/components/shops/PlaceSearch";
import { INDUSTRY_GROUPS, OTHER_GROUP } from "@/lib/industries";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { buildUpiLink } from "@/lib/upi";
import { storeUrl } from "@/lib/store-url";
import { LIMITS } from "@/lib/validate";

type NearbyShop = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  mode: "display" | "order";
  phone: string; // +91XXXXXXXXXX
  // Only present once the shop owner has confirmed their UPI ID.
  upi_id: string | null;
  verified_merchant_name: string | null;
  lat: number;
  lng: number;
  distance_km: number;
};

// Amount-less UPI intent: the buyer's UPI app opens with the payee prefilled
// and they enter the amount (the storefront cart builds the amounted one).
const upiLink = (shop: NearbyShop) =>
  buildUpiLink({ vpa: shop.upi_id ?? "", name: shop.verified_merchant_name ?? shop.name });

// Distances people can look within; "any" = the whole country, nearest first.
const RADII: (number | "any")[] = [5, 10, 25, 50, "any"];

/** "Bengaluru, Karnataka, India" -> "Bengaluru, Karnataka". */
const shortName = (label: string) => label.split(",").slice(0, 2).join(",").trim();

/** 0.8 km / 12 km / 348 km: decimals only matter when it is close. */
const km = (d: number) => `${d < 10 ? d.toFixed(1) : Math.round(d)} km`;

export function BuyerFlow() {
  const { user, requestLogin } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [center, setCenter] = useState<[number, number]>(BASE);
  const [radius, setRadius] = useState<number | "any">(5);
  // A place the person searched for (another town, a pincode...); null = around them.
  const [place, setPlace] = useState<Place | null>(null);
  const placeRef = useRef<Place | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [shops, setShops] = useState<NearbyShop[]>([]);
  const [loading, setLoading] = useState(false);
  // The shop whose pay-by-QR dialog is open.
  const [active, setActive] = useState<NearbyShop | null>(null);

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!placeRef.current) setCenter([pos.coords.latitude, pos.coords.longitude]);
      },
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
        const res = await apiFetch<{ shops: NearbyShop[]; truncated?: boolean }>(`/shops/nearby?${params}`);
        if (!stale) {
          setShops(res.shops);
          setTruncated(!!res.truncated);
        }
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

  const pickPlace = (p: Place) => {
    placeRef.current = p;
    setPlace(p);
    setCenter([p.lat, p.lng]);
  };
  const clearPlace = () => {
    placeRef.current = null;
    setPlace(null);
    locate();
  };

  if (!unlocked || !user) {
    return (
      <div className="panel rounded-xl p-10 text-center">
        <MapPin className="mx-auto size-8 text-gold" />
        <h2 className="mt-4 text-2xl font-bold">Find shops near you — or anywhere in India</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Confirm your mobile number to see shops around you or in any town or pincode you search, call or message
          them, and browse what they sell. It only takes a minute.
        </p>
        <Button className="mt-6" size="lg" onClick={() => requestLogin("LOCAL_BUYER", () => setUnlocked(true))}>
          Find shops
        </Button>
      </div>
    );
  }

  const pins: ShopPin[] = shops.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    industry: s.industry,
    lat: s.lat,
    lng: s.lng,
    distanceKm: s.distance_km,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <PlaceSearch value={place} onPick={pickPlace} onClear={clearPlace} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by shop name, what it sells or its area"
              aria-label="Search shops"
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
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="How far to look">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Distance</span>
          {RADII.map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              aria-pressed={radius === r}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                radius === r ? "border-gold text-gold" : "border-border text-muted-foreground"
              }`}
            >
              {r === "any" ? "Anywhere in India" : `${r} km`}
            </button>
          ))}
          {!place && (
            <button
              onClick={locate}
              aria-label="Use my location"
              className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:border-gold hover:text-gold"
            >
              <LocateFixed className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="h-80 overflow-hidden rounded-xl border border-gold/25">
        <ShopsMap
          center={center}
          radiusKm={radius === "any" ? null : radius}
          centerLabel={place ? shortName(place.label) : "You are here"}
          shops={pins}
        />
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {loading
          ? "Searching..."
          : `${shops.length}${truncated ? "+" : ""} shop${shops.length === 1 ? "" : "s"} ${
              radius === "any"
                ? `across India, nearest to ${place ? shortName(place.label) : "you"} first`
                : `within ${radius} km of ${place ? shortName(place.label) : "you"}`
            }`}
        {truncated && !loading && " - showing the nearest 100. Search or pick a kind of shop to narrow it down."}
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shops.map((s) => (
          <div key={s.id} className="panel rounded-xl p-5">
            <p className="font-semibold">{s.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {s.industry} · {km(s.distance_km)} away
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
              {/* The store itself (slug.babuki.com) is where items are browsed, added to a
                  basket and paid for — so this opens it, rather than a read-only list. */}
              <Button asChild size="sm">
                <a
                  href={storeUrl(s.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${s.name}'s store to browse and buy (opens in a new tab)`}
                >
                  <Store className="size-4" /> Open store
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!s.upi_id}
                title={s.upi_id ? undefined : "This shop hasn't enabled UPI payments yet"}
                onClick={() => setActive(s)}
              >
                <QrCode className="size-4" /> Pay via QR
              </Button>
            </div>
          </div>
        ))}
        {!loading && shops.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <p>
              No shops match{radius === "any" ? "" : ` within ${radius} km`}. Try a different search
              {radius === "any" ? "" : ", a wider distance"} or another area.
            </p>
            {radius !== "any" && (
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setRadius("any")}>
                Search all of India
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="panel max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pay via UPI QR — {active?.name}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3 text-center">
              <div className="mx-auto grid w-fit place-items-center rounded-lg border border-gold/40 bg-white p-3">
                <QRCodeSVG value={upiLink(active)} size={176} level="M" />
              </div>
              <p className="text-sm font-medium">
                {active.verified_merchant_name}
                <span className="block text-xs font-normal text-muted-foreground">{active.upi_id}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                This pays the shop directly without picking items. To order specific items, use{" "}
                <a className="font-medium text-gold hover:underline" href={storeUrl(active.slug)} target="_blank" rel="noopener noreferrer">
                  Open store
                </a>
                . Payment goes directly from you to the merchant&apos;s UPI account; Babuki is an intermediary and never
                holds your money.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
