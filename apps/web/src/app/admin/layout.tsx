import type { Metadata } from "next";

// Internal console: keep it out of search results (robots.txt also disallows it).
export const metadata: Metadata = {
  title: "Babuki admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
