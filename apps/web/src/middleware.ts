import { NextResponse, type NextRequest } from "next/server";

import { siteConfig } from "@/config/site";

// slug.babuki.com -> /store/slug. Nginx forwards every *.babuki.com host to
// this app with the Host header intact (infra/nginx/babuki.conf), so the
// vendor's subdomain is resolved here rather than by per-vendor DNS/config.
// The apex, www and api are left alone; `.localhost` works for local dev
// (http://sharma.localhost:3000).
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();

  let sub: string | null = null;
  if (host.endsWith(`.${siteConfig.domain}`)) sub = host.slice(0, -(siteConfig.domain.length + 1));
  else if (host.endsWith(".localhost")) sub = host.slice(0, -".localhost".length);

  if (!sub || sub === "www" || sub === "api" || !/^[a-z0-9-]{3,24}$/.test(sub)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = `/store/${sub}`;
  return NextResponse.rewrite(url);
}

// Skip Next internals and static assets so images/fonts/chunks still load on
// a vendor subdomain.
export const config = {
  matcher: ["/((?!_next/|brand/|favicon\\.png|robots\\.txt|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js|map)$).*)"],
};
