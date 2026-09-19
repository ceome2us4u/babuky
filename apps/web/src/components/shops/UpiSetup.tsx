"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { apiPost } from "@/lib/api";
import { buildUpiLink } from "@/lib/upi";
import { LIMITS, UPI_RE, upiError, upiInput, upiNameError, upiNameInput } from "@/lib/validate";

/**
 * Direct Order shops: the OWNER confirms their own UPI ID. Razorpay can't look a
 * UPI ID up for us any more (UPI Collect is switched off; the replacement needs
 * RazorpayX), so the owner enters the ID, scans a test QR with their own UPI
 * app, reads the name it shows, types that name, and ticks that the ID is theirs.
 * The QR buyers scan is built at checkout from these values — no static QR image
 * is uploaded, and Babuki never touches the payment. Buyers' own UPI apps also
 * show the payee name before they pay.
 */
export function UpiSetup({
  shopId,
  shopName,
  verifiedName,
  verifiedUpiId,
  onVerified,
}: {
  shopId: string;
  /** Only used to label the test QR. */
  shopName?: string;
  verifiedName?: string | null;
  verifiedUpiId?: string | null;
  onVerified?: (upiId: string, name: string) => void;
}) {
  const [upiId, setUpiId] = useState("");
  const [checking, setChecking] = useState(false); // showing the test QR
  const [name, setName] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ upiId: string; name: string } | null>(
    verifiedName && verifiedUpiId ? { upiId: verifiedUpiId, name: verifiedName } : null,
  );

  const confirm = async () => {
    setBusy(true);
    try {
      await apiPost(`/shops/${shopId}/upi/confirm`, { upiId: upiId.trim(), name: name.trim(), confirmed: true });
      const result = { upiId: upiId.trim(), name: name.trim() };
      setDone(result);
      onVerified?.(result.upiId, result.name);
      toast.success("UPI payments are ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save this UPI ID");
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
          Buyers will pay <span className="font-medium text-foreground">{done.name}</span> ({done.upiId}) directly by
          scanning the QR at checkout. You confirmed this UPI ID yourself; Babuki never touches the money.
        </p>
      </div>
    );
  }

  const formatOk = UPI_RE.test(upiId);
  const nameOk = !upiNameError(name) && name.trim().length >= 2;

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-gold/40 p-5 text-left">
      <p className="flex items-center gap-2 font-semibold">
        <QrCode className="size-5 text-gold" /> Set up UPI payments
      </p>
      <p className="text-sm text-muted-foreground">
        Enter the UPI ID your customers should pay. You&apos;ll check it with your own UPI app in a moment, so the money
        goes to the right account.
      </p>

      <div className="space-y-2">
        <Label htmlFor="upi-id">UPI ID</Label>
        <div className="flex gap-2">
          <Input
            id="upi-id"
            value={upiId}
            maxLength={LIMITS.upi}
            disabled={checking}
            onChange={(e) => setUpiId(upiInput(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && formatOk && setChecking(true)}
            placeholder="Your UPI ID"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {checking ? (
            <Button
              variant="outline"
              onClick={() => {
                setChecking(false);
                setSure(false);
              }}
            >
              Change
            </Button>
          ) : (
            <Button variant="outline" disabled={!formatOk} onClick={() => setChecking(true)}>
              Next
            </Button>
          )}
        </div>
        <FieldError message={upiError(upiId)} />
      </div>

      {checking && (
        <div className="space-y-4 rounded-md border border-gold/40 bg-secondary/40 p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open your UPI app (GPay, PhonePe, Paytm…) and choose <b>Scan</b>.</li>
            <li>Scan this QR. <b>Don&apos;t pay</b> — just look at the name your app shows, then close it.</li>
            <li>Type that name below.</li>
          </ol>
          <div className="mx-auto grid w-fit place-items-center rounded-lg border border-gold/40 bg-white p-3">
            <QRCodeSVG value={buildUpiLink({ vpa: upiId.trim(), name: shopName?.trim() || "My shop" })} size={168} level="M" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upi-name">Name shown in your UPI app</Label>
            <Input
              id="upi-name"
              value={name}
              maxLength={LIMITS.upiName}
              onChange={(e) => setName(upiNameInput(e.target.value))}
              placeholder="The name your UPI app showed"
              autoComplete="off"
            />
            <FieldError message={upiNameError(name)} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={sure} onCheckedChange={(v) => setSure(v === true)} className="mt-0.5" />
            <span>This is my own business&apos;s UPI ID, and the name above is exactly what my app showed.</span>
          </label>
          <Button disabled={busy || !nameOk || !sure} onClick={() => void confirm()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Confirm and start accepting UPI payments
          </Button>
        </div>
      )}
    </div>
  );
}
