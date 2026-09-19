"use client";

import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MAX, passwordChecks } from "@/lib/validate";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  /** New-password screens list the rules and tick them off as they're met. */
  phoneDigits?: string;
  showRules?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
};

/**
 * Password box with a show/hide eye (so a second "confirm" box isn't needed —
 * people can see what they typed) and, for new passwords, a live checklist.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder = "Your password",
  phoneDigits = "",
  showRules = false,
  onEnter,
  autoFocus,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={PASSWORD_MAX}
          placeholder={placeholder}
          className="pr-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {showRules && (
        <ul className="space-y-1 text-xs" aria-label="Password rules">
          {passwordChecks(value, phoneDigits).map((rule) => (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 ${rule.ok ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              {rule.ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
              {rule.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
