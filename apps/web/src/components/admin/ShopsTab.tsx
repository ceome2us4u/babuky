"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

import {
  ContactLinks,
  Details,
  Empty,
  Field,
  Pager,
  Pill,
  SELECT_CLASS,
  Toolbar,
  fmtDate,
  statusTone,
  useAdminList,
} from "@/components/admin/shared";
import type { AdminShop } from "@/lib/admin-api";

/** Vendors who started (or finished) setting up a shop — every input from the setup form. */
export function ShopsTab({ onExpired }: { onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error } = useAdminList<AdminShop>("shops", { q, status }, page, onExpired);

  return (
    <div>
      <Toolbar q={q} onQ={(v) => { setQ(v); setPage(0); }} placeholder="Search shop, owner, phone, web address or industry">
        <select className={SELECT_CLASS} aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">Any status</option>
          <option value="draft">Draft (not paid)</option>
          <option value="active">Live</option>
          <option value="suspended">Suspended</option>
        </select>
      </Toolbar>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {data && data.items.length === 0 && !loading && <Empty>No shops yet.</Empty>}

      <ul className="space-y-3">
        {data?.items.map((s) => {
          const isOpen = open === s.id;
          return (
            <li key={s.id} className="panel rounded-xl">
              <button
                className="flex w-full items-start gap-3 p-4 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : s.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.slug}.babuki.com</span>
                    <Pill tone={statusTone(s.status)}>{s.status === "active" ? "live" : s.status}</Pill>
                    <Pill>{s.mode === "order" ? "Direct Order" : "Display only"}</Pill>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.industry} · {s.owner_name} · {s.phone} · {fmtDate(s.created_at)}
                  </p>
                </div>
                <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-border/60 p-4">
                  <Details>
                    <Field label="Store name">{s.name}</Field>
                    <Field label="Web address">
                      {s.status === "active" ? (
                        <a className="inline-flex items-center gap-1 text-gold hover:underline" href={`https://${s.slug}.babuki.com`} target="_blank" rel="noreferrer">
                          {s.slug}.babuki.com <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        `${s.slug}.babuki.com (not live)`
                      )}
                    </Field>
                    <Field label="Owner name (on the shop)">{s.owner_name}</Field>
                    <Field label="Kind of business">{s.industry}</Field>
                    <Field label="Contact" wide>
                      <ContactLinks phone={s.phone} email={s.profile_email} />
                    </Field>
                    <Field label="Account business / city">{[s.business_name, s.city].filter(Boolean).join(" · ")}</Field>
                    <Field label="Shop address">{s.address_text}</Field>
                    <Field label="Mode">{s.mode === "order" ? "Direct Order (UPI QR)" : "Display only"}</Field>
                    <Field label="UPI ID">
                      {s.upi_id ? `${s.upi_id} — ${s.is_upi_verified ? `verified: ${s.verified_merchant_name}` : "not verified"}` : ""}
                    </Field>
                    <Field label="Subscription">
                      {s.subscription_status
                        ? `${s.subscription_status}${s.current_period_end ? ` · renews ${fmtDate(s.current_period_end)}` : ""}`
                        : "none started"}
                    </Field>
                    <Field label="Items in catalog">{String(s.item_count)}</Field>
                    <Field label="Created">{fmtDate(s.created_at)}</Field>
                  </Details>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}
