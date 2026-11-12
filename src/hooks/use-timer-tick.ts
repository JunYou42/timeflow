"use client";

import { useEffect, useState } from "react";

import { computeTimerElapsedSeconds, toIso } from "@/lib/time";
import type { TimerSession } from "@/lib/types";

/**
 * A ticking clock value that is `null` during the first render.
 *
 * Returning `null` (instead of `Date.now()`) keeps server-rendered markup and
 * the first client render identical, which avoids hydration mismatches.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

/**
 * Elapsed seconds of `session`, recomputed from persisted timestamps on every
 * tick. The interval is a display concern only -- never the source of truth.
 */
export function useElapsedSeconds(session: TimerSession | null): number {
  const running = session?.status === "running";
  const now = useNow(running ? 1000 : 30_000);

  if (!session) return 0;
  if (!running) {
    return session.status === "paused" && session.paused_at
      ? computeTimerElapsedSeconds(session, session.paused_at)
      : session.accumulated_seconds;
  }
  if (now === null) return session.accumulated_seconds;
  return computeTimerElapsedSeconds(session, toIso(new Date(now)));
}

export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
