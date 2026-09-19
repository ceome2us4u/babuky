"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { SELECT_CLASS } from "@/components/admin/shared";

const NOTES_MAX = 2000;

/**
 * Status + private notes on an enquiry ("called Friday, wants a demo"). Saved
 * through PATCH /admin/<path>/:id, which also writes the audit log.
 */
export function FollowUp<S extends string>({
  path,
  id,
  statuses,
  status,
  notes,
  onSaved,
  onExpired,
}: {
  path: "estimates" | "messages";
  id: string;
  statuses: readonly S[];
  status: S;
  notes: string;
  onSaved: (next: { status: S; admin_notes: string }) => void;
  onExpired: () => void;
}) {
  const [s, setS] = useState<S>(status);
  const [n, setN] = useState(notes);
  const [busy, setBusy] = useState(false);
  const dirty = s !== status || n !== notes;

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ item: { status: S; admin_notes: string } }>(`/admin/${path}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: s, notes: n }),
      });
      onSaved(res.item);
      toast.success("Saved");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Follow-up (only you see this)</p>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`status-${id}`}>Status</Label>
          <select id={`status-${id}`} className={`${SELECT_CLASS} w-full capitalize`} value={s} onChange={(e) => setS(e.target.value as S)}>
            {statuses.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`notes-${id}`}>Notes</Label>
          <Textarea
            id={`notes-${id}`}
            rows={3}
            maxLength={NOTES_MAX}
            value={n}
            onChange={(e) => setN(e.target.value)}
            placeholder="What was said, what happens next…"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
