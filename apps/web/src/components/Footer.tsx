import { Wordmark } from "@/components/Logo";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-card">
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
        <a
          href={siteConfig.parentUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Me2Us4U — visit www.me2us4u.com"
          title="Visit www.me2us4u.com"
          className="flex transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/me2us-logo.jpg"
            alt="Me2Us4U"
            className="h-11 w-auto object-contain object-right md:h-full md:w-auto"
          />
        </a>
      </div>
    </footer>
  );
}
