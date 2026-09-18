import { Logo } from "@/components/Logo";
import { siteConfig } from "@/config/site";

// Chrome for a vendor storefront (slug.babuki.com): deliberately light, so the
// page is the vendor's, with Babuki as the platform underneath — not the
// marketing navbar/footer.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const home = `https://${siteConfig.domain}`;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <a href={home} aria-label="Babuki">
            <Logo />
          </a>
          <a href={`${home}/shops`} className="text-xs font-medium text-gold hover:underline">
            Get your own online shop →
          </a>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-card px-6 py-5 text-center text-xs leading-relaxed text-muted-foreground">
        <p className="mx-auto max-w-3xl">
          This storefront is run by an independent vendor. {siteConfig.siteName} is an intermediary platform
          under Section 79 of the Indian IT Act: it does not verify goods, handle payments, or manage
          delivery — every transaction is strictly between you and the vendor.{" "}
          <a href={`${home}/terms`} className="text-gold hover:underline">
            Terms
          </a>
        </p>
      </footer>
    </div>
  );
}
