import type { Metadata } from "next";

import { EstimatorView } from "@/components/estimator/EstimatorView";

export const metadata: Metadata = {
  title: "Software Scope & Cost Estimator — Babuki",
  description:
    "Build your software scope across deliverables, cloud infrastructure and telecom, and see a live budget range instantly.",
  openGraph: {
    title: "Software Scope & Cost Estimator — Babuki",
    description: "Transparent project scoping with a ₹100 refundable commitment deposit.",
  },
};

export default function EstimatorPage() {
  return <EstimatorView />;
}
