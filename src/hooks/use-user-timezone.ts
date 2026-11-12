"use client";

import { useMemo } from "react";

import { detectTimezone, FALLBACK_TIMEZONE } from "@/lib/time";
import { useAppStore } from "@/store/use-app-store";

/**
 * Timezone used for every date input, grouping and label in the UI.
 *
 * Timestamps are always stored in UTC; this is the display/render zone.
 */
export function useUserTimezone(): string {
  const profileTimezone = useAppStore((state) => state.profile?.timezone ?? null);
  return useMemo(
    () => profileTimezone || detectTimezone() || FALLBACK_TIMEZONE,
    [profileTimezone]
  );
}
