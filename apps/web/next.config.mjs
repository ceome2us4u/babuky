// Keep in sync with siteConfig.domain (src/config/site.ts) — this file is
// plain ESM and can't import the TS config.
const ROOT_DOMAIN = "babuki.com";

// slug.babuki.com -> /store/slug. Nginx forwards every *.babuki.com host here
// with the Host header intact (infra/nginx/babuki.conf). `www` and `api` are
// excluded (api is served by its own upstream anyway); `.localhost` makes it
// work in dev (http://sharma.localhost:3000).
//
// This is a config rewrite, not middleware, on purpose: behind Nginx the
// request carries X-Forwarded-Proto: https, and a middleware rewrite built
// from req.nextUrl becomes https://localhost:3000/... — which Next treats as
// an external URL and tries to proxy over TLS to its own plain-HTTP port
// (EPROTO -> 500 in production). Config rewrites are always internal.
//
// `beforeFiles` so it wins over the marketing pages for "/"; static assets
// are excluded by the lookahead so images/chunks still load on a vendor host.
// The lookahead must test for the *label* "www."/"api." — a `$` here would
// anchor the end of the whole hostname and never match.
const SLUG = "(?<slug>(?!(?:www|api)\\.)[a-z0-9-]{3,24})";
const hostMatchers = [
  { type: "host", value: `${SLUG}\\.${ROOT_DOMAIN.replace(/\./g, "\\.")}` },
  { type: "host", value: `${SLUG}\\.localhost` },
];
const NOT_ASSETS = "(?!_next/|brand/|favicon\\.png$|robots\\.txt$).+";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output runs unchanged on ECS/Fargate, App Runner, or EC2 —
  // no Vercel-specific build target.
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: hostMatchers.flatMap((has) => [
        { source: "/", has: [has], destination: "/store/:slug" },
        { source: `/:path(${NOT_ASSETS})`, has: [has], destination: "/store/:slug" },
      ]),
    };
  },
};

export default nextConfig;
