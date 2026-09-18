"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the map is client-only.
const loading = () => <div className="h-full w-full animate-pulse bg-muted" />;

export const LocationPicker = dynamic(() => import("./maps-impl").then((m) => m.LocationPicker), {
  ssr: false,
  loading,
});

export const ShopsMap = dynamic(() => import("./maps-impl").then((m) => m.ShopsMap), {
  ssr: false,
  loading,
});

export type { ShopPin } from "./maps-impl";
