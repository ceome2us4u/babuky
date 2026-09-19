"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, apiPost } from "@/lib/api";

/**
 * Lead source flags. Every authenticated phone number is tagged with the
 * source(s) it came from; the API gates endpoints on them:
 *  - MERCHANT         -> shop owner onboarding (Track 1)
 *  - LOCAL_BUYER      -> nearby-shops discovery (Track 1, demand side)
 *  - CONSULTANCY_LEAD -> software scope estimator (Track 2)
 */
export type LeadSource = "MERCHANT" | "LOCAL_BUYER" | "CONSULTANCY_LEAD";

export type UserProfile = {
  fullName: string;
  email: string;
  accountType: "business" | "individual";
  businessName: string;
  city: string;
};

export type AuthUser = {
  phone: string; // +91XXXXXXXXXX
  leadSources: LeadSource[];
  profile: UserProfile | null;
};

type MeResponse = {
  phone: string;
  leadSources: LeadSource[];
  profile: {
    full_name: string;
    email: string;
    account_type: "business" | "individual";
    business_name: string;
    city: string;
  } | null;
};

function toUser(me: MeResponse): AuthUser {
  return {
    phone: me.phone,
    leadSources: me.leadSources,
    profile: me.profile && {
      fullName: me.profile.full_name,
      email: me.profile.email,
      accountType: me.profile.account_type,
      businessName: me.profile.business_name,
      city: me.profile.city,
    },
  };
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  requestLogin: (source: LeadSource, onSuccess?: () => void) => void;
  /** Tags the signed-in user with a lead source (the API gates endpoints on it). */
  ensureLeadSource: (source: LeadSource) => Promise<void>;
  closeModal: () => void;
  /** In the API's APP_MODE=test no SMS is sent and `devOtpHint` is the code to enter. */
  sendOtp: (phone: string, consent: boolean) => Promise<{ devOtpHint?: string }>;
  /** Verifies the OTP; resolves to whether the user still has to fill in a profile. */
  verifyOtp: (phone: string, otp: string, consent: boolean) => Promise<{ needsProfile: boolean }>;
  completeProfile: (profile: UserProfile) => Promise<void>;
  /** Called when OTP verify found an existing profile — no profile step needed. */
  finishLogin: () => Promise<void>;
  logout: () => Promise<void>;
  pendingSource: LeadSource;
  modalOpen: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState<LeadSource>("LOCAL_BUYER");
  const successCb = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<MeResponse>("/auth/me");
      const next = toUser(me);
      setUser(next);
      return next;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runSuccess = useCallback(() => {
    const cb = successCb.current;
    successCb.current = null;
    cb?.();
  }, []);

  const requestLogin = useCallback(
    (source: LeadSource, onSuccess?: () => void) => {
      setPendingSource(source);
      if (user?.profile) {
        // Already signed in — just add the new lead-source tag (the API gates
        // merchant/buyer/consultancy endpoints on it) and carry on.
        if (user.leadSources.includes(source)) {
          onSuccess?.();
          return;
        }
        apiPost("/auth/lead-source", { leadSource: source })
          .then(() => {
            setUser((u) => (u ? { ...u, leadSources: [...u.leadSources, source] } : u));
            onSuccess?.();
          })
          .catch(() => setModalOpen(true));
        return;
      }
      successCb.current = onSuccess ?? null;
      setModalOpen(true);
    },
    [user],
  );

  const ensureLeadSource = useCallback(
    async (source: LeadSource) => {
      if (!user || user.leadSources.includes(source)) return;
      await apiPost("/auth/lead-source", { leadSource: source });
      setUser((u) =>
        u && !u.leadSources.includes(source) ? { ...u, leadSources: [...u.leadSources, source] } : u,
      );
    },
    [user],
  );

  const sendOtp = useCallback(
    async (phone: string, consent: boolean) => {
      const res = await apiPost<{ devOtpHint?: string }>("/auth/otp/send", {
        phone,
        leadSource: pendingSource,
        consent,
      });
      return { devOtpHint: res.devOtpHint };
    },
    [pendingSource],
  );

  const verifyOtp = useCallback(
    async (phone: string, otp: string, consent: boolean) => {
      const res = await apiPost<{ hasProfile: boolean }>("/auth/otp/verify", {
        phone,
        otp,
        leadSource: pendingSource,
        consent,
      });
      return { needsProfile: !res.hasProfile };
    },
    [pendingSource],
  );

  const finishLogin = useCallback(async () => {
    await refresh();
    setModalOpen(false);
    runSuccess();
  }, [refresh, runSuccess]);

  const completeProfile = useCallback(
    async (profile: UserProfile) => {
      await apiPost("/auth/profile", profile);
      await finishLogin();
    },
    [finishLogin],
  );

  const logout = useCallback(async () => {
    await apiPost("/auth/logout", {}).catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      requestLogin,
      ensureLeadSource,
      closeModal: () => setModalOpen(false),
      sendOtp,
      verifyOtp,
      completeProfile,
      finishLogin,
      logout,
      pendingSource,
      modalOpen,
    }),
    [user, loading, requestLogin, ensureLeadSource, sendOtp, verifyOtp, completeProfile, finishLogin, logout, pendingSource, modalOpen],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
