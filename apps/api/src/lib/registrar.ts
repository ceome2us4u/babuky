import { isTestMode, pick } from "./mode.js";

// The domain registrar behind the "own web address" plan. Babuki registers
// the domains in ITS OWN Porkbun account (Babuki is the registrant) and pays
// from that account's prepaid USD credit — see docs/architecture.md.
//
// Which registrar runs follows APP_MODE, like every other mode-dependent thing:
//   LIVE  Porkbun with PORKBUN_API_KEY_LIVE / PORKBUN_SECRET_KEY_LIVE. Missing
//         keys fail closed (pick() throws) — nothing is ever bought by accident.
//   TEST  Porkbun's SANDBOX if PORKBUN_API_KEY_TEST is a sandbox key (pk1_sb_…,
//         fake credit), otherwise an in-memory fake. TEST can never buy a real
//         domain.

export type CheckResult = {
  available: boolean;
  premium: boolean;
  /** What registering it costs right now (may be a first-year promo), USD cents. */
  priceCents: number;
  /** The same without any promotion, USD cents. */
  regularCents: number;
  /** The yearly renewal price, USD cents. */
  renewalCents: number;
};

export interface Registrar {
  readonly name: string;
  /** Up to 25 names. A name the registry didn't answer for is simply missing from the map. */
  check(domains: string[]): Promise<Map<string, CheckResult>>;
  /** Our own record of the domain, or null if it isn't in our account. */
  owned(domain: string): Promise<{ expiresAt: Date | null } | null>;
  /** Buys it for exactly `costCents` (the registrar refuses if the price moved). */
  register(domain: string, costCents: number): Promise<void>;
  /** Root and www -> `ip` (A records), replacing the registrar's parking records. */
  pointAt(domain: string, ip: string): Promise<void>;
  setAutoRenew(domain: string, on: boolean): Promise<void>;
}

/** "11.08" / "2,060.25" -> cents. NaN-safe: anything unreadable counts as "too expensive". */
export function toCents(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : Number.MAX_SAFE_INTEGER;
}

// --- Porkbun ---------------------------------------------------------------

const PORKBUN = "https://api.porkbun.com/api/json/v3";

type PorkbunCheck = {
  avail?: string;
  premium?: string;
  price?: string;
  regularPrice?: string;
  additional?: { renewal?: { price?: string; regularPrice?: string } };
};

function porkbun(): Registrar {
  const auth = () => ({ apikey: pick("PORKBUN_API_KEY"), secretapikey: pick("PORKBUN_SECRET_KEY") });

  async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${PORKBUN}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth(), ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as { status?: string; message?: string; code?: string };
    if (!res.ok || data.status !== "SUCCESS") {
      const err = new Error(`Porkbun ${path.split("/").slice(0, 3).join("/")} failed: ${res.status} ${data.code ?? ""} ${data.message ?? ""}`.trim());
      (err as Error & { httpStatus?: number; code?: string }).httpStatus = res.status;
      (err as Error & { code?: string }).code = data.code;
      throw err;
    }
    return data as T;
  }

  const record = (d: string) => encodeURIComponent(d);

  return {
    name: "porkbun",

    async check(domains) {
      const out = new Map<string, CheckResult>();
      if (domains.length === 0) return out;
      const data = await call<{ domains?: Record<string, PorkbunCheck> }>("/domain/checkDomain", { domains });
      for (const [domain, r] of Object.entries(data.domains ?? {})) {
        out.set(domain.toLowerCase(), {
          available: r.avail === "yes",
          premium: r.premium === "yes",
          priceCents: toCents(r.price),
          regularCents: toCents(r.regularPrice ?? r.price),
          renewalCents: toCents(r.additional?.renewal?.price ?? r.additional?.renewal?.regularPrice),
        });
      }
      return out;
    },

    async owned(domain) {
      try {
        const data = await call<{ domain?: { expireDate?: string } }>(`/domain/get/${record(domain)}`);
        const expires = data.domain?.expireDate ? new Date(data.domain.expireDate.replace(" ", "T") + "Z") : null;
        return { expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null };
      } catch (e) {
        if ((e as { httpStatus?: number }).httpStatus === 404 || (e as { code?: string }).code === "DOMAIN_NOT_FOUND") return null;
        throw e;
      }
    },

    async register(domain, costCents) {
      await call(`/domain/create/${record(domain)}`, { cost: costCents, agreeToTerms: "yes" });
    },

    async pointAt(domain, ip) {
      const { records = [] } = await call<{ records?: { id: string; name: string; type: string; content: string }[] }>(
        `/dns/retrieve/${record(domain)}`,
      );
      const hosts = new Set([domain, `www.${domain}`, `*.${domain}`]);
      const have = new Set<string>();
      for (const r of records) {
        if (!hosts.has(r.name.toLowerCase()) || !["A", "AAAA", "ALIAS", "CNAME"].includes(r.type)) continue;
        if (r.type === "A" && r.content === ip && r.name.toLowerCase() !== `*.${domain}`) {
          have.add(r.name.toLowerCase());
          continue;
        }
        // Porkbun parks a new domain with ALIAS/CNAME records to its own page.
        await call(`/dns/delete/${record(domain)}/${encodeURIComponent(r.id)}`);
      }
      for (const [name, fqdn] of [["", domain], ["www", `www.${domain}`]] as const) {
        if (!have.has(fqdn)) await call(`/dns/create/${record(domain)}`, { name, type: "A", content: ip, ttl: 600 });
      }
    },

    async setAutoRenew(domain, on) {
      await call(`/domain/updateAutoRenew/${record(domain)}`, { status: on ? "on" : "off" });
    },
  };
}

// --- in-memory fake (TEST mode without Porkbun sandbox keys) ------------------

// Prices mirror Porkbun's list (2026-09) so the rules behave like LIVE.
const FAKE_PRICES: Record<string, [number, number]> = {
  com: [1108, 1108],
  in: [783, 783],
  "co.in": [580, 580],
  net: [1252, 1252],
  org: [798, 1184],
  shop: [206, 3141],
  online: [196, 2884],
  io: [2812, 5180],
};
const fakeOwned = new Map<string, Date>();

const fakeRegistrar: Registrar = {
  name: "fake",
  async check(domains) {
    const out = new Map<string, CheckResult>();
    for (const domain of domains) {
      const [label, ...rest] = domain.split(".");
      const [price, renewal] = FAKE_PRICES[rest.join(".")] ?? [2000, 3000];
      // Demo rules: "taken" is always taken; very short names are premium.
      out.set(domain, {
        available: !label.includes("taken") && !fakeOwned.has(domain),
        premium: label.length < 5,
        priceCents: price,
        regularCents: price,
        renewalCents: renewal,
      });
    }
    return out;
  },
  async owned(domain) {
    const expiresAt = fakeOwned.get(domain);
    return expiresAt ? { expiresAt } : null;
  },
  async register(domain) {
    fakeOwned.set(domain, new Date(Date.now() + 365 * 86_400_000));
  },
  async pointAt() {},
  async setAutoRenew() {},
};

/** The registrar for the active APP_MODE. */
export function registrar(): Registrar {
  if (isTestMode()) {
    const key = process.env.PORKBUN_API_KEY_TEST ?? "";
    // Only ever a SANDBOX key in test mode — a live key here would spend real money.
    return key.startsWith("pk1_sb_") ? porkbun() : fakeRegistrar;
  }
  return porkbun();
}
