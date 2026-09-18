import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "My Storefront — Babuki",
  robots: { index: false },
};

export default function DashboardPage() {
  return <Dashboard />;
}
