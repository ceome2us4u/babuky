import { query } from "./db.js";

// Shops on the "own web address" plan are served at their own domain
// (sreeram.in), and that page calls this API from a browser — so CORS must
// trust those origins too. They can't be a static list, and isAllowedOrigin
// is synchronous, so the live set is loaded from the database and refreshed
// every minute. Only domains that are actually being served count.

let live = new Set<string>();

async function refresh() {
  try {
    const { rows } = await query<{ domain: string }>(
      "SELECT domain FROM shop_domains WHERE status IN ('active', 'grace')",
    );
    const next = new Set<string>();
    for (const r of rows) {
      next.add(r.domain);
      next.add(`www.${r.domain}`);
    }
    live = next;
  } catch (e) {
    console.error("[custom-domains] refresh failed:", e);
  }
}

export const isLiveCustomDomain = (hostname: string) => live.has(hostname);

export function startCustomDomainRefresh() {
  void refresh();
  setInterval(() => void refresh(), 60_000);
}
