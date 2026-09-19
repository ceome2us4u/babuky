"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { EMAIL_RE, LIMITS, emailError, nameError } from "@/lib/validate";

type Status = "idle" | "submitting" | "sent" | "error";

const MIN_MESSAGE = 5;

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("Something went wrong — please try again.");

  const valid =
    name.trim().length >= 2 && !nameError(name) && EMAIL_RE.test(email.trim()) && message.trim().length >= MIN_MESSAGE;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    setStatus("submitting");

    try {
      await apiPost("/contact", { name: name.trim(), email: email.trim(), message: message.trim() });
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "Something went wrong — please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="panel rounded-xl p-6 text-center">
        <BadgeCheck className="mx-auto size-8 text-gold" />
        <p className="mt-2 font-bold">Message received</p>
        <p className="text-sm text-muted-foreground">Thanks — we&apos;ll be in touch soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="panel space-y-4 rounded-xl p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="name"
          maxLength={LIMITS.fullName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <FieldError message={nameError(name)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={LIMITS.email}
          value={email}
          onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
          placeholder="Your email address"
        />
        <FieldError message={emailError(email)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          required
          rows={4}
          maxLength={LIMITS.message}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help you?"
        />
        <p className="text-right text-xs text-muted-foreground">
          {message.length}/{LIMITS.message}
        </p>
      </div>
      <Button type="submit" disabled={status === "submitting" || !valid}>
        {status === "submitting" ? "Sending…" : "Send message"}
      </Button>
      {status === "error" && <p className="text-sm text-destructive">{errorText}</p>}
    </form>
  );
}
