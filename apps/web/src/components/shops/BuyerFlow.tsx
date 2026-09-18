"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, LocateFixed, MapPin, Search, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShopsMap, type ShopPin } from "@/components/shops/MapLazy";
import { INDUSTRIES, BASE } from "@/components/shops/MerchantFlow";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { siteConfig } from "@/config/site";

type NearbyShop = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  mode: "display" | "order";
  lat: number;
  lng: number;
  distance_km: number;
};

export function BuyerFlow() {
  const { user, requestLogin } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [center, setCenter] = useState<[number, number]>(BASE);
  const [radius, setRadius] = useState(5);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [shops, setShops] = useState<NearbyShop[]>([]);
  const [loading, setLoading] = useState(false);

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

  if (!unlocked || !user) {
    return (
      <div className="panel rounded-xl p-10 text-center">
        <MapPin className="mx-auto size-8 text-gold" />
        <h2 className="mt-4 text-2xl font-bold">Shops Nearby</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          A quick OTP login is required to view shops near you or save vendors. Buyer numbers are tagged{" "}
          <span className="text-gold">LOCAL_BUYER</span>.
        </p>
        <Button className="mt-6" size="lg" onClick={() => requestLogin("LOCAL_BUYER", () => setUnlocked(true))}>
          Login to see shops near me
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search shops near you"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["All", ...INDUSTRIES].map((i) => (
            <button
              key={i}
              onClick={() => setFilter(i)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                filter === i ? "border-gold text-gold" : "border-border text-muted-foreground"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
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
          <Button variant="outline" size="sm" className="h-auto" onClick={locate} aria-label="Use my location">
            <LocateFixed className="size-4" />
          </Button>
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
            <Button asChild size="sm" className="mt-4 w-full">
              <a href={`https://${s.slug}.${siteConfig.domain}`} target="_blank" rel="noreferrer">
                <Store className="size-4" /> Open storefront <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        ))}
        {!loading && shops.length === 0 && (
          <p className="text-sm text-muted-foreground">No shops match this filter within {radius} km yet.</p>
        )}
      </div>
    </div>
  );
}
