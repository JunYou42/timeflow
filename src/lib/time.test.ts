import { describe, expect, it } from "vitest";

import {
  addMonthsInTimezone,
  computeTimerElapsedSeconds,
  dayKey,
  durationBetween,
  enumerateDayKeys,
  formatDuration,
  formatStopwatch,
  freezeTimerSegment,
  parseLocalInputValue,
  resolveRange,
  startOfDayInTimezone,
  startOfQuarterInTimezone,
  startOfYearInTimezone,
  toLocalInputValue,
  toZoned,
} from "@/lib/time";

const SHANGHAI = "Asia/Shanghai";

describe("timezone helpers", () => {
  it("renders a UTC instant in the target zone", () => {
    expect(dayKey("2026-11-10T16:00:00.000Z", SHANGHAI)).toBe("2026-11-11");
    expect(dayKey("2026-11-10T15:59:59.000Z", SHANGHAI)).toBe("2026-11-10");
  });

  it("round-trips a datetime-local value through the timezone", () => {
    const instant = parseLocalInputValue("2026-11-11T09:30", SHANGHAI);
    expect(instant?.toISOString()).toBe("2026-11-11T01:30:00.000Z");
    expect(toLocalInputValue(instant!, SHANGHAI)).toBe("2026-11-11T09:30");
  });

  it("returns null for unusable input", () => {
    expect(parseLocalInputValue("", SHANGHAI)).toBeNull();
    expect(parseLocalInputValue(null, SHANGHAI)).toBeNull();
  });

  it("computes local midnight", () => {
    expect(startOfDayInTimezone("2026-11-11T03:20:00.000Z", SHANGHAI).toISOString()).toBe(
      "2026-11-10T16:00:00.000Z"
    );
  });

  it("keeps the wall clock of the zone when converted for display", () => {
    const zoned = toZoned("2026-11-10T16:00:00.000Z", SHANGHAI);
    expect(zoned.getHours()).toBe(0);
    expect(zoned.getDate()).toBe(11);
  });
});

describe("calendar boundaries", () => {
  const reference = "2026-11-11T03:20:00.000Z";

  it("snaps to the start of the quarter", () => {
    // November is in Q4, which begins on 1 October local time.
    expect(startOfQuarterInTimezone(reference, SHANGHAI).toISOString()).toBe(
      "2026-09-30T16:00:00.000Z"
    );
  });

  it("snaps to the start of the year", () => {
    expect(startOfYearInTimezone(reference, SHANGHAI).toISOString()).toBe(
      "2025-12-31T16:00:00.000Z"
    );
  });

  it("advances whole months across the year boundary", () => {
    expect(addMonthsInTimezone("2026-11-11T01:30:00.000Z", 1, SHANGHAI).toISOString()).toBe(
      "2026-12-11T01:30:00.000Z"
    );
    // Three months after a quarter start lands exactly on the next quarter start.
    const q4 = startOfQuarterInTimezone(reference, SHANGHAI);
    expect(addMonthsInTimezone(q4, 3, SHANGHAI).toISOString()).toBe(
      startOfYearInTimezone("2027-01-01T00:00:00.000Z", SHANGHAI).toISOString()
    );
  });
});

describe("resolveRange", () => {
  const reference = "2026-11-11T03:20:00.000Z";

  it("returns a half-open window for today", () => {
    const range = resolveRange("today", SHANGHAI, reference);
    expect(range.start.toISOString()).toBe("2026-11-10T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-11T16:00:00.000Z");
    // The end instant belongs to the next day, so midnight is never double counted.
    expect(range.end.getTime() - range.start.getTime()).toBe(24 * 3600 * 1000);
  });

  it("starts the week on Monday", () => {
    const range = resolveRange("week", SHANGHAI, reference);
    expect(range.start.getTime()).toBeLessThan(new Date(reference).getTime());
    expect(range.end.getTime() - range.start.getTime()).toBe(7 * 24 * 3600 * 1000);
    const localStart = toZoned(range.start, SHANGHAI);
    expect(localStart.getDay()).toBe(1);
    expect(localStart.getHours()).toBe(0);
  });

  it("covers the whole month", () => {
    const range = resolveRange("month", SHANGHAI, reference);
    expect(range.start.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("treats a custom end date as inclusive", () => {
    const range = resolveRange("custom", SHANGHAI, reference, {
      start: "2026-11-02T00:00:00",
      end: "2026-11-04T00:00:00",
    });
    expect(range.start.toISOString()).toBe("2026-11-01T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-04T16:00:00.000Z");
  });
});

describe("enumerateDayKeys", () => {
  it("lists one key per day in the range", () => {
    const range = resolveRange("custom", "UTC", "2026-11-11T00:00:00.000Z", {
      start: "2026-11-10T00:00:00Z",
      end: "2026-11-12T00:00:00Z",
    });
    expect(enumerateDayKeys(range, "UTC")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  });
});

describe("duration helpers", () => {
  it("never returns a negative duration", () => {
    expect(durationBetween("2026-11-11T10:00:00Z", "2026-11-11T09:00:00Z")).toBe(0);
    expect(durationBetween("2026-11-11T09:00:00Z", "2026-11-11T10:30:00Z")).toBe(5400);
  });

  it("formats durations in a readable way", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(7200, { compact: true })).toBe("2h");
  });

  it("formats a stopwatch with padded units", () => {
    expect(formatStopwatch(0)).toBe("00:00:00");
    expect(formatStopwatch(3661)).toBe("01:01:01");
  });
});

describe("timer maths", () => {
  const started = "2026-11-11T09:00:00.000Z";

  it("derives elapsed time from timestamps rather than a counter", () => {
    expect(
      computeTimerElapsedSeconds(
        { status: "running", started_at: started, paused_at: null, accumulated_seconds: 0 },
        "2026-11-11T09:10:00.000Z"
      )
    ).toBe(600);
  });

  it("adds accumulated time for a paused session", () => {
    expect(
      computeTimerElapsedSeconds({
        status: "paused",
        started_at: "2026-11-11T09:30:00.000Z",
        paused_at: "2026-11-11T09:40:00.000Z",
        accumulated_seconds: 600,
      })
    ).toBe(1200);
  });

  it("freezes the running segment when pausing", () => {
    const frozen = freezeTimerSegment(
      { started_at: started, paused_at: null, accumulated_seconds: 300 },
      new Date("2026-11-11T09:05:00.000Z")
    );
    expect(frozen.accumulated_seconds).toBe(600);
    expect(frozen.paused_at).toBe("2026-11-11T09:05:00.000Z");
  });

  it("ignores time after the pause instant", () => {
    const paused = {
      status: "paused" as const,
      started_at: started,
      paused_at: "2026-11-11T09:10:00.000Z",
      accumulated_seconds: 0,
    };
    expect(computeTimerElapsedSeconds(paused, "2026-11-11T15:00:00.000Z")).toBe(600);
  });
});
