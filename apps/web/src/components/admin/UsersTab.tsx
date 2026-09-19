"use client";

import { useState } from "react";

import { ContactLinks, Empty, Pager, Pill, Toolbar, fmtDate, useAdminList } from "@/components/admin/shared";
import type { AdminUser } from "@/lib/admin-api";

const SOURCE_LABEL: Record<string, string> = {
  MERCHANT: "Shop owner",
  LOCAL_BUYER: "Shop finder",
  CONSULTANCY_LEAD: "Software enquiry",
};

/** Everyone who has signed up, with what they came for. */
export function UsersTab({ onExpired }: { onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const { data, loading, error } = useAdminList<AdminUser>("users", { q }, page, onExpired);

  return (
    <div>
      <Toolbar q={q} onQ={(v) => { setQ(v); setPage(0); }} placeholder="Search phone, name, email or business" />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {data && data.items.length === 0 && !loading && <Empty>No users match.</Empty>}

      <ul className="space-y-3">
        {data?.items.map((u) => (
          <li key={u.phone} className="panel rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{u.full_name ?? "(profile not completed)"}</span>
              {u.account_type && <Pill>{u.account_type === "business" ? "Business" : "Individual"}</Pill>}
              {u.lead_sources.map((s) => (
                <Pill key={s} tone="gold">{SOURCE_LABEL[s] ?? s}</Pill>
              ))}
              {!u.has_password && <Pill tone="red">No password yet</Pill>}
            </div>
            <div className="mt-2">
              <ContactLinks phone={u.phone} email={u.email} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {[u.business_name, u.city].filter(Boolean).join(" · ")}
              {u.business_name || u.city ? " · " : ""}
              {u.shop_count} shop{u.shop_count === 1 ? "" : "s"} · {u.estimate_count} estimate
              {u.estimate_count === 1 ? "" : "s"} · joined {fmtDate(u.created_at)}
              {u.consent ? " · agreed to updates" : ""}
            </p>
          </li>
        ))}
      </ul>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}
