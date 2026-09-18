// Single source of truth for brand/contact/services copy.
// Edit here — every page and component reads from this file, nothing is
// hardcoded elsewhere. Domain spelling/contact info are placeholders until
// Google Workspace and the domain transfer (post 2026-11-16) are finalized.

export type ServiceItem = {
  slug: string;
  name: string;
  summary: string;
  description: string;
};

export const siteConfig = {
  siteName: "Babuky",
  domain: "babuki.com",
  tagline: "Your B2B software delivery partner.",
  description:
    "Babuky builds and runs SaaS products and custom software for other companies, acting as their software services team.",

  services: [
    {
      slug: "saas-product-engineering",
      name: "SaaS & Product Engineering",
      summary: "We design, build, and operate SaaS products on your behalf.",
      description:
        "From greenfield product builds to owning an existing SaaS codebase, we act as your product engineering team — architecture, delivery, and ongoing iteration.",
    },
    {
      slug: "custom-software-development",
      name: "Custom Software Development",
      summary: "Bespoke internal tools and platforms built end-to-end.",
      description:
        "We scope, design, and deliver custom software tailored to your company's workflows — from internal tools to customer-facing platforms.",
    },
  ] satisfies ServiceItem[],

  // TODO: fill in once Google Workspace is set up.
  contact: {
    email: null as string | null,
    phone: null as string | null,
  },

  socialLinks: [] as { label: string; href: string }[],
};

export type SiteConfig = typeof siteConfig;
