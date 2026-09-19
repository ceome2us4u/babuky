"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { siteConfig } from "@/config/site";

export type DomainState = {
  domain: string;
  status: "held" | "registering" | "dns_pending" | "cert_pending" | "active" | "grace" | "released" | "failed";
  graceUntil: string | null;
};

// Where each backend status sits on the merchant's timeline.
const STAGE: Record<DomainState["status"], number> = {
  held: 0,
  registering: 1,
  dns_pending: 2,
  cert_pending: 3,
  active: 4,
  grace: 4,
  released: 0,
  failed: 0,
};

/** Polls GET /shops/:id/domain every few seconds while the address is being set up. */
export function useShopDomain(shopId: string | null, enabled = true) {
  const [state, setState] = useState<DomainState | null>(null);
  useEffect(() => {
    if (!shopId || !enabled) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { domain } = await apiFetch<{ domain: DomainState | null }>(`/shops/${shopId}/domain`);
        if (stop) return;
        setState(domain);
        if (domain && ["active", "grace", "failed", "released"].includes(domain.status)) return;
      } catch {
        /* keep trying */
      }
      if (!stop) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [shopId, enabled]);
  return state;
}

/** After paying for the own web address plan: the shop is open, the address follows. */
export function DomainProgress({ state, slug, shopLive }: { state: DomainState | null; slug: string; shopLive: boolean }) {
  const domain = state?.domain ?? "your web address";
  const stage = state ? STAGE[state.status] : 0;
  const steps = [
    { t: "Payment received", done: true },
    { t: "Your shop is open", sub: `${slug}.${siteConfig.domain}`, done: shopLive },
    { t: "Registering your web address", sub: domain, done: stage > 1 },
    { t: "Connecting it to your shop", done: stage > 2 },
    { t: "Making it secure (https)", done: stage > 3 },
    { t: "Your own address is live", sub: domain, done: stage >= 4 },
  ];
  const current = steps.findIndex((s) => !s.done);

  if (state?.status === "failed") {
    return (
      <p className="rounded-lg border border-destructive/30 p-4 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{state.domain}</span> was taken by someone else before we could
        register it. Your shop is open at {slug}.{siteConfig.domain} — pick another web address from your dashboard and
        we&apos;ll set it up at no extra cost.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.t} className="flex items-start gap-3 text-sm">
          <span
            className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${
              s.done
                ? "border-emerald-700 bg-emerald-700 text-white"
                : i === current
                  ? "border-gold text-gold"
                  : "border-border text-muted-foreground"
            }`}
          >
            {s.done ? <Check className="size-3.5" /> : i === current ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
          </span>
          <span className={s.done || i === current ? "" : "text-muted-foreground"}>
            {s.t}
            {s.sub && <span className="block text-xs text-muted-foreground">{s.sub}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
