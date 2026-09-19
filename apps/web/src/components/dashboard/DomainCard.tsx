"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DomainSearch } from "@/components/shops/DomainSearch";
import { DomainProgress, useShopDomain } from "@/components/shops/DomainProgress";
import { apiPost } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import type { MyShop } from "@/components/dashboard/Dashboard";

const SETTING_UP = ["registering", "dns_pending", "cert_pending"];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/**
 * The "Web address" card. For a shop on the own web address plan it always
 * shows (whatever the feature switch says — they pay for it). For a live ₹500
 * shop it offers the upgrade, but only while the feature is on.
 */
export function DomainCard({ shop, ownDomainOn, onChanged }: { shop: MyShop; ownDomainOn: boolean; onChanged: () => Promise<void> }) {
  const premium = shop.plan === "premium";
  const status = shop.own_domain_status;
  const settingUp = !!status && SETTING_UP.includes(status);
  const polled = useShopDomain(shop.id, premium && settingUp);

  if (!premium && !(ownDomainOn && shop.status === "active")) return null;

  if (!premium) return <UpgradeCard shop={shop} onChanged={onChanged} />;

  // Needs a (new) pick: never chosen, the hold lapsed, or it was lost at purchase time.
  if (!shop.own_domain || status === "held" || status === "failed") {
    if (status === "held" && shop.status === "draft") {
      return (
        <Card title="Web address" pill={["gold", "Held for you"]}>
          <Address>{shop.own_domain}</Address>
          <p>We&apos;ll register it as soon as your first payment goes through.</p>
        </Card>
      );
    }
    return <RepickCard shop={shop} ownDomainOn={ownDomainOn} onChanged={onChanged} />;
  }

  if (settingUp) {
    return (
      <Card title="Web address" pill={["gold", "Setting up"]}>
        <Address>{shop.own_domain}</Address>
        <p className="mb-3">
          Registering and securing your address — usually 10–30 minutes. Your shop is already open at {shop.slug}.
          {siteConfig.domain}.
        </p>
        <DomainProgress
          state={polled ?? { domain: shop.own_domain, status: status as "registering", graceUntil: null }}
          slug={shop.slug}
          shopLive={shop.status === "active"}
        />
      </Card>
    );
  }

  if (status === "grace") {
    return (
      <Card title="Web address" pill={["red", "Payment paused"]}>
        <Address>{shop.own_domain}</Address>
        <p>
          Your subscription has stopped, so your shop is offline. Renew by {fmt(shop.own_domain_grace_until)} to keep{" "}
          {shop.own_domain} — after that it is released.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Web address"
      pill={["green", "Live"]}
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(`https://${shop.own_domain}`);
              toast.success("Link copied");
            }}
          >
            <Copy className="size-4" /> Copy link
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`https://${shop.own_domain}`} target="_blank" rel="noreferrer">
              Open <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      }
    >
      <Address>{shop.own_domain}</Address>
      <p>
        Included in your ₹1,500/month plan and renewed automatically — nothing for you to do. Also works at {shop.slug}.
        {siteConfig.domain}.
      </p>
    </Card>
  );
}

function UpgradeCard({ shop, onChanged }: { shop: MyShop; onChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upgrade = async () => {
    if (!domain) return;
    setBusy(true);
    try {
      const { subscription, keyId } = await apiPost<{ subscription: { id: string }; keyId: string }>(
        `/shops/${shop.id}/upgrade`,
        { domain },
      );
      await openRazorpayCheckout({
        keyId,
        subscriptionId: subscription.id,
        description: `${domain} · ₹1,500/month, locked for life`,
        prefill: { name: user?.profile?.fullName, email: user?.profile?.email, contact: user?.phone },
        onSuccess: () => {
          toast.success(`Payment received — setting up ${domain}`);
          setBusy(false);
          setOpen(false);
          // The webhook moves the shop to the new plan; give it a moment.
          setTimeout(() => void onChanged(), 4000);
          setTimeout(() => void onChanged(), 12000);
        },
        onDismiss: () => setBusy(false),
      });
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start the upgrade");
    }
  };

  return (
    <Card
      title="Web address"
      pill={["gold", "₹500 plan"]}
      action={
        !open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Globe className="size-4" /> Get my own .in or .com
          </Button>
        )
      }
    >
      <Address>
        {shop.slug}.{siteConfig.domain}
      </Address>
      <p>
        Look more professional with your own address like {shop.slug}.in — ₹1,500/month, and we set it up for you. Your
        shop, items and orders stay exactly as they are.
      </p>
      {open && (
        <div className="mt-4 space-y-3">
          <DomainSearch shopId={shop.id} selected={domain} onSelect={setDomain} />
          <p className="text-xs text-muted-foreground">
            Your ₹500 subscription is cancelled automatically once the first ₹1,500 payment goes through — you&apos;re
            never charged for both.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button disabled={!domain || busy} onClick={() => void upgrade()}>
              {busy ? "Opening checkout…" : "Upgrade & pay ₹1,500"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RepickCard({ shop, ownDomainOn, onChanged }: { shop: MyShop; ownDomainOn: boolean; onChanged: () => Promise<void> }) {
  const [domain, setDomain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lost = shop.own_domain_status === "failed";

  const save = async () => {
    if (!domain) return;
    setBusy(true);
    try {
      await apiPost(`/shops/${shop.id}/domain`, { domain });
      toast.success(`${domain} is yours — setting it up`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that web address");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Web address" pill={["red", "Pick your address"]}>
      <p>
        {lost
          ? `${shop.own_domain} was taken by someone else before we could register it. Pick another — there's no extra cost.`
          : "Choose your shop's own web address — it's included in your plan."}{" "}
        Your shop works at {shop.slug}.{siteConfig.domain} meanwhile.
      </p>
      {ownDomainOn ? (
        <div className="mt-4 space-y-3">
          <DomainSearch shopId={shop.id} selected={domain} onSelect={setDomain} />
          <Button disabled={!domain || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Use this web address"}
          </Button>
        </div>
      ) : (
        <p className="mt-2">Please contact us and we&apos;ll set one up for you.</p>
      )}
    </Card>
  );
}

const PILL = {
  gold: "border-gold/50 bg-secondary text-burgundy",
  green: "border-emerald-300 bg-emerald-50 text-emerald-800",
  red: "border-red-300 bg-red-50 text-red-800",
} as const;

function Card({
  title,
  pill,
  action,
  children,
}: {
  title: string;
  pill: [keyof typeof PILL, string];
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel mb-6 rounded-xl p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 text-sm text-muted-foreground">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground">
            {title}
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PILL[pill[0]]}`}>{pill[1]}</span>
          </h2>
          {children}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}

function Address({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-2 break-all text-lg font-bold text-burgundy">{children}</p>;
}
