import { Wordmark } from "@/components/Logo";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="relative mt-20 border-t border-border bg-card">
      <div className="flex w-full flex-col items-center gap-4 px-6 py-5 text-center md:flex-row md:gap-8 md:py-4 md:pr-32 md:text-left">
        <Wordmark />
        <p className="min-w-0 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground md:mx-auto">
          © {new Date().getFullYear()} {siteConfig.siteName}. All rights reserved. {siteConfig.domain} is a
          digital property wholly owned and operated by{" "}
          <span className="whitespace-nowrap font-medium text-foreground">Me2Us4U OPC Private Limited</span>.
        </p>
      </div>

      {/* Dedicated right-corner container: flush to the right edge, stacked on mobile,
          pinned across the full footer height on desktop. */}
      <div className="flex justify-end md:absolute md:inset-y-0 md:right-0 md:items-stretch">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/me2us-logo.jpg"
          alt="Me2Us4U"
          className="h-11 w-auto object-contain object-right md:h-full md:w-auto"
        />
      </div>
    </footer>
  );
}
