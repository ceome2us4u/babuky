// Single source of truth for brand/contact/legal copy.
// Edit here — pages and components read from this file, nothing is
// hardcoded elsewhere. Contact details are placeholders until Google
// Workspace is set up; babuki.in / babuky.com join after the domain
// transfer (post 2026-11-16).

export const siteConfig = {
  siteName: "Babuki",
  domain: "babuki.com",
  legalEntity: "Me2Us4U (OPC) Private Limited",
  tagline: "The Complete Business Engine",
  description:
    "Babuki provisions hyperlocal shop storefronts at ₹500/month and scopes custom software projects. From Me2Us4U (OPC) Pvt Ltd.",

  // TODO: fill in once Google Workspace is set up.
  contact: {
    email: null as string | null,
    phone: null as string | null,
  },
};

export type SiteConfig = typeof siteConfig;
