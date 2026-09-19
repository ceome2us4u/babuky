"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, Loader2, LocateFixed, Lock, Store, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/shops/MapLazy";
import { UpiSetup } from "@/components/shops/UpiSetup";
import { FieldError } from "@/components/ui/field-error";
import { useAuth } from "@/lib/auth";
import { LIMITS, nameError, slugError, slugInput } from "@/lib/validate";
import { ApiError, apiFetch, apiPost } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { siteConfig } from "@/config/site";

export const INDUSTRIES = ["Bakery", "Grocery", "Hotel", "Retail"] as const;

// Default map centre (Bengaluru) until the vendor moves the pin.
export const BASE: [number, number] = [12.9716, 77.5946];

type MyShop = { id: string; slug: string; status: "draft" | "active" | "suspended" };

export function MerchantFlow() {
  const { user, requestLogin } = useAuth();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(1);

  const [slug, setSlug] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [industry, setIndustry] = useState<string>("Bakery");
  const [mode, setMode] = useState<"display" | "order">("display");

  const [lat, setLat] = useState(BASE[0]);
  const [lng, setLng] = useState(BASE[1]);
  const [address, setAddress] = useState("Move the pin to fetch the address…");

  const [shopId, setShopId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [live, setLive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.profile) return;
    setOwnerName((current) => current || user.profile?.fullName || "");
    setShopName((current) => current || user.profile?.businessName || "");
  }, [user]);

  // Debounced, race-safe subdomain availability check against the API.
  useEffect(() => {
    if (!slug) {
      setAvailable(null);
      return;
    }
    if (slugError(slug)) {
      setChecking(false);
      setAvailable(false);
      return;
    }
    setChecking(true);
    let stale = false;
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{ available: boolean }>(`/shops/slug-available?slug=${encodeURIComponent(slug)}`);
        if (!stale) setAvailable(res.available);
      } catch {
        if (!stale) setAvailable(null);
      } finally {
        if (!stale) setChecking(false);
      }
    }, 500);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [slug]);

  // Reverse-geocode the pin through our own API (single controlled UA).
  useEffect(() => {
    if (step !== 3) return;
    let stale = false;
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{ address: string | null }>(`/geocode/reverse?lat=${lat}&lng=${lng}`);
        if (!stale) setAddress(res.address ?? "Address unavailable for this pin");
      } catch {
        if (!stale) setAddress("Reverse geocoding unavailable right now");
      }
    }, 500);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [lat, lng, step]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location isn't available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => toast.error("Couldn't get your location — drag the pin instead"),
    );
  };

  // The subscription webhook flips the shop from draft to active; poll for it.
  const waitForActivation = (id: string) => {
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      try {
        const { shops } = await apiFetch<{ shops: MyShop[] }>("/shops/mine");
        if (shops.find((s) => s.id === id)?.status === "active") {
          setLive(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* keep polling */
      }
      if (tries >= 40 && pollRef.current) clearInterval(pollRef.current);
    }, 3000);
  };

  const pay = async () => {
    setPaying(true);
    try {
      let id = shopId;
      if (!id) {
        const created = await apiPost<{ shop: { id: string } }>("/shops", {
          slug,
          name: shopName.trim(),
          ownerName: ownerName.trim(),
          industry,
          mode,
          lat,
          lng,
          addressText: address.startsWith("Move the pin") ? "" : address,
        });
        id = created.shop.id;
        setShopId(id);
      }
      const { subscription } = await apiPost<{ subscription: { id: string } }>(`/shops/${id}/subscribe`, {});
      await openRazorpayCheckout({
        subscriptionId: subscription.id,
        description: `${slug}.${siteConfig.domain} · ₹500/month, locked for life`,
        prefill: { name: ownerName, email: user?.profile?.email, contact: user?.phone },
        onSuccess: () => {
          setPaid(true);
          setPaying(false);
          toast.success("Payment received");
          waitForActivation(id!);
        },
        onDismiss: () => setPaying(false),
      });
    } catch (e) {
      setPaying(false);
      if (e instanceof ApiError && e.status === 409) {
        toast.error("That subdomain was just taken — pick another");
        setStep(1);
        return;
      }
      toast.error(e instanceof Error ? e.message : "Couldn't start the payment");
    }
  };

  if (!started || !user) {
    return (
      <div className="panel rounded-xl p-10 text-center">
        <Store className="mx-auto size-8 text-gold" />
        <h2 className="mt-4 text-2xl font-bold">Provision your storefront in 4 steps</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Verify your mobile number to begin. Merchant numbers are tagged{" "}
          <span className="text-gold">MERCHANT</span> for onboarding support.
        </p>
        <Button className="mt-6" size="lg" onClick={() => requestLogin("MERCHANT", () => setStarted(true))}>
          Start merchant onboarding
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} labels={["Subdomain", "Store & catalog", "Location", "Checkout"]} />

      {step === 1 && (
        <div className="panel space-y-4 rounded-xl p-8">
          <h3 className="text-lg font-bold">Step 1 — Claim your subdomain</h3>
          <div className="flex items-center gap-2">
            <Input
              value={slug}
              maxLength={24}
              placeholder="Your shop name"
              aria-label="Your shop's web address"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setSlug(slugInput(e.target.value))}
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">.{siteConfig.domain}</span>
          </div>
          <div className="min-h-6 text-sm">
            {checking && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Checking availability…
              </span>
            )}
            {!checking && available === true && (
              <span className="flex items-center gap-2 text-gold">
                <Check className="size-4" /> {slug}.{siteConfig.domain} is available
              </span>
            )}
            {!checking && available === false && (
              <span className="flex items-center gap-2 text-destructive">
                <X className="size-4" />{" "}
                {slugError(slug) ?? "Not available — try another name"}
              </span>
            )}
          </div>
          <Button disabled={available !== true} onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="panel space-y-5 rounded-xl p-8">
          <h3 className="text-lg font-bold">Step 2 — Store details &amp; catalog mode</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Owner name</Label>
              <Input
                value={ownerName}
                maxLength={LIMITS.fullName}
                autoComplete="name"
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your full name"
              />
              <FieldError message={nameError(ownerName)} />
            </div>
            <div className="space-y-2">
              <Label>Store name</Label>
              <Input
                value={shopName}
                maxLength={LIMITS.shopName}
                autoComplete="organization"
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Your store name"
              />
            </div>
            <div className="space-y-2">
              <Label>Verified contact</Label>
              <Input value={user.phone} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map((i) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    key={i}
                    onClick={() => setIndustry(i)}
                    className={industry === i ? "border-primary bg-accent text-primary" : "text-muted-foreground"}
                  >
                    {i}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ModeCard
              active={mode === "display"}
              onClick={() => setMode("display")}
              title="Display Only"
              desc="Showcase your catalog. Buyers call or WhatsApp you to order."
            />
            <ModeCard
              active={mode === "order"}
              onClick={() => setMode("order")}
              title="Direct Order"
              desc="Buyers place orders and pay you directly via a UPI QR built from your verified UPI ID."
            />
          </div>
          {mode === "order" && (
            <p className="rounded-md border border-dashed border-gold/40 p-4 text-sm text-muted-foreground">
              You&apos;ll add and verify your UPI ID right after checkout. Payments go straight from the
              buyer to your bank account — 0% commission, and Babuki never touches the money.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={shopName.trim().length < 2 || ownerName.trim().length < 2 || !!nameError(ownerName)}
              onClick={() => setStep(3)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="panel space-y-4 rounded-xl p-8">
          <h3 className="text-lg font-bold">Step 3 — Pin your exact location</h3>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Drag the gold pin (or tap the map) to your shop entrance.</p>
            <Button variant="outline" size="sm" onClick={useMyLocation}>
              <LocateFixed className="size-4" /> Use my location
            </Button>
          </div>
          <div className="h-80 overflow-hidden rounded-lg border border-gold/25">
            <LocationPicker
              lat={lat}
              lng={lng}
              onChange={(la, ln) => {
                setLat(la);
                setLng(ln);
              }}
            />
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Latitude</p>
              <p className="text-gold">{lat.toFixed(6)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Longitude</p>
              <p className="text-gold">{lng.toFixed(6)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Reverse geocoded address</p>
              <p className="line-clamp-2">{address}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="panel space-y-5 rounded-xl p-8">
          <h3 className="text-lg font-bold">Step 4 — Checkout</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Storefront" v={`${slug}.${siteConfig.domain}`} />
            <Row k="Store name" v={shopName} />
            <Row k="Owner" v={ownerName} />
            <Row k="Contact" v={user.phone} />
            <Row k="Industry" v={industry} />
            <Row k="Catalog mode" v={mode === "order" ? "Direct Order (UPI QR)" : "Display Only"} />
            <Row k="Location" v={`${lat.toFixed(4)}, ${lng.toFixed(4)}`} />
          </dl>
          <div className="rounded-lg border border-gold/40 bg-secondary/40 p-5">
            <p className="text-2xl font-black text-gold-gradient">₹500 / month</p>
            <p className="text-xs text-muted-foreground">
              <Lock className="mr-1 inline size-3" /> Early bird lifetime lock — your rate never moves to
              ₹1,500/mo.
            </p>
          </div>
          {paid ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-gold/40 p-5 text-center">
                <BadgeCheck className="mx-auto size-8 text-gold" />
                <p className="mt-2 font-bold">{live ? "Storefront provisioned" : "Payment received"}</p>
                <p className="text-sm text-muted-foreground">
                  {live ? (
                    <>
                      <a
                        className="text-gold hover:underline"
                        href={`https://${slug}.${siteConfig.domain}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {slug}.{siteConfig.domain}
                      </a>{" "}
                      is live and listed in the local buyer directory.
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Activating {slug}.{siteConfig.domain}… this
                      takes a few seconds.
                    </span>
                  )}
                </p>
              </div>
              {mode === "order" && shopId && <UpiSetup shopId={shopId} />}
              <Button asChild className="w-full" size="lg">
                <Link href="/dashboard">Add your items &amp; photos →</Link>
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" disabled={paying} onClick={() => setStep(3)}>
                Back
              </Button>
              <Button disabled={paying} onClick={() => void pay()}>
                {paying ? "Opening checkout…" : "Pay ₹500 with Razorpay"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/60 pb-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-4 text-left ${active ? "border-gold bg-secondary/50" : "border-border"}`}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </button>
  );
}

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="flex flex-wrap gap-3 text-xs">
      {labels.map((l, i) => (
        <li
          key={l}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
            step === i + 1 ? "border-gold text-gold" : "border-border text-muted-foreground"
          }`}
        >
          <span className="font-bold">{i + 1}</span> {l}
        </li>
      ))}
    </ol>
  );
}
