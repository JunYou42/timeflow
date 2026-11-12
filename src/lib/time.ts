import {
  addDays,
  addMonths,
  differenceInSeconds,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

import type { ISODateTime, TimerSession } from "@/lib/types";

export const FALLBACK_TIMEZONE =
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Shanghai";

export type RangePreset = "today" | "week" | "month" | "custom";

export interface DateRange {
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. */
  end: Date;
}

/* -------------------------------------------------------------------------- */
/* Timezone helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Best-effort IANA timezone of the current runtime, falling back to config. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Convert a UTC instant into the wall-clock representation of `timezone`. */
export function toZoned(instant: Date | string, timezone: string): Date {
  return toZonedTime(toDate(instant), timezone);
}

/** Convert a wall-clock date in `timezone` back into a real UTC instant. */
export function fromZoned(wallClock: Date, timezone: string): Date {
  return fromZonedTime(wallClock, timezone);
}

export function formatInTimezone(
  instant: Date | string,
  timezone: string,
  pattern: string
): string {
  return formatInTimeZone(toDate(instant), timezone, pattern);
}

/** Localised `datetime-local` input value (no timezone suffix). */
export function toLocalInputValue(instant: Date | string, timezone: string): string {
  return formatInTimezone(instant, timezone, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Parse a `datetime-local` string as wall-clock time in `timezone` and return
 * the corresponding UTC instant. Returns `null` when the input is unusable.
 */
export function parseLocalInputValue(
  value: string | null | undefined,
  timezone: string
): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s] = match;
  const wallClock = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
    0
  );
  return fromZoned(wallClock, timezone);
}

/* -------------------------------------------------------------------------- */
/* Date plumbing                                                               */
/* -------------------------------------------------------------------------- */

export function toDate(instant: Date | string): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

export function toIso(instant: Date | string): ISODateTime {
  return toDate(instant).toISOString();
}

export function nowIso(): ISODateTime {
  return new Date().toISOString();
}

/** Midnight of the day containing `instant`, observed in `timezone`. */
export function startOfDayInTimezone(instant: Date | string, timezone: string): Date {
  return fromZoned(startOfDay(toZoned(instant, timezone)), timezone);
}

export function endOfDayInTimezone(instant: Date | string, timezone: string): Date {
  return fromZoned(endOfDay(toZoned(instant, timezone)), timezone);
}

export function startOfWeekInTimezone(instant: Date | string, timezone: string): Date {
  return fromZoned(startOfWeek(toZoned(instant, timezone), { weekStartsOn: 1 }), timezone);
}

export function endOfWeekInTimezone(instant: Date | string, timezone: string): Date {
  return fromZoned(endOfWeek(toZoned(instant, timezone), { weekStartsOn: 1 }), timezone);
}

export function startOfMonthInTimezone(instant: Date | string, timezone: string): Date {
  return fromZoned(startOfMonth(toZoned(instant, timezone)), timezone);
}

export function endOfMonthInTimezone(instant: Date | string, timezone: string): Date {
  return fromZoned(endOfMonth(toZoned(instant, timezone)), timezone);
}

export function startOfQuarterInTimezone(instant: Date | string, timezone: string): Date {
  const zoned = toZoned(instant, timezone);
  return fromZoned(new Date(zoned.getFullYear(), Math.floor(zoned.getMonth() / 3) * 3, 1), timezone);
}

export function startOfYearInTimezone(instant: Date | string, timezone: string): Date {
  const zoned = toZoned(instant, timezone);
  return fromZoned(new Date(zoned.getFullYear(), 0, 1), timezone);
}

export function addDaysInTimezone(instant: Date | string, days: number, timezone: string): Date {
  return fromZoned(addDays(toZoned(instant, timezone), days), timezone);
}

export function addMonthsInTimezone(instant: Date | string, months: number, timezone: string): Date {
  return fromZoned(addMonths(toZoned(instant, timezone), months), timezone);
}

/**
 * Resolve a preset into a half-open `[start, end)` range expressed as UTC
 * instants, evaluated in the user's timezone. `end` is exclusive so that
 * `start_at >= start && start_at < end` never double counts midnight.
 */
