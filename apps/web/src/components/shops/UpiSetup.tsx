"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";

/**
 * Direct Order shops: collect the vendor's UPI ID (VPA), have Razorpay verify
 * it, and only persist after the vendor confirms the returned name is theirs.
 * The QR buyers scan is built at checkout from these verified values — no
 * static QR image is ever uploaded, and Babuki never touches the payment.
 */
export function UpiSetup({
  shopId,
  verifiedName,
  verifiedUpiId,
  onVerified,
}: {
  shopId: string;
  verifiedName?: string | null;
  verifiedUpiId?: string | null;
  onVerified?: (upiId: string, name: string) => void;
}) {
  const [upiId, setUpiId] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<{ upiId: string; name: string } | null>(null);
  const [done, setDone] = useState<{ upiId: string; name: string } | null>(
    verifiedName && verifiedUpiId ? { upiId: verifiedUpiId, name: verifiedName } : null,
  );

  const validate = async () => {
    setBusy(true);
    try {
      const res = await apiPost<{ valid: boolean; upiId: string; customerName: string }>(
        `/shops/${shopId}/upi/validate`,
        { upiId: upiId.trim() },
      );
      setCandidate({ upiId: res.upiId, name: res.customerName });
    } catch (e) {
      setCandidate(null);
      toast.error(e instanceof Error ? e.message : "Couldn't verify this UPI ID");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      await apiPost(`/shops/${shopId}/upi/confirm`, { upiId: candidate.upiId });
      setDone(candidate);
      onVerified?.(candidate.upiId, candidate.name);
      toast.success("UPI ID verified");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't confirm this UPI ID");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-lg border border-gold/40 bg-secondary/40 p-5 text-left">
        <p className="flex items-center gap-2 font-semibold">
          <BadgeCheck className="size-5 text-gold" /> UPI payments ready
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Buyers will pay <span className="font-medium text-foreground">{done.name}</span> ({done.upiId})
          directly by scanning the QR at checkout. Babuki never touches the money.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-gold/40 p-5 text-left">
      <p className="flex items-center gap-2 font-semibold">
        <QrCode className="size-5 text-gold" /> Set up UPI payments
      </p>
      <p className="text-sm text-muted-foreground">
        Enter the UPI ID your customers should pay. We verify it and show you the registered name to
        confirm — the checkout QR is built from that verified ID.
      </p>
      <div className="space-y-2">
        <Label htmlFor="upi-id">UPI ID</Label>
        <div className="flex gap-2">
          <Input
            id="upi-id"
            value={upiId}
            onChange={(e) => {
              setUpiId(e.target.value);
              setCandidate(null);
            }}
            placeholder="yourshop@okhdfcbank"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <Button variant="outline" disabled={busy || upiId.trim().length < 5} onClick={() => void validate()}>
            {busy && !candidate ? <Loader2 className="size-4 animate-spin" /> : null} Verify
          </Button>
        </div>
      </div>
      {candidate && (
        <div className="rounded-md border border-gold/40 bg-secondary/40 p-4">
          <p className="text-sm">
            Registered to <span className="font-bold">{candidate.name}</span>. Is this your business?
          </p>
          <Button className="mt-3" size="sm" disabled={busy} onClick={() => void confirm()}>
            Yes, confirm
          </Button>
        </div>
      )}
    </div>
  );
}
