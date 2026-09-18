import Link from "next/link";

import { Wordmark } from "@/components/Logo";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="relative mt-20 border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-5 text-center md:flex-row md:gap-8 md:text-left">
        <Wordmark />
        <p className="min-w-0 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground md:mx-auto">
          © {new Date().getFullYear()} {siteConfig.siteName}. All rights reserved. {siteConfig.domain} is a
          digital property wholly owned and operated by{" "}
          <span className="whitespace-nowrap font-medium text-foreground">{siteConfig.legalEntity}</span>.
        </p>
        <nav className="flex shrink-0 gap-4 text-xs font-medium text-muted-foreground">
          <Link href="/terms" className="hover:text-primary">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-primary">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
