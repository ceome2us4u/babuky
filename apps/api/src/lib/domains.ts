import { query } from "./db.js";
import { registrar, type CheckResult } from "./registrar.js";
import { findSlugHolder } from "./slug-hold.js";
import { isSlug } from "./validation.js";

// Rules for the "own web address" plan. Every number and list here is a
// SETTING in the API's env (kept across deploys, changed with
// scripts/set-own-domain.sh set KEY VALUE <host>) — not code:
//
//   DOMAIN_PRICE_CAP_USD    14      first-year AND renewal must both fit
//   DOMAIN_TLDS_OFFERED     .com,.in,.co.in,.net,.org   (can be picked, in the plan)
//   DOMAIN_TLDS_ON_REQUEST  .shop,.online,.io          (always shown, price on request)
//   DOMAIN_IN_LIMIT         90      .in-family names we register before
//                                   they turn "On request" (NIXI asks companies
//                                   to get approval above 100 .in domains)
//
// Why a fixed list and not "any ending under the cap": ~100 endings pass the
// price test, most of them odd (.dogecoin) or spam-flagged (.top, .loan), and
// some can't legally be held by an Indian company (.de, .eu, .us, .com.au).

const list = (v: string | undefined, fallback: string) =>
  (v ?? fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^(\.[a-z]{2,24}){1,2}$/.test(s));

export const domainConfig = () => ({
  capCents: Math.round((Number(process.env.DOMAIN_PRICE_CAP_USD) || 14) * 100),
  offered: list(process.env.DOMAIN_TLDS_OFFERED, ".com,.in,.co.in,.net,.org"),
  onRequest: list(process.env.DOMAIN_TLDS_ON_REQUEST, ".shop,.online,.io"),
  inLimit: Number(process.env.DOMAIN_IN_LIMIT) || 90,
});

/** How long a chosen name is held for a merchant who hasn't paid yet. */
export const HOLD_MINUTES = 30;
/** How long a lapsed shop keeps its own address before it is let go. */
export const GRACE_DAYS = 30;

// A domain label: a-z0-9 with single inner hyphens, 3-40 chars (the registry
// allows 63; 40 keeps it typeable). The ending: one or two labels (.in, .co.in).
const LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENDING_RE = /^(\.[a-z]{2,24}){1,2}$/;
export const isDomainLabel = (s: string) => s.length >= 3 && s.length <= 40 && LABEL_RE.test(s);

/** "Sreeram Stores.SHOP " -> { label: "sreeramstores", ending: ".shop" }; null if it can't be a name. */
export function parseDomainQuery(raw: string): { label: string; ending: string | null } | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\s+/g, "");
  const dot = s.indexOf(".");
  const label = dot < 0 ? s : s.slice(0, dot);
  const ending = dot < 0 ? null : s.slice(dot);
  if (!isDomainLabel(label)) return null;
  if (ending !== null && !ENDING_RE.test(ending)) return null;
  return { label, ending };
}

/** A full domain we could sell: offered ending + valid label. */
export function isOfferedDomain(domain: string): boolean {
  const p = parseDomainQuery(domain);
  return !!p && !!p.ending && domainConfig().offered.includes(p.ending);
}

// Names that invite a trademark complaint. Babuki is the registrant, so a
// complaint (UDRP / INDRP) lands on Babuki — refuse the obvious ones outright.
const BRAND_WORDS = [
  "google", "gmail", "youtube", "facebook", "instagram", "whatsapp", "meta", "amazon", "flipkart", "myntra",
  "swiggy", "zomato", "paytm", "phonepe", "gpay", "razorpay", "apple", "iphone", "microsoft", "netflix",
  "tata", "reliance", "jio", "airtel", "infosys", "wipro", "hdfc", "icici", "sbi", "axis", "kotak",
  "nike", "adidas", "puma", "samsung", "xiaomi", "oneplus", "vivo", "oppo", "dominos", "mcdonalds", "kfc",
  "starbucks", "cocacola", "pepsi", "nestle", "amul", "britannia", "haldiram", "babuki", "babuky", "me2us4u",
  "gov", "govt", "police", "rbi", "uidai", "aadhaar", "irctc", "nic",
];
export const looksLikeBrand = (label: string) => BRAND_WORDS.some((w) => label.replace(/-/g, "").includes(w));

const IN_FAMILY = (ending: string) => ending === ".in" || ending.endsWith(".in");

export type SearchStatus = "available" | "on_request" | "taken" | "unknown";
/** reason (on_request only): "ending" = not an ending the plan includes; "name" = this particular name. */
export type SearchRow = { domain: string; status: SearchStatus; reason?: "ending" | "name" };

// Registrar answers are cached briefly: the search runs as someone types, and
// Porkbun allows ~200 name checks a minute for the whole account.
const cache = new Map<string, { at: number; result: CheckResult }>();
const CACHE_MS = 5 * 60_000;

async function checkCached(domains: string[]): Promise<Map<string, CheckResult>> {
  const now = Date.now();
  const out = new Map<string, CheckResult>();
  const missing: string[] = [];
  for (const d of domains) {
    const hit = cache.get(d);
    if (hit && now - hit.at < CACHE_MS) out.set(d, hit.result);
    else missing.push(d);
  }
  if (missing.length) {
    const fresh = await registrar().check(missing);
    for (const [d, r] of fresh) {
      cache.set(d, { at: now, result: r });
      out.set(d, r);
    }
    if (cache.size > 5000) for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k);
  }
  return out;
}

