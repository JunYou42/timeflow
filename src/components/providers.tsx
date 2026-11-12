"use client";

import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/use-app-store";

/**
 * Boots the data layer exactly once and installs the global UI providers.
 *
 * The initial fetch lives here (rather than in each page) so that every route
 * shares one consistent snapshot -- essential for the dashboard, calendar and
 * timer to agree with each other.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const initialize = useAppStore((state) => state.initialize);
  const refresh = useAppStore((state) => state.refresh);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // A tab that regains focus after being backgrounded (timer running in another
  // tab, or laptop asleep) re-syncs from the store of record.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
