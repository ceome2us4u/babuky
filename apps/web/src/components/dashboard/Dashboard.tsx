"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, LogIn, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogManager } from "@/components/dashboard/CatalogManager";
import { UpiSetup } from "@/components/shops/UpiSetup";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiPost } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { siteConfig } from "@/config/site";

export type MyShop = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  mode: "display" | "order";
  status: "draft" | "active" | "suspended";
  address_text: string;
  upi_id: string | null;
  verified_merchant_name: string | null;
  is_upi_verified: boolean;
  subscription_status: "pending" | "active" | "past_due" | "cancelled" | null;
};

const STATUS_LABEL: Record<MyShop["status"], string> = {
  draft: "Not published",
  active: "Live",
  suspended: "Suspended",
};

export function Dashboard() {
  const { user, loading, requestLogin } = useAuth();
  const [shops, setShops] = useState<MyShop[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ shops: MyShop[] }>("/shops/mine");
      setShops(res.shops);
      setSelectedId((cur) => cur ?? res.shops[0]?.id ?? null);
    } catch {
      setShops([]);
    }
  }, []);

  useEffect(() => {
    if (user?.profile) void load();
  }, [user, load]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const shop = shops?.find((s) => s.id === selectedId) ?? null;

  // Subscribing (or renewing a lapsed shop): the payment webhook flips the
  // shop to 'active', so poll for it after Checkout succeeds.
  const subscribe = async (s: MyShop) => {
    setPaying(true);
    try {
      const { subscription, keyId } = await apiPost<{ subscription: { id: string }; keyId: string }>(
        `/shops/${s.id}/subscribe`,
        {},
      );
      await openRazorpayCheckout({
        keyId,
        subscriptionId: subscription.id,
        description: `${s.slug}.${siteConfig.domain} · ₹500/month`,
        prefill: { name: user?.profile?.fullName, email: user?.profile?.email, contact: user?.phone },
        onSuccess: () => {
          toast.success("Payment received — publishing your storefront…");
          let tries = 0;
          pollRef.current = setInterval(async () => {
            tries += 1;
            await load();
            if (tries >= 20 && pollRef.current) clearInterval(pollRef.current);
          }, 3000);
          setPaying(false);
        },
        onDismiss: () => setPaying(false),
      });
    } catch (e) {
      setPaying(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start the payment");
    }
  };

  // Stop polling once the shop is live.
  useEffect(() => {
    if (shop?.status === "active" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [shop?.status]);

  if (loading || (user?.profile && shops === null)) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted-foreground">
        <Loader2 className="mx-auto size-6 animate-spin" />
      </div>
    );
  }

  if (!user?.profile) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="panel rounded-xl p-10 text-center">
          <Store className="mx-auto size-8 text-gold" />
          <h1 className="mt-4 text-2xl font-bold">Manage your storefront</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Sign in with the mobile number you used to create your shop.
          </p>
          <Button className="mt-6" size="lg" onClick={() => requestLogin("MERCHANT")}>
            <LogIn className="size-4" /> Login
          </Button>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="panel rounded-xl p-10 text-center">
          <Store className="mx-auto size-8 text-gold" />
          <h1 className="mt-4 text-2xl font-bold">You don&apos;t have a storefront yet</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Claim your <span className="font-mono text-foreground">[yourshop].{siteConfig.domain}</span> subdomain and
            list your items in a few minutes.
          </p>
          <Button asChild className="mt-6" size="lg">
            <Link href="/shops">Get your online shop (₹500/mo)</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {shops && shops.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {shops.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                s.id === shop.id ? "border-gold bg-secondary text-burgundy" : "border-border text-muted-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <header className="panel mb-6 flex flex-col gap-4 rounded-xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={shop.status === "active" ? "" : "border-destructive/30 text-destructive"}>
              <span className={`size-1.5 rounded-full ${shop.status === "active" ? "bg-gold" : "bg-destructive"}`} />
              {STATUS_LABEL[shop.status]}
            </Badge>
            <Badge className="bg-muted text-muted-foreground">
              {shop.mode === "order" ? "Direct Order" : "Display Only"}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-black md:text-3xl">{shop.name}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {shop.slug}.{siteConfig.domain}
          </p>
        </div>
        {shop.status === "active" && (
          <Button asChild variant="outline">
            <a href={`https://${shop.slug}.${siteConfig.domain}`} target="_blank" rel="noreferrer">
              View storefront <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
      </header>

      {shop.status !== "active" && (
        <div className="panel mb-6 flex flex-col gap-3 rounded-xl border-gold/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {shop.status === "suspended"
              ? "Your subscription lapsed, so your storefront is offline. Your catalog is safe — renew to publish it again."
              : "Your storefront isn't public yet. You can build your catalog now; it goes live as soon as your ₹500/month subscription is active."}
          </p>
          <Button disabled={paying} onClick={() => void subscribe(shop)} className="shrink-0">
            {paying ? "Opening checkout…" : shop.status === "suspended" ? "Renew subscription" : "Pay ₹500 & publish"}
          </Button>
        </div>
      )}

      <Tabs defaultValue="catalog">
        <TabsList className="mb-6">
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog">
          <CatalogManager key={shop.id} shopId={shop.id} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsPanel shop={shop} onChanged={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentsPanel({ shop, onChanged }: { shop: MyShop; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const setMode = async (mode: MyShop["mode"]) => {
    if (mode === shop.mode) return;
    setBusy(true);
    try {
      await apiFetch(`/shops/${shop.id}`, { method: "PATCH", body: JSON.stringify({ mode }) });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the mode");
    } finally {
      setBusy(false);
    }
  };

  const modes = [
    { id: "display", title: "Display Only", desc: "Showcase your catalog. Buyers call or WhatsApp you to order." },
    { id: "order", title: "Direct Order", desc: "Buyers pay you directly via a UPI QR built from your verified UPI ID." },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {modes.map((m) => (
          <button
            key={m.id}
            disabled={busy}
            onClick={() => void setMode(m.id)}
            className={`rounded-lg border p-4 text-left ${shop.mode === m.id ? "border-gold bg-secondary/50" : "border-border"}`}
          >
            <p className="font-semibold">{m.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
          </button>
        ))}
      </div>
      {shop.mode === "order" ? (
        <UpiSetup
          key={`${shop.id}-${shop.upi_id ?? ""}`}
          shopId={shop.id}
          verifiedName={shop.is_upi_verified ? shop.verified_merchant_name : null}
          verifiedUpiId={shop.is_upi_verified ? shop.upi_id : null}
          onVerified={() => void onChanged()}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Payments go straight from buyer to you over UPI — 0% commission, and Babuki never touches the money.
          Switch to Direct Order to add your UPI ID.
        </p>
      )}
    </div>
  );
}
