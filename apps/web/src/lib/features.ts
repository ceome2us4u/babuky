"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

// Product switches, read from the API at runtime (GET /features) — never a
// build-time NEXT_PUBLIC_*, so flipping one needs no redeploy
// (scripts/set-own-domain.sh). EVERYTHING IS OFF until the API says otherwise:
// while loading, or if the API can't be reached, the site renders exactly as it
// did before the feature existed — no flash of an option that may not exist.

export type Features = { ownDomain: boolean };

const OFF: Features = { ownDomain: false };
let pending: Promise<Features> | null = null;

function load(): Promise<Features> {
  if (!pending) {
    pending = apiFetch<Partial<Features>>("/features")
      .then((f) => ({ ownDomain: f.ownDomain === true }))
      .catch(() => {
        pending = null; // try again on the next page that asks
        return OFF;
      });
  }
  return pending;
}

export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(OFF);
  useEffect(() => {
    let live = true;
    void load().then((f) => live && setFeatures(f));
    return () => {
      live = false;
    };
  }, []);
  return features;
}