export function resolveRange(
  preset: RangePreset,
  timezone: string,
  reference: Date | string = new Date(),
  custom?: { start: Date | string; end: Date | string }
): DateRange {
  switch (preset) {
    case "today":
      return {
        start: startOfDayInTimezone(reference, timezone),
        end: addDaysInTimezone(startOfDayInTimezone(reference, timezone), 1, timezone),
      };
    case "week":
      return {
        start: startOfWeekInTimezone(reference, timezone),
        end: addDaysInTimezone(startOfWeekInTimezone(reference, timezone), 7, timezone),
      };
    case "month":
      return {
        start: startOfMonthInTimezone(reference, timezone),
        // Advance one calendar month in the display zone so DST cannot skew the window.
        end: fromZoned(addMonths(startOfMonth(toZoned(reference, timezone)), 1), timezone),
      };
    case "custom": {
      if (!custom) {
        return {
          start: startOfDayInTimezone(reference, timezone),
          end: addDaysInTimezone(startOfDayInTimezone(reference, timezone), 1, timezone),
        };
      }
      const start = startOfDayInTimezone(custom.start, timezone);
      return {
        start,
        // `custom.end` is inclusive from the user's point of view.
        end: addDaysInTimezone(startOfDayInTimezone(custom.end, timezone), 1, timezone),
      };
    }
  }
}

/** YYYY-MM-DD key for `instant` in `timezone` (used for grouping). */
export function dayKey(instant: Date | string, timezone: string): string {
  return formatInTimezone(instant, timezone, "yyyy-MM-dd");
}

export function monthKey(instant: Date | string, timezone: string): string {
  return formatInTimezone(instant, timezone, "yyyy-MM");
}

/** Every YYYY-MM-DD between two instants (inclusive of start, exclusive of end). */
export function enumerateDayKeys(range: DateRange, timezone: string): string[] {
  const keys: string[] = [];
  let cursor = startOfDayInTimezone(range.start, timezone);
  const guard = 1000;
  for (let i = 0; i < guard && cursor.getTime() < range.end.getTime(); i += 1) {
    keys.push(dayKey(cursor, timezone));
    cursor = addDaysInTimezone(cursor, 1, timezone);
  }
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** "2h 15m", "45m", "30s" -- compact human readable duration. */
export function formatDuration(totalSeconds: number, options?: { compact?: boolean }): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    if (options?.compact && minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** "01:23:45" -- used by the live timer display. */
export function formatStopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Decimal hours with one decimal place, e.g. 2.4. */
export function secondsToHours(totalSeconds: number, digits = 1): number {
  const value = (totalSeconds || 0) / 3600;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function minutesToSeconds(minutes: number | null | undefined): number {
  return Math.max(0, Math.round((minutes ?? 0) * 60));
}

export function secondsToMinutes(totalSeconds: number): number {
  return Math.round((totalSeconds || 0) / 60);
}

/** Seconds between two instants, never negative. */
export function durationBetween(start: Date | string, end: Date | string): number {
  return Math.max(0, differenceInSeconds(toDate(end), toDate(start)));
}

/* -------------------------------------------------------------------------- */
/* Timer maths                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Elapsed seconds of a timer session evaluated at `now`.
 *
 * The database is the source of truth: elapsed time is always recomputed from
 * stored timestamps, never from a client-side interval counter.
 */
export function computeTimerElapsedSeconds(
  session: Pick<TimerSession, "status" | "started_at" | "paused_at" | "accumulated_seconds">,
  now: Date | string = new Date()
): number {
  const accumulated = Math.max(0, session.accumulated_seconds || 0);
  if (session.status === "running") {
    const runningFor = durationBetween(session.started_at, now);
    return accumulated + runningFor;
  }
  if (session.status === "paused" && session.paused_at) {
    const runningFor = durationBetween(session.started_at, session.paused_at);
    return accumulated + runningFor;
  }
  return accumulated;
}

/**
 * Fold the currently running segment into `accumulated_seconds` and close it.
 * Used by pause/stop so that persisted state is always self-consistent.
 */
export function freezeTimerSegment(
  session: Pick<TimerSession, "started_at" | "paused_at" | "accumulated_seconds">,
  at: Date = new Date()
): { accumulated_seconds: number; paused_at: ISODateTime } {
  return {
    accumulated_seconds: computeTimerElapsedSeconds({ ...session, status: "running" }, at),
    paused_at: at.toISOString(),
  };
}

export function formatDateLabel(instant: Date | string, timezone: string): string {
  return formatInTimezone(instant, timezone, "EEE, MMM d, yyyy");
}

export function formatTimeLabel(instant: Date | string, timezone: string): string {
  return formatInTimezone(instant, timezone, "HH:mm");
}

export function formatDateTimeLabel(instant: Date | string, timezone: string): string {
  return formatInTimezone(instant, timezone, "yyyy-MM-dd HH:mm");
}

export { format };
