import Link from "next/link";
import { siteConfig } from "@/config/site";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/contracts", label: "Contracts" },
  { href: "/get-started", label: "Get Started" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold text-brand">
          {siteConfig.siteName}
        </Link>
        <nav className="flex gap-6 text-sm font-medium text-gray-700">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brand">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
