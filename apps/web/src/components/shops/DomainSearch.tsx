"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { ApiError, apiFetch } from "@/lib/api";
import { domainInput, domainQueryError } from "@/lib/validate";
import { siteConfig } from "@/config/site";

type Row = { domain: string; status: "available" | "on_request" | "taken" | "unknown"; reason?: "ending" | "name" };

/**
 * Search for an own web address (the ₹1,500 plan). Shows every ending the plan
 * offers plus the popular "on request" ones; prices are never shown. An "on
 * request" name links to the estimator, so the customer becomes a lead
 * instead of leaving. Used at signup, when upgrading and when re-picking.
 */
export function DomainSearch({
  shopId,
  selected,
  onSelect,
  onSlug,
  showBabukiAddress = false,
}: {
  shopId?: string;
  selected: string | null;
  onSelect: (domain: string | null) => void;
  /** The free <slug>.babuki.com address the API suggests for this name. */
  onSlug?: (slug: string | null) => void;
  showBabukiAddress?: boolean;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = q.replace(/\.$/, "");
  const invalid = domainQueryError(query);

  // Debounced and race-safe, like the subdomain check: the registrar's check
  // budget is shared by the whole site.
  useEffect(() => {
    setError(null);
    if (!query || invalid) {
      setRows(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let stale = false;
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{ results: Row[]; slug: string | null }>(
          `/domains/search?q=${encodeURIComponent(query)}${shopId ? `&shopId=${shopId}` : ""}`,
        );
        if (stale) return;
        setRows(res.results);
        setSlug(res.slug);
        onSlug?.(res.slug);
      } catch (e) {
        if (!stale) {
          setRows(null);
          setError(e instanceof ApiError ? e.message : "We couldn't check web addresses right now.");
        }
      } finally {
        if (!stale) setLoading(false);
      }
    }, 600);
    return () => {
      stale = true;
      clearTimeout(id);
    };
    // onSlug is a setter from the parent; re-running on its identity isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, invalid, shopId]);

  // A pick that's no longer offered (new search, or it just got taken) is dropped.
  useEffect(() => {
    if (selected && !rows?.some((r) => r.domain === selected && r.status === "available")) onSelect(null);
  }, [rows, selected, onSelect]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="own-domain-search">Search for your web address</Label>
        <Input
          id="own-domain-search"
          value={q}
          maxLength={60}
          placeholder="Your shop name"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setQ(domainInput(e.target.value))}
        />
        <FieldError message={invalid} />
      </div>

      <div className="min-h-6 text-sm">
        {loading && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking web addresses…
          </span>
        )}
        {!loading && error && <span className="text-destructive">{error}</span>}
      </div>

      {rows && !loading && (
        <ul className="overflow-hidden rounded-lg border border-border">
          {rows.map((r) => (
            <ResultRow key={r.domain} row={r} selected={selected === r.domain} onPick={() => onSelect(r.domain)} />
          ))}
        </ul>
      )}

      {selected && (
        <p className="rounded-md bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground">
          Your shop will be at <span className="font-semibold text-foreground">{selected}</span>
          {showBabukiAddress && slug && (
            <>
              {" "}and also at{" "}
              <span className="font-semibold text-foreground">
                {slug}.{siteConfig.domain}
              </span>
              . It opens on the Babuki address straight away; your own address follows, usually within 30 minutes
            </>
          )}
          .
          <br />
          Babuki registers this web address and looks after it for you. You can use it for as long as your plan is active.
        </p>
      )}
    </div>
  );
}

function ResultRow({ row, selected, onPick }: { row: Row; selected: boolean; onPick: () => void }) {
  const ending = row.domain.slice(row.domain.indexOf("."));
  const note = ending === ".in" ? <span className="text-xs font-normal text-muted-foreground"> · India&apos;s own web address</span> : null;

  if (row.status === "on_request") {
    const why =
      row.reason === "ending"
        ? `${ending} addresses cost much more to keep each year, so they aren't included in the ₹1,500 plan.`
        : "This is a premium web address, so it isn't included in the ₹1,500 plan.";
    return (
      <li className="flex items-start gap-3 border-t border-border bg-secondary/20 px-4 py-3 first:border-t-0">
        <span className="mt-1 size-4 shrink-0 rounded-full border border-dashed border-muted-foreground/50" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-all font-semibold">
            {row.domain}
            {note}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {why} Want this exact address?{" "}
            <Link className="font-semibold text-burgundy hover:underline" href={`/estimator?domain=${encodeURIComponent(row.domain)}`}>
              Ask us for a price →
            </Link>
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-gold/50 bg-secondary px-2.5 py-0.5 text-xs font-semibold text-gold">
          On request
        </span>
      </li>
    );
  }

  const ok = row.status === "available";
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        disabled={!ok}
        onClick={onPick}
        aria-pressed={selected}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
          selected ? "bg-secondary/50 shadow-[inset_3px_0_0_var(--color-gold)]" : ok ? "hover:bg-secondary/30" : ""
        }`}
      >
        <span
          className={`size-4 shrink-0 rounded-full border ${selected ? "border-[5px] border-gold" : "border-muted-foreground/50"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 break-all font-semibold">
          {row.domain}
          {note}
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            ok
              ? "bg-emerald-50 text-emerald-800"
              : row.status === "taken"
                ? "bg-red-50 text-red-800"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {ok ? "Available" : row.status === "taken" ? "Taken" : "Couldn't check"}
        </span>
      </button>
    </li>
  );
}