/** Fresh (uncached) answer for one name — used right before holding or buying it. */
export async function checkNow(domain: string): Promise<CheckResult | null> {
  cache.delete(domain);
  return (await checkCached([domain])).get(domain) ?? null;
}

/** Names another shop has claimed (a live hold, or any later stage). */
async function claimedByOthers(domains: string[], shopId: string | null): Promise<Set<string>> {
  const { rows } = await query<{ domain: string }>(
    `SELECT domain FROM shop_domains
      WHERE domain = ANY($1::text[])
        AND status NOT IN ('released', 'failed')
        AND NOT (status = 'held' AND held_until < now())
        AND ($2::uuid IS NULL OR shop_id <> $2::uuid)`,
    [domains, shopId],
  );
  return new Set(rows.map((r) => r.domain));
}

async function inFamilyCount(): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*) AS n FROM shop_domains
      WHERE status NOT IN ('held', 'released', 'failed') AND (domain LIKE '%.in')`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Is this registrar answer something the ₹1,500 plan includes? (Only for an offered ending.) */
export function fitsPlan(r: CheckResult, capCents = domainConfig().capCents): boolean {
  return !r.premium && Math.max(r.priceCents, r.regularCents, r.renewalCents) <= capCents;
}

/**
 * The search behind Step 1. Never returns prices: merchants see only
 * Available / On request / Taken (and "unknown" when the registry didn't answer).
 */
export async function searchDomains(label: string, ending: string | null, shopId: string | null): Promise<SearchRow[]> {
  const cfg = domainConfig();
  const endings = [...new Set([...(ending ? [ending] : []), ...cfg.offered, ...cfg.onRequest])];
  const domains = endings.map((e) => label + e);

  const [answers, claimed] = await Promise.all([checkCached(domains), claimedByOthers(domains, shopId)]);
  const needInCount = endings.some((e) => IN_FAMILY(e) && cfg.offered.includes(e));
  const inFull = needInCount ? (await inFamilyCount()) >= cfg.inLimit : false;
  const brand = looksLikeBrand(label);

  return endings.map((e) => {
    const domain = label + e;
    const r = answers.get(domain);
    if (!r) return { domain, status: "unknown" };
    if (!r.available || claimed.has(domain)) return { domain, status: "taken" };
    if (!cfg.offered.includes(e)) return { domain, status: "on_request", reason: "ending" };
    const inPlan = !brand && !(IN_FAMILY(e) && inFull) && fitsPlan(r, cfg.capCents);
    return inPlan ? { domain, status: "available" } : { domain, status: "on_request", reason: "name" };
  });
}

/**
 * A free web address at babuki.com for a premium shop, derived from its domain
 * label (the shop also works at <slug>.babuki.com). sreeram -> sreeram, then
 * sreeram2, sreeram3... Returns null if none of the first few are free.
 */
export async function suggestSlug(label: string, ownerPhone: string | null): Promise<string | null> {
  const base = label.slice(0, 22).replace(/-+$/, "");
  for (let i = 1; i <= 9; i += 1) {
    const slug = i === 1 ? base : `${base.slice(0, 22)}${i}`;
    if (!isSlug(slug)) continue;
    const holder = await findSlugHolder(slug);
    if (!holder || holder.abandoned || (ownerPhone && holder.owner_phone === ownerPhone && holder.status === "draft")) {
      return slug;
    }
  }
  return null;
}

/**
 * Holds `domain` for `shopId` (replacing any earlier choice for that shop).
 * Re-checks the registrar first. Returns an error sentence for the merchant, or null.
 */
export async function holdDomain(shopId: string, domain: string): Promise<string | null> {
  if (!isOfferedDomain(domain)) return "That web address isn't part of this plan. Pick one marked Available.";
  const p = parseDomainQuery(domain)!;
  const rows = await searchDomains(p.label, p.ending, shopId);
  const row = rows.find((r) => r.domain === domain);
  if (!row || row.status === "unknown") return "We couldn't check that web address just now. Please try again in a moment.";
  if (row.status !== "available") return "That web address is no longer available. Please pick another.";

  // Stale holds by others stop blocking; this shop's previous pick is let go.
  await query(
    `UPDATE shop_domains SET status = 'released', updated_at = now()
      WHERE status = 'held' AND ((domain = $1 AND held_until < now()) OR shop_id = $2)`,
    [domain, shopId],
  );
  try {
    await query(
      `INSERT INTO shop_domains (shop_id, domain, status, held_until)
       VALUES ($1, $2, 'held', now() + make_interval(mins => ${HOLD_MINUTES}))`,
      [shopId, domain],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return "That web address was just taken, or this shop already has one. Please pick another.";
    }
    throw error;
  }
  return null;
}

/** The shop's current (non-released) domain row, if any. */
export async function currentDomain(shopId: string) {
  const { rows } = await query<{
    id: string;
    domain: string;
    status: string;
    grace_until: string | null;
    expires_at: string | null;
  }>(
    `SELECT id, domain, status::text AS status, grace_until, expires_at FROM shop_domains
      WHERE shop_id = $1 AND status NOT IN ('released')
      ORDER BY created_at DESC LIMIT 1`,
    [shopId],
  );
  return rows[0] ?? null;
}
