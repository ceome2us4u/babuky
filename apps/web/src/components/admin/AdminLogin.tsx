"use client";

import { useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";

import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { emailError } from "@/lib/validate";

/** Email + password sign-in for the founder's console. */
export function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || emailError(email)) return setError("Enter your email address");
    if (!password) return setError("Enter your password");
    setBusy(true);
    try {
      await apiPost("/admin/login", { email: email.trim(), password });
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="panel rounded-xl p-6">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="size-5 text-gold" />
          <h1 className="text-xl font-bold">Babuki admin</h1>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              maxLength={255}
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
              autoFocus
            />
          </div>
          <PasswordField id="admin-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <FieldError message={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            <LogIn className="size-4" /> {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Internal use only.</p>
    </div>
  );
}
