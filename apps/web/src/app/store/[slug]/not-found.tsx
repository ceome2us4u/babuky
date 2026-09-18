import { Store } from "lucide-react";

import { siteConfig } from "@/config/site";

export default function StoreNotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <Store className="mx-auto size-10 text-gold" />
      <h1 className="mt-4 text-2xl font-black">This storefront isn&apos;t live</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may not exist, or the vendor hasn&apos;t finished setting it up yet.
      </p>
      <a
        href={`https://${siteConfig.domain}/shops`}
        className="mt-6 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Find shops near you
      </a>
    </div>
  );
}
