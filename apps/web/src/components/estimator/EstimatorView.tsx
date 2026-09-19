"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Info, Minus, Plus, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field-error";
import { useAuth } from "@/lib/auth";
import { LIMITS, emailError, nameError } from "@/lib/validate";
import { apiPost } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";

type Item = { id: string; name: string; note: string; low: number; high: number };

const CATEGORIES: { title: string; caption: string; items: Item[] }[] = [
  {
    title: "Category 1 — Base Deliverables",
    caption: "The product surface we design, build and ship.",
    items: [
      { id: "web", name: "Informational Website", note: "Up to 8 pages, CMS-ready", low: 25000, high: 40000 },
      { id: "ecom", name: "E-commerce Store", note: "Catalog, cart, payment gateway", low: 60000, high: 110000 },
      { id: "api", name: "Web Services / REST APIs", note: "Auth, CRUD, documentation", low: 40000, high: 75000 },
      { id: "mobile", name: "Cross-Platform Mobile App", note: "Android + iOS single codebase", low: 90000, high: 160000 },
    ],
  },
  {
    title: "Category 2 — Cloud Infrastructure",
    caption: "Classic AWS/GCP provisioning, hardened and handed over.",
    items: [
      { id: "ec2", name: "AWS/GCP Classic EC2 Setup", note: "VM, security groups, deploy pipeline", low: 12000, high: 20000 },
      { id: "ssl", name: "SSL Certificate Setup", note: "Auto-renewing HTTPS", low: 2500, high: 5000 },
      { id: "dns", name: "Domain Configuration", note: "DNS, mail records, redirects", low: 2000, high: 4000 },
      { id: "db", name: "Database Setup", note: "Managed SQL, backups, tuning", low: 10000, high: 18000 },
    ],
  },
  {
    title: "Category 3 — Telecom & Verification",
    caption: "Indian compliance and messaging rails.",
    items: [
      { id: "dlt", name: "DLT Registration", note: "TRAI entity + header + templates", low: 6000, high: 10000 },
      { id: "msg91", name: "MSG91 OTP / SMS Gateway Integration", note: "OTP flows, retries, delivery logs", low: 8000, high: 15000 },
    ],
  },
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function EstimatorView() {
  const [cart, setCart] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => CATEGORIES.flatMap((c) => c.items).filter((i) => cart[i.id]), [cart]);
  const low = selected.reduce((s, i) => s + i.low, 0);
  const high = selected.reduce((s, i) => s + i.high, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 pb-36">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase text-gold">Track 2</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">
          Software Consultancy <span className="text-gold-gradient">Scope Estimator</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Tick what your project needs. The budget range updates live, with no sales call required to
          see a number.
        </p>
      </header>

      <div className="space-y-10">
        {CATEGORIES.map((cat) => (
          <section key={cat.title}>
            <h2 className="text-lg font-bold text-gold">{cat.title}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{cat.caption}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {cat.items.map((i) => {
                const on = !!cart[i.id];
                return (
                  <button
                    key={i.id}
                    onClick={() => setCart((c) => ({ ...c, [i.id]: !on }))}
                    className={`panel flex items-start justify-between gap-4 rounded-xl p-5 text-left transition ${
                      on ? "border-gold/70 glow-gold" : ""
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{i.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{i.note}</p>
                      <p className="mt-2 text-sm text-gold">
                        {inr(i.low)} – {inr(i.high)}
                      </p>
                    </div>
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-md border ${
                        on ? "border-gold text-gold" : "border-border text-muted-foreground"
                      }`}
                    >
                      {on ? <Minus className="size-4" /> : <Plus className="size-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="panel mt-10 flex items-start gap-3 rounded-xl p-5 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" />
        This estimate serves as a baseline for custom discovery.
      </div>

      {/* Sticky summary */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/25 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {selected.length} item{selected.length === 1 ? "" : "s"} in scope
            </p>
            <p className="text-lg font-bold text-gold-gradient">
              Estimated Budget: {inr(low)} – {inr(high)}
            </p>
          </div>
          <Button size="lg" disabled={selected.length === 0} onClick={() => setOpen(true)}>
            Submit service request
          </Button>
        </div>
      </div>

      <RequestModal
        open={open}
        onOpenChange={setOpen}
        items={selected}
        low={low}
        high={high}
      />
    </div>
  );
}

function RequestModal({
  open,
  onOpenChange,
  items,
  low,
  high,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: Item[];
  low: number;
  high: number;
}) {
  const { user, requestLogin, ensureLeadSource } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [desc, setDesc] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.profile) return;
    setName((current) => current || user.profile?.fullName || "");
    setEmail((current) => current || user.profile?.email || "");
  }, [user]);

  const pay = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const problem = nameError(name) ?? emailError(email);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await ensureLeadSource("CONSULTANCY_LEAD");
      // The API prices the lead from these ids' low/high, creates the ticket
      // and the ₹100 Razorpay order; the webhook marks the deposit paid.
      const lead = await apiPost<{ ticketRef: string; order: { id: string } }>("/consultancy/leads", {
        selectedItems: items.map(({ id, low, high }) => ({ id, low, high })),
        name: name.trim(),
        email: email.trim(),
        description: desc.trim(),
      });
      await openRazorpayCheckout({
        orderId: lead.order.id,
        description: `Discovery call deposit · ${lead.ticketRef}`,
        prefill: { name: name.trim(), email: email.trim(), contact: user?.phone },
        onSuccess: () => {
          setTicket(lead.ticketRef);
          toast.success("₹100 deposit received");
        },
        onDismiss: () => setBusy(false),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the payment");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticket ? "Service Request Ticket Generated" : "Book your discovery call"}</DialogTitle>
        </DialogHeader>

        {ticket ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto size-10 text-gold" />
            <p className="text-2xl font-black text-gold-gradient">{ticket}</p>
            <p className="text-sm text-muted-foreground">
              Our lead technical architect will call {user?.phone} within one business day to run
              discovery on your {items.length}-item scope ({inr(low)} – {inr(high)}).
            </p>
          </div>
        ) : !user?.profile ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Verify your mobile number to continue. Your number is tagged{" "}
              <span className="text-gold">CONSULTANCY_LEAD</span>.
            </p>
            <Button className="w-full" onClick={() => requestLogin("CONSULTANCY_LEAD")}>
              Verify mobile number
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Verified mobile</Label>
              <Input value={user?.phone ?? ""} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                maxLength={LIMITS.fullName}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
              <FieldError message={nameError(name)} />
            </div>
            <div className="space-y-2">
              <Label>
                Email <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                type="email"
                value={email}
                maxLength={LIMITS.email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
                placeholder="Your email address"
              />
              <FieldError message={emailError(email)} />
            </div>
            <div className="space-y-2">
              <Label>Project description</Label>
              <Textarea
                rows={4}
                value={desc}
                maxLength={LIMITS.projectDescription}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What are you building, and what does success look like?"
              />
              <p className="text-right text-xs text-muted-foreground">
                {desc.length}/{LIMITS.projectDescription}
              </p>
            </div>
            <div className="rounded-lg border border-gold/40 bg-secondary/40 p-4 text-xs leading-relaxed text-muted-foreground">
              Pay ₹100 refundable commitment deposit to book a 1-on-1 discovery call with our lead
              technical architect. The ₹100 fee is 100% credited back toward your project invoice upon
              contract signing.
            </div>
            <Button
              className="w-full"
              onClick={() => void pay()}
              disabled={busy || !name.trim() || !!nameError(name) || !!emailError(email)}
            >
              <Ticket className="size-4" /> {busy ? "Opening checkout…" : "Pay ₹100 & generate ticket"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
