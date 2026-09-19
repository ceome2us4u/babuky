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
import { MESSAGE_STATUSES, type ContactMessage } from "@/lib/admin-api";

/** Messages sent through the "Contact us" form. */
export function MessagesTab({ onExpired }: { onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useAdminList<ContactMessage>("messages", { q, status }, page, onExpired);

  return (
    <div>
      <Toolbar q={q} onQ={(v) => { setQ(v); setPage(0); }} placeholder="Search name, email or message">
        <select className={SELECT_CLASS} aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">Any status</option>
          {MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Toolbar>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {data && data.items.length === 0 && !loading && <Empty>No messages yet.</Empty>}

      <ul className="space-y-3">
        {data?.items.map((m) => {
          const isOpen = open === m.id;
          return (
            <li key={m.id} className="panel rounded-xl">
              <button
                className="flex w-full items-start gap-3 p-4 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : m.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <Pill tone={statusTone(m.status)}>{m.status}</Pill>
                    <span className="text-xs text-muted-foreground">{fmtDate(m.created_at)}</span>
                  </div>
                  <p className={`mt-1 text-sm text-muted-foreground ${isOpen ? "" : "line-clamp-2"}`}>{m.message}</p>
                </div>
                <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-border/60 p-4">
                  <Details>
                    <Field label="Name">{m.name}</Field>
                    <Field label="Received">{fmtDate(m.created_at)}</Field>
                    <Field label="Reply to" wide>
                      <ContactLinks email={m.email} />
                    </Field>
                    <Field label="Message" wide>{m.message}</Field>
                  </Details>
                  <FollowUp
                    path="messages"
                    id={m.id}
                    statuses={MESSAGE_STATUSES}
                    status={m.status}
                    notes={m.admin_notes}
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
