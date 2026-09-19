"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { FollowUp } from "@/components/admin/FollowUp";
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
import { ITEM_BY_ID, inr } from "@/components/estimator/catalog";
import { LEAD_STATUSES, type Estimate } from "@/lib/admin-api";

/** Software estimator requests — every input the customer gave, whether or not they paid the ₹100. */
export function EstimatesTab({ onExpired }: { onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [paid, setPaid] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useAdminList<Estimate>("estimates", { q, status, paid }, page, onExpired);

  return (
    <div>
      <Toolbar q={q} onQ={(v) => { setQ(v); setPage(0); }} placeholder="Search name, phone, email, ticket or note">
        <select className={SELECT_CLASS} aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">Any status</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className={SELECT_CLASS} aria-label="Payment" value={paid} onChange={(e) => { setPaid(e.target.value); setPage(0); }}>
          <option value="">Paid or not</option>
          <option value="paid">₹100 paid</option>
          <option value="pending">Not paid yet</option>
        </select>
      </Toolbar>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {data && data.items.length === 0 && !loading && <Empty>No estimator requests match.</Empty>}

      <ul className="space-y-3">
        {data?.items.map((e) => {
          const isOpen = open === e.id;
          return (
            <li key={e.id} className="panel rounded-xl">
              <button
                className="flex w-full items-start gap-3 p-4 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : e.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.name}</span>
                    <span className="text-xs text-muted-foreground">{e.ticket_ref}</span>
                    <Pill tone={statusTone(e.status)}>{e.status}</Pill>
                    <Pill tone={e.deposit_status === "paid" ? "green" : "gold"}>
                      {e.deposit_status === "paid" ? "₹100 paid" : "Not paid yet"}
                    </Pill>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {e.phone} · {inr(e.budget_low)} – {inr(e.budget_high)} · {fmtDate(e.created_at)}
                  </p>
                </div>
                <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-border/60 p-4">
                  <Details>
                    <Field label="Name they gave">{e.name}</Field>
                    <Field label="Email they gave">{e.email}</Field>
                    <Field label="Contact" wide>
                      <ContactLinks phone={e.phone} email={e.email || e.profile_email} />
                    </Field>
                    <Field label="Account type">{e.account_type}</Field>
                    <Field label="Business / city">{[e.business_name, e.city].filter(Boolean).join(" · ")}</Field>
                    <Field label="Their note about the business" wide>{e.description}</Field>
                    {e.requested_domain && (
                      <Field label="Web address they asked about">{e.requested_domain}</Field>
                    )}
                    <Field label="What they picked" wide>
                      <ul className="space-y-1">
                        {e.selected_items.map((i) => (
                          <li key={i.id} className="flex justify-between gap-4">
                            <span>{ITEM_BY_ID.get(i.id)?.title ?? i.id}</span>
                            <span className="shrink-0 text-muted-foreground">{inr(i.low)} – {inr(i.high)}</span>
                          </li>
                        ))}
                        <li className="flex justify-between gap-4 border-t border-border/60 pt-1 font-semibold">
                          <span>Estimated total</span>
                          <span>{inr(e.budget_low)} – {inr(e.budget_high)}</span>
                        </li>
                      </ul>
                    </Field>
                    <Field label="Submitted">{fmtDate(e.created_at)}</Field>
                    <Field label="Last updated">{fmtDate(e.updated_at)}</Field>
                    <Field label="Razorpay order">{e.razorpay_order_id}</Field>
                  </Details>
                  <FollowUp
                    path="estimates"
                    id={e.id}
                    statuses={LEAD_STATUSES}
                    status={e.status}
                    notes={e.admin_notes}
                    onExpired={onExpired}
                    onSaved={() => void reload()}
                  />
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
