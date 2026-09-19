"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OTP_LENGTH, intInput } from "@/lib/validate";

type Props = {
  phone: string;
  otp: string;
  onOtp: (value: string) => void;
  /** Set in the API's test mode: no SMS is sent, this is the code to enter. */
  testCode: string | null;
  timer: number;
  busy: boolean;
  onVerify: () => void;
  onResend: () => void;
  onChangeNumber: () => void;
};

/** "Enter the code we texted you" — shared by signup and forgot-password. */
export function OtpStep({ phone, otp, onOtp, testCode, timer, busy, onVerify, onResend, onChangeNumber }: Props) {
  return (
    <div className="space-y-4">
      {testCode ? (
        // API test mode: no SMS goes out, so say so and offer the code
        // rather than leave people waiting for a text that never comes.
        <div className="rounded-md border border-gold/40 bg-secondary/50 p-3 text-sm">
          <p className="font-semibold text-burgundy">Test mode — no SMS is sent yet</p>
          <p className="mt-1 text-muted-foreground">
            Real text messages start once our SMS sender is approved. For now, use the code{" "}
            <span className="font-bold tracking-widest text-foreground">{testCode}</span> with any number.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => onOtp(intInput(testCode, OTP_LENGTH))}>
            Fill in {testCode}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter the {OTP_LENGTH}-digit code sent to <span className="text-gold">+91 {phone}</span>
        </p>
      )}
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        placeholder={`Enter ${OTP_LENGTH}-digit OTP`}
        aria-label={`${OTP_LENGTH}-digit OTP`}
        className="text-center text-xl tracking-widest placeholder:text-base placeholder:tracking-normal"
        value={otp}
        onChange={(e) => onOtp(intInput(e.target.value, OTP_LENGTH))}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
          if (e.key === "Enter") onVerify();
        }}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Button variant="link" className="h-auto p-0 text-gold" onClick={onChangeNumber}>
          Change number
        </Button>
        {timer > 0 ? (
          <span>Resend OTP in {timer}s</span>
        ) : (
          <Button variant="link" className="h-auto p-0 text-gold" disabled={busy} onClick={onResend}>
            Resend OTP
          </Button>
        )}
      </div>
      <Button className="w-full" onClick={onVerify} disabled={busy}>
        {busy ? "Verifying…" : "Verify & Continue"}
      </Button>
    </div>
  );
}
