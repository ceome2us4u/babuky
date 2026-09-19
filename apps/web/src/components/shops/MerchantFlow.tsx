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
import { IndustryPicker } from "@/components/shops/IndustryPicker";
import { customIndustryError, industryValue } from "@/lib/industries";
import { useFeatures } from "@/lib/features";
import { PLAN_PRICE, PlanChoice, type Plan } from "@/components/shops/PlanChoice";
import { DomainSearch } from "@/components/shops/DomainSearch";
import { DomainProgress, useShopDomain } from "@/components/shops/DomainProgress";

// Default map centre (Bengaluru) until the vendor moves the pin.
export const BASE: [number, number] = [12.9716, 77.5946];

type MyShop = { id: string; slug: string; status: "draft" | "active" | "suspended" };

export function MerchantFlow() {
  const { user, requestLogin } = useAuth();
  // The ₹1,500 own web address plan exists only while the API's switch is on;
  // off (or not known yet) = exactly the ₹500 subdomain flow.
  const { ownDomain } = useFeatures();
  const [planPick, setPlanPick] = useState<Plan | null>(null);
  const plan: Plan = ownDomain ? (planPick ?? "premium") : "standard";
  const premium = plan === "premium";
  const [domain, setDomain] = useState<string | null>(null);
  const [domainSlug, setDomainSlug] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(1);

  const [slug, setSlug] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  // Why it is (un)available: the person's own unfinished shop, a reserved name, or someone else's.
  const [availNote, setAvailNote] = useState<"yours" | "reserved" | "taken" | null>(null);

  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  // "" until they pick; OTHER_INDUSTRY opens a box to describe the business.
  const [industrySel, setIndustrySel] = useState("");
  const [industryCustom, setIndustryCustom] = useState("");
  const industry = industryValue(industrySel, industryCustom);
  const [mode, setMode] = useState<"display" | "order">("display");

  const [lat, setLat] = useState(BASE[0]);
  const [lng, setLng] = useState(BASE[1]);
  const [address, setAddress] = useState("Move the pin to fetch the address…");

  const [shopId, setShopId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [live, setLive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const domainState = useShopDomain(shopId, paid && premium);
  // The shop's babuki.com address: typed (Starter) or derived from the domain name (own web address).
  const shopSlug = premium ? (domainSlug ?? "") : slug;
  const price = PLAN_PRICE[plan].toLocaleString("en-IN");

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
        const res = await apiFetch<{ available: boolean; yours?: boolean; reason?: string }>(
          `/shops/slug-available?slug=${encodeURIComponent(slug)}`,
        );
        if (!stale) {
          setAvailable(res.available);
          setAvailNote(res.yours ? "yours" : res.reason === "reserved" ? "reserved" : res.available ? null : "taken");
        }
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
          slug: shopSlug,
          ...(premium ? { plan, domain } : {}),
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
      const { subscription, keyId } = await apiPost<{ subscription: { id: string }; keyId: string }>(
        `/shops/${id}/subscribe`,
        {},
      );
      await openRazorpayCheckout({
        keyId,
        subscriptionId: subscription.id,
        description: premium
          ? `${domain} · ₹${price}/month, locked for life`
          : `${slug}.${siteConfig.domain} · ₹500/month, locked for life`,
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
        toast.error(premium ? e.message : "That subdomain was just taken — pick another");
        if (premium) setDomain(null);
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
        <h2 className="mt-4 text-2xl font-bold">Set up your online shop in 4 easy steps</h2>
        <ol className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          {[
            "Pick your web address",
            "Add your shop details",
            "Mark your place on the map",
            ownDomain ? "Pay monthly & go live" : "Pay ₹500/month & go live",
          ].map(
            (s, i) => (
              <li key={s} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-secondary text-[11px] font-bold text-burgundy">
                  {i + 1}
                </span>
                {s}
              </li>
            ),
          )}
        </ol>
        <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">
          First, confirm your mobile number — it takes a minute. It&apos;s how you&apos;ll sign in, and how we reach you if
          you need help.
        </p>
        <Button className="mt-6" size="lg" onClick={() => requestLogin("MERCHANT", () => setStarted(true))}>
          Start setting up my shop
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} labels={[ownDomain ? "Web address" : "Subdomain", "Store & catalog", "Location", "Checkout"]} />

      {step === 1 && ownDomain && (
        <div className="panel space-y-5 rounded-xl p-5 sm:p-8">
          <div>
            <h3 className="text-lg font-bold">Step 1 — Choose your web address</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick how customers will find your shop online. You can upgrade later.
            </p>
          </div>
          <PlanChoice plan={plan} onPlan={setPlanPick} />
          {premium ? (
            <DomainSearch selected={domain} onSelect={setDomain} onSlug={setDomainSlug} showBabukiAddress />
          ) : (
            <SlugField slug={slug} setSlug={setSlug} checking={checking} available={available} availNote={availNote} />
          )}
          <Button
            disabled={premium ? !domain || !domainSlug : available !== true}
            onClick={() => setStep(2)}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 1 && !ownDomain && (
        <div className="panel space-y-4 rounded-xl p-8">
          <h3 className="text-lg font-bold">Step 1 — Claim your subdomain</h3>
          <SlugField slug={slug} setSlug={setSlug} checking={checking} available={available} availNote={availNote} />
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
            <IndustryPicker
              selected={industrySel}
              onSelected={setIndustrySel}
              custom={industryCustom}
              onCustom={setIndustryCustom}
            />
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
              desc="Buyers place orders and pay you directly via a UPI QR built from your UPI ID."
            />
          </div>
          {mode === "order" && (
            <p className="rounded-md border border-dashed border-gold/40 p-4 text-sm text-muted-foreground">
              You&apos;ll add your UPI ID and check it with your own UPI app right after checkout. Payments go straight from the
              buyer to your bank account — 0% commission, and Babuki never touches the money.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={
                shopName.trim().length < 2 ||
                ownerName.trim().length < 2 ||
                !!nameError(ownerName) ||
                industry.length < 2 ||
                !!customIndustryError(industryCustom)
              }
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
            {premium ? (
              <>
                <Row k="Plan" v="Your own web address" />
                <Row k="Web address" v={domain ?? ""} />
                <Row k="Also works at" v={`${shopSlug}.${siteConfig.domain}`} />
              </>
            ) : (
              <Row k="Storefront" v={`${slug}.${siteConfig.domain}`} />
            )}
            <Row k="Store name" v={shopName} />
            <Row k="Owner" v={ownerName} />
            <Row k="Contact" v={user.phone} />
            <Row k="Industry" v={industry} />
            <Row k="Catalog mode" v={mode === "order" ? "Direct Order (UPI QR)" : "Display Only"} />
            <Row k="Location" v={`${lat.toFixed(4)}, ${lng.toFixed(4)}`} />
          </dl>
          <div className="rounded-lg border border-gold/40 bg-secondary/40 p-5">
            <p className="text-2xl font-black text-gold-gradient">₹{price} / month</p>
            {ownDomain ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {premium && "Includes your own web address, its yearly renewal and secure (https) setup. No other charges. "}
                  <Lock className="mr-1 inline size-3" /> Early bird lifetime lock — your rate never goes up.
                </p>
                {!paid && (
                  <button
                    className="mt-2 text-xs font-medium text-burgundy underline"
                    onClick={() => {
                      // A draft made on the other plan is updated (or replaced) on the next Pay.
                      setShopId(null);
                      if (premium) {
                        setPlanPick("standard");
                        setSlug((s) => s || shopSlug);
                      } else {
                        setPlanPick("premium");
                      }
                      setStep(1);
                    }}
                  >
                    {premium ? "Switch to the ₹500 Babuki address instead" : "Want your own .in or .com? Upgrade for ₹1,500/month"}
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Lock className="mr-1 inline size-3" /> Early bird lifetime lock — your rate never moves to
                ₹1,500/mo.
              </p>
            )}
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
                        href={`https://${shopSlug}.${siteConfig.domain}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shopSlug}.{siteConfig.domain}
                      </a>{" "}
                      is live and listed in the local buyer directory.
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Activating {shopSlug}.{siteConfig.domain}… this
                      takes a few seconds.
                    </span>
                  )}
                </p>
                {premium && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your own address <span className="font-semibold text-foreground">{domain}</span> usually follows within
                    30 minutes. You can close this page — you&apos;ll see its progress on your dashboard.
                  </p>
                )}
              </div>
              {premium && (
                <div className="rounded-lg border border-border p-5">
                  <DomainProgress state={domainState} slug={shopSlug} shopLive={live} />
                </div>
              )}
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
                {paying ? "Opening checkout…" : `Pay ₹${price} with Razorpay`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The yourshop.babuki.com box (Starter plan, and the whole Step 1 while the own-domain feature is off). */
function SlugField({
  slug,
  setSlug,
  checking,
  available,
  availNote,
}: {
  slug: string;
  setSlug: (s: string) => void;
  checking: boolean;
  available: boolean | null;
  availNote: "yours" | "reserved" | "taken" | null;
}) {
  return (
    <>
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
            <Check className="size-4" />{" "}
            {availNote === "yours"
              ? `${slug}.${siteConfig.domain} is your unfinished shop — carry on with it`
              : `${slug}.${siteConfig.domain} is available`}
          </span>
        )}
        {!checking && available === false && (
          <span className="flex items-center gap-2 text-destructive">
            <X className="size-4" />{" "}
            {slugError(slug) ??
              (availNote === "reserved" ? "That name is reserved — try another name" : "Already taken — try another name")}
          </span>
        )}
      </div>
    </>
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
