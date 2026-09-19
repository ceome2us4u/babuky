"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export type Place = { label: string; lat: number; lng: number };

/** "Bengaluru, Karnataka, India" is enough — drop the long tail Nominatim adds. */
const shortLabel = (label: string) => label.split(",").slice(0, 3).join(",").trim();

/**
 * Search for any town, locality or pincode in India, so the shop finder isn't
 * limited to where the person happens to be standing. Suggestions come from
 * the API's /geocode/search (OpenStreetMap), debounced.
 */
export function PlaceSearch({
  value,
  onPick,
  onClear,
}: {
  /** The place currently searched, or null for "my location". */
  value: Place | null;
  onPick: (p: Place) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Place[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 3) {
      setOptions([]);
      setStatus("idle");
      return;
    }
    let stale = false;
    setStatus("loading");
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{ places: Place[] }>(`/geocode/search?q=${encodeURIComponent(q)}`);
        if (stale) return;
        setOptions(res.places);
        setStatus(res.places.length === 0 ? "empty" : "idle");
      } catch {
        if (!stale) {
          setOptions([]);
          setStatus("error");
        }
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [text]);

  // Close the list when clicking elsewhere.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOptions([]);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gold/40 bg-secondary/50 px-3.5 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-gold" />
          <span className="truncate">
            Searching around <span className="font-semibold">{shortLabel(value.label)}</span>
          </span>
        </span>
        <button
          onClick={onClear}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gold hover:underline"
        >
          <X className="size-3.5" /> Use my location
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={text}
          maxLength={80}
          placeholder="Search another area — a town, locality or pincode"
          aria-label="Search another area"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {(options.length > 0 || status === "empty" || status === "error") && (
        <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {options.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button
                className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-secondary/60"
                onClick={() => {
                  onPick(p);
                  setText("");
                  setOptions([]);
                }}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>{p.label}</span>
              </button>
            </li>
          ))}
          {status === "empty" && <li className="px-3.5 py-2.5 text-sm text-muted-foreground">No place found — try a nearby town or a pincode.</li>}
          {status === "error" && (
            <li className="px-3.5 py-2.5 text-sm text-muted-foreground">Couldn&apos;t search right now — please try again in a moment.</li>
          )}
        </ul>
      )}
    </div>
  );
}
