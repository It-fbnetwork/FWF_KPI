"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isReady, user } = useAuth();

  useEffect(() => {
    if (isReady && !user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}` as Route);
    }
  }, [isReady, router, user]);

  if (!isReady || !user) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center text-muted">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  return <>{children}</>;
}
