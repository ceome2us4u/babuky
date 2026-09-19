"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import type { Page } from "@/lib/admin-api";

export const PAGE_SIZE = 25;

export const SELECT_CLASS =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm shadow-xs focus-visible:border-gold/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Loads one page of a list endpoint; reloads when the filters or page change. `onExpired` fires on a 401. */
export function useAdminList<T>(path: string, params: Record<string, string>, page: number, onExpired: () => void) {
  const [data, setData] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ ...JSON.parse(key), limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      setData(await apiFetch<Page<T>>(`/admin/${path}?${qs}`));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [path, key, page, onExpired]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250); // debounce typing in the search box
    return () => clearTimeout(t);
  }, [load]);

  return { data, loading, error, reload: load };
}

export function Toolbar({
  q,
  onQ,
  placeholder,
  children,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={q}
          maxLength={60}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>
      {children}
    </div>
  );
}

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return <p className="mt-3 text-xs text-muted-foreground">{total} in total</p>;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          className="grid size-8 place-items-center rounded-md border border-border disabled:opacity-40"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span>
          Page {page + 1} / {pages}
        </span>
        <button
          className="grid size-8 place-items-center rounded-md border border-border disabled:opacity-40"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

const TONES = {
  gray: "border-border bg-muted text-muted-foreground",
  gold: "border-gold/50 bg-secondary text-burgundy",
  green: "border-emerald-300 bg-emerald-50 text-emerald-800",
  red: "border-red-300 bg-red-50 text-red-800",
  blue: "border-sky-300 bg-sky-50 text-sky-800",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  new: "gold",
  contacted: "blue",
  replied: "blue",
  quoted: "blue",
  won: "green",
  closed: "gray",
  lost: "red",
  active: "green",
  draft: "gold",
  suspended: "red",
  paid: "green",
  pending: "gold",
};
export const statusTone = (s: string): Tone => STATUS_TONES[s] ?? "gray";

/** One labelled value in a details grid; empty values show "—" so gaps are visible. */
export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{children || "—"}</dd>
    </div>
  );
}

export function Details({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

/** Call / WhatsApp / email shortcuts for a contact. */
export function ContactLinks({ phone, email }: { phone?: string | null; email?: string | null }) {
  const link =
    "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-gold hover:text-gold";
  return (
    <span className="flex flex-wrap items-center gap-2">
      {phone && (
        <>
          <span className="font-medium">{phone}</span>
          <a className={link} href={`tel:${phone}`}>
            <Phone className="size-3.5" /> Call
          </a>
          <a className={link} href={`https://wa.me/${phone.replace(/^\+/, "")}`} target="_blank" rel="noreferrer">
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        </>
      )}
      {email && (
        <a className={link} href={`mailto:${email}`}>
          <Mail className="size-3.5" /> {email}
        </a>
      )}
    </span>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="panel rounded-xl p-10 text-center text-sm text-muted-foreground">{children}</div>
);
