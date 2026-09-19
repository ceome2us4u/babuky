"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Check, Info, Plus, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RequestModal } from "@/components/estimator/RequestModal";
import {
  ALL_ITEMS,
  ITEM_BY_ID,
  PRESETS,
  SECTIONS,
  inr,
  missingFor,
  sum,
  type EstimatorItem,
} from "@/components/estimator/catalog";

export function EstimatorView() {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => ALL_ITEMS.filter((i) => picked.has(i.id)), [picked]);
  const { low, high } = sum(selected);
  const missing = useMemo(() => missingFor(picked), [picked]);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addAll = (ids: string[]) => setPicked((cur) => new Set([...cur, ...ids]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 pb-56">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase text-gold">Software for your business</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">
          Build custom software — <span className="text-gold-gradient">see the price first</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          A website, an online shop, a mobile app — no technical knowledge needed. Tick what sounds right and your
          estimated price updates as you go. You pay nothing to see it.
        </p>
      </header>

      {/* Start from a goal, not a catalog */}
      <section className="mb-10">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Sparkles className="size-5 text-gold" /> Not sure where to start? Pick what sounds like you
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((p) => {
            const items = p.ids.map((id) => ITEM_BY_ID.get(id)!);
            const { low: pl, high: ph } = sum(items);
            const active = p.ids.every((id) => picked.has(id)) && picked.size === p.ids.length;
            return (
              <button
                key={p.id}
                onClick={() => setPicked(new Set(p.ids))}
                aria-pressed={active}
                className={`panel flex flex-col rounded-xl p-4 text-left transition ${
                  active ? "border-gold/70 glow-gold" : "hover:border-gold/40"
                }`}
              >
                <span className="font-semibold leading-snug">{p.title}</span>
                <span className="mt-1 text-xs text-muted-foreground">{p.sub}</span>
                <span className="mt-3 text-xs font-semibold text-gold">
                  Around {inr(pl)} – {inr(ph)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You can change anything after picking one — it just saves you time.
        </p>
      </section>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.step}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {section.step}
              </span>
              <div>
                <h2 className="text-lg font-bold">{section.title}</h2>
                <p className="mb-4 text-sm text-muted-foreground">{section.caption}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {section.items.map((item) => (
                <OptionCard key={item.id} item={item} on={picked.has(item.id)} onToggle={() => toggle(item.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="panel mt-12 flex items-start gap-3 rounded-xl p-5 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" />
        <p>
          This is a <span className="font-medium text-foreground">starting estimate</span>, not a final quote. After a
          short call with our expert we&apos;ll give you an exact price and timeline for your business.
        </p>
      </div>

      {/* Sticky summary: what you might have forgotten, the running price, and the next step */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/25 bg-background/95 backdrop-blur-xl">
        {missing.length > 0 && (
          <div className="border-b border-gold/25 bg-secondary/60">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                <span className="font-semibold">You&apos;ll probably also need:</span>{" "}
                <span className="text-muted-foreground">{missing.map((m) => m.short).join(", ")}</span>
              </p>
              <Button size="sm" variant="outline" onClick={() => addAll(missing.map((m) => m.id))}>
                <Plus className="size-4" /> Add {missing.length === 1 ? "it" : "them"} ({inr(sum(missing).low)} –{" "}
                {inr(sum(missing).high)})
              </Button>
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {selected.length === 0 ? (
              <>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Nothing picked yet</p>
                <p className="text-sm font-medium text-muted-foreground">
                  Pick a starting point above, or tick anything below.
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">
                  {selected.length} thing{selected.length === 1 ? "" : "s"} picked
                  <button
                    onClick={() => setPicked(new Set())}
                    className="inline-flex items-center gap-1 font-medium normal-case text-gold hover:underline"
                  >
                    <RotateCcw className="size-3" /> Start over
                  </button>
                </p>
                <p className="text-lg font-bold text-gold-gradient">
                  Estimated price: {inr(low)} – {inr(high)}
                </p>
              </>
            )}
          </div>
          <Button size="lg" disabled={selected.length === 0} onClick={() => setOpen(true)}>
            <CalendarCheck className="size-4" /> Get my exact price — book a call
          </Button>
        </div>
      </div>

      <RequestModal open={open} onOpenChange={setOpen} items={selected} low={low} high={high} />
    </div>
  );
}

function OptionCard({ item, on, onToggle }: { item: EstimatorItem; on: boolean; onToggle: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className={`panel flex flex-col gap-3 rounded-xl p-5 text-left transition ${
        on ? "border-gold/70 glow-gold" : "hover:border-gold/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-gold">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{item.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.plain}</p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground/80">
        <span className="font-medium">Technical name:</span> {item.techName}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="text-sm font-semibold text-gold">
          {inr(item.low)} – {inr(item.high)}
        </p>
        <span
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
            on ? "border-gold bg-secondary text-burgundy" : "border-border text-muted-foreground"
          }`}
        >
          {on ? (
            <>
              <Check className="size-3.5" /> Added
            </>
          ) : (
            <>
              <Plus className="size-3.5" /> Add
            </>
          )}
        </span>
      </div>
    </button>
  );
}
