"use client";

import { useEffect, useState } from "react";
import { Search, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MerchantFlow } from "@/components/shops/MerchantFlow";
import { BuyerFlow } from "@/components/shops/BuyerFlow";

// "/shops#find" (the Home page's "Find shops near me" button) opens the buyer tab.
const FIND_HASH = "#find";

export function ShopsView() {
  const [tab, setTab] = useState("merchant");

  useEffect(() => {
    const fromHash = () => setTab(window.location.hash === FIND_HASH ? "buyer" : "merchant");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const changeTab = (next: string) => {
    setTab(next);
    // Keep the address in step so the Find tab can be linked to and survives a refresh.
    window.history.replaceState(null, "", next === "buyer" ? `/shops${FIND_HASH}` : "/shops");
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="panel mb-8 flex flex-col gap-4 rounded-lg border-gold/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-bold text-gold-gradient">Early Bird Special: Lock in ₹500/month for LIFE</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Join before our native mobile apps launch. Future vendors pay ₹1,500/mo, but early partners
            stay locked at ₹500/mo forever.
          </p>
        </div>
        <Badge className="shrink-0">
          <span className="size-1.5 rounded-full bg-gold" />
          Limited window
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="mb-8">
          {/* explicit gap: in a flex row the space between icon and label collapses */}
          <TabsTrigger value="merchant" className="gap-2">
            <Store className="size-4" /> I own a shop
          </TabsTrigger>
          <TabsTrigger value="buyer" className="gap-2">
            <Search className="size-4" /> Find shops
          </TabsTrigger>
        </TabsList>
        <TabsContent value="merchant">
          <MerchantFlow />
        </TabsContent>
        <TabsContent value="buyer">
          <BuyerFlow />
        </TabsContent>
      </Tabs>
    </div>
  );
}
