"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { EstimatesTab } from "@/components/admin/EstimatesTab";
import { MessagesTab } from "@/components/admin/MessagesTab";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { ShopsTab } from "@/components/admin/ShopsTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { BrandBadge } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch, apiPost } from "@/lib/api";
import type { Overview } from "@/lib/admin-api";

type Tab = "overview" | "estimates" | "messages" | "shops" | "users";

/**
 * Founder-only console. The Overview call doubles as the "am I signed in?"
 * check: a 401 shows the login screen. The API is the only real gate — this
 * page just reflects it.
 */
export function AdminApp() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<"checking" | "login" | "in" | "error">("checking");
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    try {
      setOverview(await apiFetch<Overview>("/admin/overview"));
      setState("in");
    } catch (e) {
      // Only "not signed in" shows the login screen; an API outage shouldn't look like a bad password.
      setState(e instanceof ApiError && (e.status === 401 || e.status === 403) ? "login" : "error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expired = useCallback(() => {
    setOverview(null);
    setState("login");
  }, []);

  const go = (next: Tab) => {
    setTab(next);
    void load(); // keep the "new" badges fresh after status changes
  };

  const signOut = async () => {
    await apiPost("/admin/logout", {}).catch(() => undefined);
    expired();
  };

  if (state === "checking") return <p className="p-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (state === "error")
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        <p>Couldn&apos;t reach the server.</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  if (state === "login" || !overview) return <AdminLogin onSignedIn={() => void load()} />;

  const c = overview.counts;
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "estimates", label: "Software estimates", badge: c.estimates_new },
    { id: "messages", label: "Messages", badge: c.messages_new },
    { id: "shops", label: "Shops" },
    { id: "users", label: "Users" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-gold/20 bg-background/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <BrandBadge className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">Babuki admin</p>
            <p className="truncate text-xs text-muted-foreground">Every enquiry, with everything they filled in</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6" role="tablist" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                tab === t.id ? "border-gold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {!!t.badge && (
                <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tab === "overview" && <OverviewTab data={overview} onGo={go} />}
        {tab === "estimates" && <EstimatesTab onExpired={expired} />}
        {tab === "messages" && <MessagesTab onExpired={expired} />}
        {tab === "shops" && <ShopsTab onExpired={expired} />}
        {tab === "users" && <UsersTab onExpired={expired} />}
      </main>
    </div>
  );
}
