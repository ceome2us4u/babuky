"use client";

import { Check } from "lucide-react";

import { siteConfig } from "@/config/site";

export type Plan = "standard" | "premium";

export const PLAN_PRICE: Record<Plan, number> = { standard: 500, premium: 1500 };

const PLANS: { id: Plan; tag: string; name: string; example: string; points: string[] }[] = [
  {
    id: "standard",
    tag: "Starter",
    name: "Babuki address",
    example: `yourshop.${siteConfig.domain}`,
    points: ["Live in seconds", "Secure (https) included", "Early bird price, locked for life"],
  },
  {
    id: "premium",
    tag: "Most professional",
    name: "Your own web address",
    example: "yourshop.in",
    points: [
      "Web address included — no yearly bills",
      "We set it up for you, nothing technical",
      `Also works at yourshop.${siteConfig.domain}`,
      "Early bird price, locked for life",
    ],
  },
];

/** Step 1's two plan cards. Only rendered while the own-domain feature is on. */
export function PlanChoice({ plan, onPlan }: { plan: Plan; onPlan: (p: Plan) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Choose your plan">
      {PLANS.map((p) => {
        const on = plan === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPlan(p.id)}
            className={`relative rounded-xl border-[1.5px] p-4 text-left transition ${
              on ? "border-gold bg-secondary/40 shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-gold)_18%,transparent)]" : "border-border hover:border-gold/50"
            }`}
          >
            <span
              className={`absolute right-4 top-4 size-[18px] rounded-full border ${on ? "border-[5px] border-gold" : "border-muted-foreground/50"}`}
              aria-hidden
            />
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                p.id === "premium" ? "bg-gold text-white" : "bg-secondary text-burgundy"
              }`}
            >
              {p.tag}
            </span>
            <p className="mt-2 font-bold">{p.name}</p>
            <p className="mt-1 text-2xl font-black text-burgundy">
              ₹{PLAN_PRICE[p.id].toLocaleString("en-IN")}{" "}
              <span className="text-sm font-medium text-muted-foreground">/ month</span>
            </p>
            <p className="mt-2 break-all rounded-md bg-background px-2 py-1.5 font-mono text-sm text-burgundy">{p.example}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {p.points.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" /> {t}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
