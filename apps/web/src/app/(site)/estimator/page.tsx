import type { Metadata } from "next";

import { EstimatorView } from "@/components/estimator/EstimatorView";

export const metadata: Metadata = {
  title: "Build Custom Software — Get a Price Estimate — Babuki",
  description:
    "Find out what a website, online shop or mobile app for your business could cost. Tick what you need and see a price range instantly — no technical knowledge needed.",
  openGraph: {
    title: "Build Custom Software — Get a Price Estimate — Babuki",
    description: "A website, online shop or mobile app for your business. See the price range first, pay nothing to see it.",
  },
};

export default function EstimatorPage() {
  return <EstimatorView />;
}
