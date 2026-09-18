"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, ShieldCheck, Smartphone, UserRound } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

/**
 * Global SMS OTP auth: phone -> OTP (MSG91 via the API) -> profile.
 * On verification the phone number is tagged with the active lead-source flag
 * (MERCHANT | LOCAL_BUYER | CONSULTANCY_LEAD) for audience routing.
 */
export function AuthModal() {
  const { modalOpen, closeModal, sendOtp, verifyOtp, completeProfile, finishLogin, pendingSource } =
    useAuth();
  const [step, setStep] = useState<"phone" | "otp" | "profile">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [consent, setConsent] = useState(false);
  const [timer, setTimer] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState<"business" | "individual">(
    pendingSource === "MERCHANT" ? "business" : "individual",
  );
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (!modalOpen) {
      setStep("phone");
      setOtp("");
      setTimer(0);
      setBusy(false);
      setFullName("");
      setEmail("");
      setBusinessName("");
      setCity("");
    }
  }, [modalOpen]);

  useEffect(() => {
    if (modalOpen && step === "phone") {
      setAccountType(pendingSource === "MERCHANT" ? "business" : "individual");
    }
  }, [modalOpen, pendingSource, step]);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

  const send = async (resend = false) => {
    if (!/^\d{10}$/.test(phone)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    if (!consent) {
      toast.error("Please accept the consent to continue");
      return;
    }
    setBusy(true);
    try {
      await sendOtp(phone, consent);
      setStep("otp");
      setTimer(30);
      toast.success(resend ? "OTP resent" : `OTP sent to +91 ${phone}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{4,6}$/.test(otp)) {
      toast.error("Enter the OTP from your SMS");
      return;
    }
    setBusy(true);
    try {
      const { needsProfile } = await verifyOtp(phone, otp, consent);
      if (needsProfile) {
        setStep("profile");
        toast.success("Phone verified", { description: "One last step to personalize your account" });
      } else {
        await finishLogin();
        toast.success("Welcome back");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const normalizedEmail = email.trim();
    if (!fullName.trim()) {
      toast.error("Enter your full name");
      return;
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (accountType === "business" && !businessName.trim()) {
      toast.error("Enter your business or store name");
      return;
    }
    if (!city.trim()) {
      toast.error("Enter your city or locality");
      return;
    }
    setBusy(true);
    try {
      await completeProfile({
        fullName: fullName.trim(),
        email: normalizedEmail,
        accountType,
        businessName: accountType === "business" ? businessName.trim() : "",
        city: city.trim(),
      });
      toast.success("Profile complete", { description: `Welcome to Babuki, ${fullName.trim()}` });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={modalOpen} onOpenChange={(o) => !o && step !== "profile" && closeModal()}>
      <DialogContent className="panel max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="size-5 text-gold" />
            {step === "phone" ? "Login / Signup" : step === "otp" ? "Verify OTP" : "Complete Your Profile"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">1</span>
          <span className={step === "profile" ? "text-muted-foreground" : "text-primary"}>Verify phone</span>
          <span className="h-px flex-1 bg-border" />
          <span
            className={`grid size-5 place-items-center rounded-full ${step === "profile" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            2
          </span>
          <span className={step === "profile" ? "text-primary" : "text-muted-foreground"}>Profile</span>
        </div>

        {step === "phone" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                +91
              </span>
              <Input
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>
                I agree to receive service updates, promotions, and offers from Babuki and its parent
                company, Me2Us4U (OPC) Pvt Ltd.
              </span>
            </label>

            <Button className="w-full" onClick={() => void send()} disabled={busy}>
              <Smartphone className="size-4" /> {busy ? "Sending…" : "Send OTP"}
            </Button>
          </div>
        ) : step === "otp" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the code sent to <span className="text-gold">+91 {phone}</span>
            </p>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="0000"
              className="text-center text-2xl"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Button variant="link" className="h-auto p-0 text-gold" onClick={() => setStep("phone")}>
                Change number
              </Button>
              {timer > 0 ? (
                <span>Resend OTP in {timer}s</span>
              ) : (
                <Button
                  variant="link"
                  className="h-auto p-0 text-gold"
                  disabled={busy}
                  onClick={() => void send(true)}
                >
                  Resend OTP
                </Button>
              )}
            </div>
            <Button className="w-full" onClick={() => void verify()} disabled={busy}>
              {busy ? "Verifying…" : "Verify & Continue"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We’ll use these details to pre-fill your requests and storefront setup.
            </p>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input id="profile-name" value={fullName} maxLength={100} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">
                Email address <span className="font-normal text-muted-foreground">(recommended)</span>
              </Label>
              <Input id="profile-email" type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              <p className="text-xs text-muted-foreground">For invoices and important service updates.</p>
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={accountType === "business" ? "default" : "outline"} onClick={() => setAccountType("business")}>
                  <Building2 className="size-4" /> Business
                </Button>
                <Button type="button" variant={accountType === "individual" ? "default" : "outline"} onClick={() => setAccountType("individual")}>
                  <UserRound className="size-4" /> Individual / Buyer
                </Button>
              </div>
            </div>
            {accountType === "business" && (
              <div className="space-y-2">
                <Label htmlFor="profile-business">Business / store name</Label>
                <Input id="profile-business" value={businessName} maxLength={120} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="profile-city">City / locality</Label>
              <Input id="profile-city" value={city} maxLength={100} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Indiranagar, Bengaluru" />
            </div>
            <Button className="w-full" onClick={() => void saveProfile()} disabled={busy}>
              {busy ? "Saving…" : "Complete profile"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
