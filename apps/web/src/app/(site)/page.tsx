import type { Metadata } from "next";
import Link from "next/link";
import {
  Store,
  Code2,
  MapPin,
  QrCode,
  ShieldCheck,
  Globe,
  Calculator,
  Wallet,
  ArrowRight,
  CircuitBoard,
  BadgeCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandBadge } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Babuki — The Complete Business Engine for Local Shops & Software Scaling",
  description:
    "Launch a hyperlocal storefront at ₹500/month or estimate a custom software project in minutes. Babuki, from Me2Us4U (OPC) Pvt Ltd.",
  openGraph: {
    title: "Babuki — The Complete Business Engine",
    description: "Hyperlocal shop provisioning at ₹500/month and a transparent software scope estimator.",
  },
};

export default function Home() {
  return (
    <div>
      {/* Hero + dual solutions — above the fold */}
      <section className="circuit-bg relative overflow-hidden border-b border-gold/15">
        <div className="mx-auto max-w-6xl px-6 pb-8 pt-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-secondary px-3.5 py-1 text-xs font-semibold uppercase text-burgundy">
              <CircuitBoard className="size-3.5" /> Dual solution platform
            </div>
            <h1 className="mx-auto max-w-4xl text-2xl font-black leading-tight md:text-3xl lg:text-4xl">
              The Complete Business Engine for{" "}
              <span className="text-gold-gradient">Local Shops &amp; Software Scaling</span>
            </h1>
            <p className="mx-auto mt-2.5 max-w-2xl text-sm text-muted-foreground md:text-base">
              One platform for neighbourhood businesses going digital and founders building serious
              software.
            </p>
          </div>

          {/* Two offerings — true side-by-side split from md up */}
          <div className="mt-6 grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
            <article className="panel flex flex-col rounded-lg p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-gold">
                  <Store className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-gold">For Local Shops &amp; Services</p>
                  <h2 className="text-lg font-bold md:text-xl">Get Your Shop Online</h2>
                </div>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-xs text-muted-foreground md:text-sm">
                <Feature
                  icon={Globe}
                  text={
                    <>
                      Custom <code className="font-mono text-foreground">[yourshop].babuki.com</code>{" "}
                      webpage in 2 minutes
                    </>
                  }
                />
                <Feature icon={MapPin} text="Map pin for neighbourhood customer footfall" />
                <Feature icon={QrCode} text="Direct UPI QR payments straight to bank with 0% commission" />
                <Feature icon={Wallet} text="₹500/month locked for life · No tech skills needed" />
              </ul>
              <Button asChild className="glow-gold mt-5 w-full">
                <Link href="/shops">Get Your Online Shop (₹500/mo)</Link>
              </Button>
            </article>

            <article className="panel flex flex-col rounded-lg p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-gold">
                  <Code2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-gold">For Tech &amp; Enterprises</p>
                  <h2 className="text-lg font-bold md:text-xl">Build Custom Software</h2>
                </div>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-xs text-muted-foreground md:text-sm">
                <Feature icon={Code2} text="Web apps, mobile apps, APIs & cloud engineering" />
                <Feature icon={Calculator} text="Live interactive scope, cost & timeline estimator" />
                <Feature icon={ShieldCheck} text="₹100 refundable commitment deposit credited to invoice" />
                <Feature icon={BadgeCheck} text="End-to-end delivery backed by Me2Us4U" />
              </ul>
              <Button asChild className="mt-5 w-full" variant="outline">
                <Link href="/estimator">
                  Estimate Your Software Project <ArrowRight className="size-4" />
                </Link>
              </Button>
            </article>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <div className="panel flex flex-col items-center gap-4 rounded-lg border-l-4 border-l-gold p-6 text-center sm:flex-row sm:text-left">
          <BrandBadge className="size-12 shrink-0" />
          <p className="text-xs text-muted-foreground md:text-sm">
            Babuki operates as an intermediary platform under Section 79 of the Indian IT Act. We
            provision the storefront and the discovery layer — we do not verify goods quality, handle
            payments, or manage physical deliveries.{" "}
            <Link href="/terms" className="text-gold hover:underline">
              Read the contract &amp; terms center →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-gold" />
      <span>{text}</span>
    </li>
  );
}
