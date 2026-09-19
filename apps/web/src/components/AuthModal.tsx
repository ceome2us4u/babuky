"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, KeyRound, LogIn, ShieldCheck, Smartphone, UserRound } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { OtpStep } from "@/components/auth/OtpStep";
import { PasswordField } from "@/components/auth/PasswordField";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LIMITS, OTP_LENGTH, PHONE_RE, emailError, nameError, passwordError, phoneError, phoneInput } from "@/lib/validate";

/**
 * Phone + password login. An SMS OTP (MSG91 via the API) is only used to prove
 * the phone number — when creating an account and when resetting a forgotten
 * password — never for everyday login.
 *
 *   log in : phone + password
 *   sign up: phone -> OTP -> create password -> profile
 *   reset  : phone -> OTP -> new password (signs in)
 *
 * The phone number is tagged with the active lead-source flag
 * (MERCHANT | LOCAL_BUYER | CONSULTANCY_LEAD) for audience routing.
 */
type Mode = "login" | "signup" | "reset";
type Step = "phone" | "otp" | "password" | "profile";

const SIGNUP_STEPS = ["Verify phone", "Password", "Profile"];
const stepIndex = (step: Step) => (step === "profile" ? 2 : step === "password" ? 1 : 0);

const TITLES: Record<Mode, Partial<Record<Step, string>>> = {
  login: { phone: "Welcome back", profile: "Complete Your Profile" },
  signup: { phone: "Create your account", otp: "Verify your number", password: "Create a password", profile: "Complete Your Profile" },
  reset: { phone: "Reset your password", otp: "Verify your number", password: "Set a new password", profile: "Complete Your Profile" },
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function AuthModal() {
  const { modalOpen, closeModal, sendOtp, verifyOtp, login, signup, resetPassword, completeProfile, finishLogin, pendingSource } =
    useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [proof, setProof] = useState("");
  const [consent, setConsent] = useState(false);
  const [timer, setTimer] = useState(0);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState<"business" | "individual">(
    pendingSource === "MERCHANT" ? "business" : "individual",
  );
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep("phone");
    setPassword("");
    setLoginError(null);
    setOtp("");
    setProof("");
    setTestCode(null);
  };

  useEffect(() => {
    if (!modalOpen) {
      switchMode("login");
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

  /** Signed in: go to the profile step if it's missing, otherwise finish. */
  const afterSignIn = async (needsProfile: boolean, welcome: string) => {
    if (needsProfile) {
      setStep("profile");
      toast.success(welcome, { description: "One last step to personalize your account" });
    } else {
      await finishLogin();
      toast.success(welcome);
    }
  };

  const doLogin = async () => {
    setLoginError(null);
    if (!PHONE_RE.test(phone)) {
      setLoginError(phoneError(phone) ?? "Enter your 10-digit mobile number");
      return;
    }
    if (!password) {
      setLoginError("Enter your password");
      return;
    }
    setBusy(true);
    try {
      const { needsProfile } = await login(phone, password);
      await afterSignIn(needsProfile, "Welcome back");
    } catch (e) {
      setLoginError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async (resend = false) => {
    if (!PHONE_RE.test(phone)) {
      toast.error(phoneError(phone) ?? "Enter your 10-digit mobile number");
      return;
    }
    if (mode === "signup" && !consent) {
      toast.error("Please accept the consent to continue");
      return;
    }
    setBusy(true);
    try {
      const sent = await sendOtp(phone, mode === "reset" ? "reset" : "signup", consent);
      setTestCode(sent.devOtpHint ?? null);
      setStep("otp");
      setTimer(30);
      toast.success(
        sent.devOtpHint ? "Test mode — no SMS is sent yet" : resend ? "OTP resent" : `OTP sent to +91 ${phone}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Already has an account — send them to the login screen with their number kept.
        switchMode("login");
        setLoginError(e.message);
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (otp.length !== OTP_LENGTH) {
      toast.error(`Enter the ${OTP_LENGTH}-digit OTP`);
      return;
    }
    setBusy(true);
    try {
      setProof(await verifyOtp(phone, otp, mode === "reset" ? "reset" : "signup"));
      setStep("password");
      toast.success("Phone verified");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    const problem = passwordError(password, phone) ?? (password ? null : "Choose a password");
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const { needsProfile } =
        mode === "reset" ? await resetPassword(proof, password) : await signup(proof, password, consent);
      await afterSignIn(needsProfile, mode === "reset" ? "Password updated" : "Account created");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // The phone check timed out (or was already used) — start that step over.
        setStep("phone");
        setOtp("");
        setProof("");
      }
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
    const problem =
      nameError(fullName) ??
      emailError(normalizedEmail) ??
      (accountType === "business" && businessName.trim().length < 2 ? "Enter your business or store name" : null) ??
      (city.trim().length < 2 ? "Enter your city or locality" : null);
    if (problem) {
      toast.error(problem);
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

  const phoneRow = (onEnter: () => void) => (
    <>
      <div className="flex items-center gap-2">
        <span className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
          +91
        </span>
        <Input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          placeholder="Your phone number"
          aria-label="Your phone number"
          aria-invalid={!!phoneError(phone)}
          value={phone}
          onChange={(e) => setPhone(phoneInput(e.target.value))}
          // Block non-digit keys outright; paste is cleaned by phoneInput.
          onKeyDown={(e) => {
            if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
            if (e.key === "Enter") onEnter();
          }}
        />
      </div>
      <FieldError message={phoneError(phone)} />
    </>
  );

  return (
    <Dialog open={modalOpen} onOpenChange={(o) => !o && step !== "profile" && closeModal()}>
      <DialogContent className="panel max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="size-5 text-gold" />
            {TITLES[mode][step]}
          </DialogTitle>
        </DialogHeader>

        {mode === "signup" && (
          <ol className="flex items-center gap-2 text-xs font-semibold text-muted-foreground" aria-label="Sign-up progress">
            {SIGNUP_STEPS.map((label, i) => {
              const current = stepIndex(step);
              return (
                <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full ${i <= current ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {i + 1}
                  </span>
                  <span className={i === current ? "text-primary" : ""}>{label}</span>
                  {i < SIGNUP_STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
                </li>
              );
            })}
          </ol>
        )}

        {step === "phone" && mode === "login" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void doLogin();
            }}
          >
            {phoneRow(() => undefined)}
            <div className="space-y-1.5">
              <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
              <div className="text-right">
                <Button type="button" variant="link" className="h-auto p-0 text-sm text-gold" onClick={() => switchMode("reset")}>
                  Forgot password?
                </Button>
              </div>
            </div>
            <FieldError message={loginError} />
            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn className="size-4" /> {busy ? "Logging in…" : "Log in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Button type="button" variant="link" className="h-auto p-0 text-gold" onClick={() => switchMode("signup")}>
                Create an account
              </Button>
            </p>
          </form>
        ) : step === "phone" ? (
          <div className="space-y-4">
            {mode === "reset" && (
              <p className="text-sm text-muted-foreground">
                Enter your mobile number — we’ll text you a code to confirm it’s you, then you can choose a new password.
              </p>
            )}
            {phoneRow(() => void sendCode())}

            {mode === "signup" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span>
                  I agree to receive service updates, promotions, and offers from Babuki and its parent
                  company, Me2Us4U (OPC) Pvt Ltd.
                </span>
              </label>
            )}

            <Button className="w-full" onClick={() => void sendCode()} disabled={busy}>
              <Smartphone className="size-4" /> {busy ? "Sending…" : "Send OTP"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Already have an account? " : "Remembered it? "}
              <Button type="button" variant="link" className="h-auto p-0 text-gold" onClick={() => switchMode("login")}>
                Log in
              </Button>
            </p>
          </div>
        ) : step === "otp" ? (
          <OtpStep
            phone={phone}
            otp={otp}
            onOtp={setOtp}
            testCode={testCode}
            timer={timer}
            busy={busy}
            onVerify={() => void verify()}
            onResend={() => void sendCode(true)}
            onChangeNumber={() => setStep("phone")}
          />
        ) : step === "password" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {mode === "reset"
                ? "Choose a new password. You’ll be signed in straight away."
                : "This is what you’ll use to log in from now on — no OTP needed."}
            </p>
            <PasswordField
              id="new-password"
              label={mode === "reset" ? "New password" : "Create a password"}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="Choose a password"
              showRules
              phoneDigits={phone}
              onEnter={() => void savePassword()}
              autoFocus
            />
            <Button className="w-full" onClick={() => void savePassword()} disabled={busy}>
              <KeyRound className="size-4" />{" "}
              {busy ? "Saving…" : mode === "reset" ? "Save password & log in" : "Create account"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We’ll use these details to pre-fill your requests and storefront setup.
            </p>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input id="profile-name" autoComplete="name" value={fullName} maxLength={LIMITS.fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
              <FieldError message={nameError(fullName)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">
                Email address <span className="font-normal text-muted-foreground">(recommended)</span>
              </Label>
              <Input id="profile-email" type="email" autoComplete="email" value={email} maxLength={LIMITS.email} onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))} placeholder="Your email address" />
              <FieldError message={emailError(email)} />
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
                <Input id="profile-business" autoComplete="organization" value={businessName} maxLength={LIMITS.business} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="profile-city">City / locality</Label>
              <Input id="profile-city" autoComplete="address-level2" value={city} maxLength={LIMITS.city} onChange={(e) => setCity(e.target.value)} placeholder="Your city or locality" />
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
