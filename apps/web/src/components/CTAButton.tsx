import Link from "next/link";
import type { ComponentProps } from "react";

type CTAButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
} & Omit<ComponentProps<typeof Link>, "href">;

export function CTAButton({ href, children, variant = "primary", className, ...rest }: CTAButtonProps) {
  const base = "inline-block rounded-md px-5 py-3 text-sm font-semibold transition-colors";
  const styles =
    variant === "primary"
      ? "bg-brand text-white hover:bg-brand-dark"
      : "border border-brand text-brand hover:bg-brand/5";

  return (
    <Link href={href} className={[base, styles, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Link>
  );
}
