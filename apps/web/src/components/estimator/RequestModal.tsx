"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { inr, type EstimatorItem } from "@/components/estimator/catalog";
import { useAuth } from "@/lib/auth";
import { apiPost } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { LIMITS, emailError, nameError } from "@/lib/validate";

/**
 * "Talk to our expert" — the last step. Plain words throughout: the person
 * booking is a shop owner, not a developer. The ₹100 is a refundable booking
 * deposit taken through Razorpay (same flow as before); the API creates the
 * ticket and the order, and the webhook marks the deposit paid.
 */
export function RequestModal({
  open,
  onOpenChange,
  items,
  low,
  high,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: EstimatorItem[];
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

  const book = async () => {
    if (!name.trim()) {
      toast.error("Please enter your name");
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
      // The API stores the choices and their price range, creates the ticket
      // and the ₹100 Razorpay order; the webhook marks the deposit paid.
      const lead = await apiPost<{ ticketRef: string; order: { id: string }; keyId: string }>("/consultancy/leads", {
        selectedItems: items.map(({ id, low, high }) => ({ id, low, high })),
        name: name.trim(),
        email: email.trim(),
        description: desc.trim(),
      });
      await openRazorpayCheckout({
        keyId: lead.keyId,
        orderId: lead.order.id,
        description: `Booking deposit for your expert call · ${lead.ticketRef}`,
        prefill: { name: name.trim(), email: email.trim(), contact: user?.phone },
        onSuccess: () => {
          setTicket(lead.ticketRef);
          toast.success("Your call is booked");
        },
        onDismiss: () => setBusy(false),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the payment — please try again");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticket ? "Your request is in!" : "Book a call with our expert"}</DialogTitle>
        </DialogHeader>

        {ticket ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto size-10 text-gold" />
            <p className="text-sm text-muted-foreground">Your reference number</p>
            <p className="text-2xl font-black text-gold-gradient">{ticket}</p>
            <p className="text-sm text-muted-foreground">
              One of our experts will call you on {user?.phone} within one business day to talk through your{" "}
              {items.length} {items.length === 1 ? "choice" : "choices"} ({inr(low)} – {inr(high)}) and give you an
              exact price.
            </p>
          </div>
        ) : !user?.profile ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Confirm your mobile number first, so our expert knows where to call you back.
            </p>
            <Button className="w-full" onClick={() => requestLogin("CONSULTANCY_LEAD")}>
              Confirm my mobile number
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">What you picked</p>
              <ul className="mt-2 space-y-1 text-sm">
                {items.map((i) => (
                  <li key={i.id}>• {i.title}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm font-semibold text-gold-gradient">
                Estimated price: {inr(low)} – {inr(high)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Your mobile number</Label>
              <Input value={user.phone} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Your name</Label>
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
                Your email <span className="font-normal text-muted-foreground">(optional)</span>
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
              <Label>
                Tell us about your business <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                rows={4}
                value={desc}
                maxLength={LIMITS.projectDescription}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What does your business do, and what would you like the software to help with?"
              />
              <p className="text-right text-xs text-muted-foreground">
                {desc.length}/{LIMITS.projectDescription}
              </p>
            </div>

            <div className="rounded-lg border border-gold/40 bg-secondary/40 p-4 text-xs leading-relaxed text-muted-foreground">
              Your ₹100 is a refundable booking deposit. It holds your slot for a 1-on-1 call with our lead expert, and
              if you go ahead with us the full ₹100 is taken off your project bill.
            </div>
            <Button
              className="w-full"
              onClick={() => void book()}
              disabled={busy || !name.trim() || !!nameError(name) || !!emailError(email)}
            >
              <Ticket className="size-4" /> {busy ? "Opening payment…" : "Pay ₹100 & book my call"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
