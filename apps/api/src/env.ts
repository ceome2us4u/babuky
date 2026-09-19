import { isLiveCustomDomain } from "./lib/custom-domains.js";

export const env = {
  port: Number(process.env.PORT ?? 8000),
};

// babuki.com (the main site) AND every vendor subdomain (slug.babuki.com)
// call this API — can't enumerate the wildcard subdomains as a static list,
// so this matches the pattern instead of a fixed origin list. Shops on the
// "own web address" plan are served at their own domain too (lib/custom-domains.ts).
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:" && !(hostname === "localhost" && protocol === "http:")) return false;
    return (
      hostname === "babuki.com" ||
      hostname.endsWith(".babuki.com") ||
      hostname === "localhost" ||
      isLiveCustomDomain(hostname)
    );
  } catch {
    return false;
  }
}
