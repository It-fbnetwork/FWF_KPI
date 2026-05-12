"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const COOLDOWN_MS = 2500;

export function PermissionAlertProvider() {
  const [open, setOpen] = useState(false);
  const lastShownAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch.bind(window);

    const wrappedFetch: typeof window.fetch = async (...args) => {
      const requestInput = args[0];
      const requestInit = args[1];
      const method = (() => {
        if (requestInit?.method) return requestInit.method.toUpperCase();
        if (typeof Request !== "undefined" && requestInput instanceof Request) {
          return requestInput.method.toUpperCase();
        }
        return "GET";
      })();
      const response = await originalFetch(...args);

      // Avoid noisy permission modal for background GET polling.
      if (response.status === 403 && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const now = Date.now();
        if (now - lastShownAtRef.current > COOLDOWN_MS) {
          lastShownAtRef.current = now;
          setOpen(true);
        }
      }

      return response;
    };

    window.fetch = wrappedFetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Không đủ quyền truy cập</DialogTitle>
          <DialogDescription>
            Bạn cần được cấp quyền để sử dụng tính năng này. Vui lòng liên hệ với admin hoặc quản lí để được hỗ trợ.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Đã hiểu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
