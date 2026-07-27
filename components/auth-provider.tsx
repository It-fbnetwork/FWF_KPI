"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { closeRealtimeClient } from "@/lib/client/realtime";
import { clearAppBootstrapCache, loadAppBootstrap } from "@/lib/client/bootstrap";
import { type Department, type UserAccount, type UserRole } from "@/lib/auth";

type RegisterInput = {
  name: string;
  email: string;
  role: UserRole;
  department: Department;
  storeRegion?: string;
  storeRegions?: string[];
  storeBranchIds?: number[];
  storeLeadUserId?: string;
};

type AuthContextValue = {
  user: UserAccount | null;
  users: UserAccount[];
  isReady: boolean;
  refreshSession: () => Promise<void>;
  requestLoginOtp: (email: string) => Promise<{ ok: boolean; message?: string; otp?: string }>;
  verifyLoginOtp: (email: string, otp: string) => Promise<{ ok: boolean; message?: string }>;
  requestRegistrationOtp: (input: RegisterInput) => Promise<{ ok: boolean; message?: string; otp?: string }>;
  verifyRegistrationOtp: (email: string, otp: string) => Promise<{ ok: boolean; message?: string; requiresApproval?: boolean }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isReady, setIsReady] = useState(false);

  const refreshSession = async () => {
    if (!isAuthPage) {
      const payload = await loadAppBootstrap({ force: true });
      setUser(payload.user);
      setUsers([]);
      return;
    }

    const response = await fetch("/api/auth/session?includeUsers=true", {
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Failed to load auth session.");
    }

    const payload = (await response.json()) as {
      user: UserAccount | null;
      users: UserAccount[];
    };

    setUsers(payload.users);
    setUser(payload.user);
  };

  useEffect(() => {
    let isMounted = true;

    const loadInitialState = async () => {
      if (!isAuthPage) {
        const payload = await loadAppBootstrap();
        if (!isMounted) {
          return;
        }

        setUser(payload.user);
        setUsers([]);
        return;
      }

      await refreshSession();
    };

    loadInitialState()
      .then(() => {
        if (!isMounted) {
          return;
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthPage]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      users,
      isReady,
      refreshSession,
      requestLoginOtp: async (email) => {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email })
        });

        return (await response.json()) as { ok: boolean; message?: string; otp?: string };
      },
      verifyLoginOtp: async (email, otp) => {
        const response = await fetch("/api/auth/login/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, otp })
        });

        const payload = (await response.json()) as { ok: boolean; message?: string; user?: UserAccount };
        if (!response.ok || !payload.ok || !payload.user) {
          return { ok: false, message: payload.message ?? "Đăng nhập thất bại." };
        }

        clearAppBootstrapCache();
        setUser(payload.user);
        return { ok: true };
      },
      requestRegistrationOtp: async (input) => {
        const response = await fetch("/api/auth/register/request-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(input)
        });
        const payload = (await response.json()) as { ok: boolean; message?: string; otp?: string };
        return payload;
      },
      verifyRegistrationOtp: async (email, otp) => {
        const response = await fetch("/api/auth/register/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, otp })
        });

        const payload = (await response.json()) as {
          ok: boolean;
          message?: string;
          user?: UserAccount;
          requiresApproval?: boolean;
        };
        if (!response.ok || !payload.ok) {
          return { ok: false, message: payload.message ?? "Xác minh OTP thất bại." };
        }

        if (!payload.user) {
          return { ok: true, message: payload.message, requiresApproval: payload.requiresApproval };
        }

        clearAppBootstrapCache();
        setUser(payload.user);
        setUsers((prevUsers) => {
          if (prevUsers.some((item) => item.id === payload.user?.id)) {
            return prevUsers;
          }

          return [...prevUsers, payload.user!];
        });
        return { ok: true };
      },
      logout: async () => {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include"
        });
        closeRealtimeClient();
        clearAppBootstrapCache();
        setUser(null);
        setUsers([]);
      }
    }),
    [isReady, user, users]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
