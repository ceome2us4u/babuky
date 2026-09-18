"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "@/lib/auth";
import { AuthModal } from "@/components/AuthModal";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <AuthModal />
      <Toaster theme="light" position="top-center" richColors />
    </AuthProvider>
  );
}
