import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: `${siteConfig.siteName} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  authors: [{ name: siteConfig.legalEntity }],
  icons: { icon: "/favicon.png" },
  openGraph: { type: "website", title: `${siteConfig.siteName} — ${siteConfig.tagline}` },
};

// Root layout: <html>, fonts, providers only. The marketing chrome (navbar +
// footer) lives in the (site) route group; vendor storefronts (store/[slug],
// reached via slug.babuki.com) get their own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
