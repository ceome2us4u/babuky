import { siteConfig } from "@/config/site";

/**
 * The address of a shop's own store page (slug.babuki.com) — where the buyer
 * can browse the items, fill a basket and pay by UPI. On a developer machine
 * (anything ending in "localhost") it stays on localhost so links can be tested.
 */
export function storeUrl(slug: string): string {
  if (typeof window !== "undefined" && window.location.hostname.endsWith("localhost")) {
    const { protocol, port } = window.location;
    return `${protocol}//${slug}.localhost${port ? `:${port}` : ""}`;
  }
  return `https://${slug}.${siteConfig.domain}`;
}
