"use client";

import { FileText, MessageSquare, Store, UserPlus } from "lucide-react";

import { Pill, fmtDate } from "@/components/admin/shared";
import type { Overview } from "@/lib/admin-api";

const KIND: Record<string, { label: string; icon: typeof FileText }> = {
  estimate: { label: "Software estimate", icon: FileText },
  message: { label: "Contact message", icon: MessageSquare },
  shop: { label: "Shop", icon: Store },
  signup: { label: "New signup", icon: UserPlus },
};

/** Counts that need attention, and the latest activity across everything. */
export function OverviewTab({
  data,
  onGo,
}: {
  data: Overview;
  onGo: (tab: "estimates" | "messages" | "shops" | "users") => void;
}) {
  const c = data.counts;

  const tiles: { label: string; value: number; sub: string; tab: "estimates" | "messages" | "shops" | "users"; hot?: boolean }[] = [
    { label: "Software estimates", value: c.estimates_total, sub: `${c.estimates_new} new · ${c.estimates_paid} paid · ${c.estimates_unpaid} not paid`, tab: "estimates", hot: c.estimates_new > 0 },
    { label: "Contact messages", value: c.messages_total, sub: `${c.messages_new} new`, tab: "messages", hot: c.messages_new > 0 },
    { label: "Shops", value: c.shops_total, sub: `${c.shops_active} live · ${c.shops_draft} draft · ${c.shops_suspended} suspended`, tab: "shops" },
    { label: "Users", value: c.users_total, sub: "signed up", tab: "users" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={() => onGo(t.tab)}
            className={`panel rounded-xl p-5 text-left transition hover:border-gold/50 ${t.hot ? "border-gold/60" : ""}`}
          >
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-3xl font-black">{t.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Latest activity</h2>
        {data.feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="panel divide-y divide-border/60 rounded-xl">
            {data.feed.map((f) => {
              const K = KIND[f.kind];
              const Icon = K.icon;
              return (
                <li key={`${f.kind}-${f.id}`} className="flex items-start gap-3 p-3.5">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-gold">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{f.title}</span>{" "}
                      <span className="text-muted-foreground">— {K.label}</span>
                    </p>
                    {f.detail && <p className="truncate text-xs text-muted-foreground">{f.detail}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(f.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.actions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Recent changes you made</h2>
          <ul className="panel divide-y divide-border/60 rounded-xl">
            {data.actions.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Pill>{a.action}</Pill>
                <span className="text-xs text-muted-foreground">{a.admin_email}</span>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
