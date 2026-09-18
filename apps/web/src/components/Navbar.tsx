"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogIn, LogOut, Menu, UserRound, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/", label: "Home" },
  { to: "/shops", label: "Hyperlocal Shops" },
  { to: "/estimator", label: "Software Estimator" },
  { to: "/terms", label: "Contract & Terms" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, requestLogin, logout } = useAuth();

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              href={l.to}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-primary",
                isActive(l.to) && "bg-accent text-primary",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user?.profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 gap-2 rounded-full border-border px-2.5 shadow-none hover:border-gold/50 hover:bg-secondary/60 sm:px-3"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {user.profile.fullName.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-32 truncate text-xs font-semibold leading-tight">
                      {user.profile.fullName}
                    </span>
                    <span className="block max-w-32 truncate text-[10px] font-medium leading-tight text-muted-foreground">
                      {user.profile.accountType === "business"
                        ? user.profile.businessName
                        : "Individual / Buyer"}
                    </span>
                  </span>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <DropdownMenuLabel className="space-y-1">
                  <p className="font-semibold">{user.profile.fullName}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user.profile.email || user.phone}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <UserRound />{" "}
                  {user.profile.accountType === "business"
                    ? user.profile.businessName
                    : "Individual / Buyer"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void logout()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              className="h-9 rounded-full px-4 shadow-sm"
              onClick={() => requestLogin("LOCAL_BUYER")}
            >
              <LogIn className="size-3.5" /> Login
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-muted-foreground hover:bg-secondary hover:text-primary lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-border px-6 pb-4 pt-2 lg:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              href={l.to}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground",
                isActive(l.to) && "bg-accent text-primary",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
