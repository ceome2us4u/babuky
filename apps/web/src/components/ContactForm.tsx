"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";

type Status = "idle" | "submitting" | "sent" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      await apiPost("/contact", payload);
      setStatus("sent");
      form.reset();
    } catch {
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
    <form onSubmit={handleSubmit} className="panel space-y-4 rounded-xl p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" required rows={4} />
      </div>
      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send message"}
      </Button>
      {status === "error" && (
        <p className="text-sm text-destructive">Something went wrong — please try again.</p>
      )}
    </form>
  );
}
