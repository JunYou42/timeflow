"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarRange } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectTimelineItem } from "@/lib/stats";
import {
  addDaysInTimezone,
  addMonthsInTimezone,
  formatDuration,
  formatInTimezone,
  startOfDayInTimezone,
  startOfMonthInTimezone,
  startOfQuarterInTimezone,
  startOfWeekInTimezone,
  startOfYearInTimezone,
  type DateRange,
} from "@/lib/time";
import {
  PROJECT_QUADRANT_LABELS,
  type Project,
  type ProjectQuadrant,
  type ProjectUpdate,
  type ProjectWithStats,
  type UUID,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Width reserved on the left for the gridline labels. */
const GUTTER_PX = 76;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Finest granularity worth rendering; beyond this the track is mostly empty. */
const MAX_TRACK_PX = 6000;
/** Safety valve so an extreme manual zoom cannot generate unbounded DOM. */
const MAX_TICKS = 2000;
/** Pointer travel before a press is treated as a drag instead of a click. */
const DRAG_THRESHOLD_PX = 4;
/** How long a finished drag keeps swallowing the click it would otherwise emit. */
const CLICK_SUPPRESS_MS = 300;
/** Gap between the top of the visible track and a name that scrolled out of its bar. */
const PINNED_LABEL_GAP_PX = 4;

type ScaleKey = "day" | "week" | "month" | "quarter" | "year";

interface TimelineScale {
  key: ScaleKey;
  /** Button glyph. */
  label: string;
  title: string;
  /** Vertical pixels a single day occupies, so bars and gridlines share a scale. */
  pxPerDay: number;
  /** A bar never renders shorter than this, so brief projects stay clickable. */
  minBarPx: number;
  /** Gridline cadence and gutter label pattern at this scale. */
  tickFormat: string;
  /** Label used when a tick also starts a new year, so years stay readable. */
  majorFormat: string;
}

/**
 * Granularity, not just pixel density: the coarser the scale, the fewer
 * gridlines a long project spans. `day` is the finest unit, `year` the coarsest.
 */
const SCALES: TimelineScale[] = [
  {
    key: "day",
    label: "D",
    title: "Days",
    pxPerDay: 36,
    minBarPx: 30,
    tickFormat: "MM-dd EEE",
    majorFormat: "MMM d yyyy",
  },
  {
    key: "week",
    label: "W",
    title: "Weeks",
    pxPerDay: 10,
    minBarPx: 26,
    tickFormat: "MM-dd",
    majorFormat: "MMM d",
  },
  {
    key: "month",
    label: "M",
    title: "Months",
    pxPerDay: 3,
    minBarPx: 20,
    tickFormat: "MMM",
    majorFormat: "MMM yyyy",
  },
  {
    key: "quarter",
    label: "Q",
    title: "Quarters",
    pxPerDay: 1,
    minBarPx: 16,
    tickFormat: "QQQ",
    majorFormat: "QQQ yyyy",
  },
  {
    key: "year",
    label: "Y",
    title: "Years",
    pxPerDay: 0.25,
    minBarPx: 14,
    tickFormat: "yyyy",
    majorFormat: "yyyy",
  },
];

const QUADRANT_CLASSES: Record<ProjectQuadrant, string> = {
  do: "border-transparent bg-red-100 text-red-700",
  plan: "border-transparent bg-sky-100 text-sky-700",
  delegate: "border-transparent bg-amber-100 text-amber-800",
  drop: "border-transparent bg-slate-100 text-slate-600",
};

interface TimelineTick {
  key: string;
  at: Date;
  label: string;
  major: boolean;
}

/** Which part of the bar the press started on. */
type DragIntent = "body" | "start" | "end";
type DragMode = "move" | "resize-start" | "resize-end" | "reorder";

interface DragPreview {
  projectId: UUID;
  startMs: number;
  endMs: number;
  /** Lanes the bar has been pushed sideways, open for the priority shuffle. */
  laneShift: number;
  mode: DragMode;
}

interface DragSession {
  project: ProjectWithStats;
  intent: DragIntent;
  /** Decided once the pointer passes the threshold, from the dominant axis. */
  mode: DragMode | null;
  originStartMs: number;
  originEndMs: number;
  originLane: number;
  laneCount: number;
  /** One lane's width, measured when the drag began. */
  laneWidthPx: number;
  startX: number;
  startY: number;
  preview: DragPreview | null;
}

/** First boundary of `unit` at or before `instant`, observed in `timezone`. */
function tickStart(instant: Date, timezone: string, unit: ScaleKey): Date {
  switch (unit) {
    case "day":
      return startOfDayInTimezone(instant, timezone);
    case "week":
      return startOfWeekInTimezone(instant, timezone);
    case "month":
      return startOfMonthInTimezone(instant, timezone);
    case "quarter":
      return startOfQuarterInTimezone(instant, timezone);
    case "year":
      return startOfYearInTimezone(instant, timezone);
  }
}

/** Next boundary after `instant`. Weeks step 7 days so the weekday is preserved. */
function tickNext(instant: Date, timezone: string, unit: ScaleKey): Date {
  switch (unit) {
    case "day":
      return addDaysInTimezone(instant, 1, timezone);
    case "week":
      return addDaysInTimezone(instant, 7, timezone);
    case "month":
      return addMonthsInTimezone(instant, 1, timezone);
    case "quarter":
      return addMonthsInTimezone(instant, 3, timezone);
    case "year":
      return addMonthsInTimezone(instant, 12, timezone);
  }
}

function buildTicks(range: DateRange, timezone: string, scale: TimelineScale): TimelineTick[] {
  const rangeStartMs = range.start.getTime();
  const rangeEndMs = range.end.getTime();
  const ticks: TimelineTick[] = [];

  let cursor = tickStart(range.start, timezone, scale.key);
  for (let i = 0; i < MAX_TICKS && cursor.getTime() < rangeEndMs; i += 1) {
    if (cursor.getTime() >= rangeStartMs) {
      const major = cursor.getTime() === startOfYearInTimezone(cursor, timezone).getTime();
      ticks.push({
        key: cursor.toISOString(),
        at: cursor,
        label: formatInTimezone(cursor, timezone, major ? scale.majorFormat : scale.tickFormat),
        major,
      });
    }
    cursor = tickNext(cursor, timezone, scale.key);
  }

  return ticks;
}

/** Finest scale that keeps a range of `spanDays` within a comfortable height. */
function fitScale(spanDays: number): ScaleKey {
  return (
    SCALES.find((scale) => spanDays * scale.pxPerDay <= MAX_TRACK_PX)?.key ??
    SCALES[SCALES.length - 1].key
  );
}

/** Minutes -> "2h 30m"; blank stays blank so the row collapses cleanly. */
function formatMinutes(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  return formatDuration(minutes * 60, { compact: true });
}

/** Hours -> "40h" / "1.5h"; blank stays blank so the row collapses cleanly. */
function formatHours(hours: number | null): string | null {
  if (hours == null || hours <= 0) return null;
  return `${Math.round(hours * 100) / 100}h`;
}

/** Human span label: "45 days" / "8 months" / "2.4 years". */
function formatSpan(days: number): string {
  if (days < 60) return `${days} days`;
  if (days < 720) return `${Math.round(days / 30)} months`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} ${years === 1 ? "year" : "years"}`;
}

function formatWindow(item: ProjectTimelineItem, timezone: string, withYear: boolean): string {
  const pattern = withYear ? "MMM d yyyy" : "MMM d";
  const { start_date, end_date } = item.project;
  const start = start_date ? formatInTimezone(start_date, timezone, pattern) : null;
  const end = end_date ? formatInTimezone(end_date, timezone, pattern) : null;
  if (start && end) return `${start} → ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "No dates";
}

/**
 * Dates a drag should write back.
 *
 * `move` always materialises a full window, which is exactly what an undated
 * project pinned to today needs. A resize only touches the edge it grabbed, so
 * a project that intentionally has one open end does not silently gain the other.
 */
function windowPatch(
  project: Pick<Project, "start_date" | "end_date">,
  mode: DragMode,
  startMs: number,
  endMs: number
): ProjectUpdate {
  const unscheduled = !project.start_date && !project.end_date;
  const patch: ProjectUpdate = {};
  if (mode === "move" || mode === "resize-start" || unscheduled) {
    patch.start_date = new Date(startMs).toISOString();
  }
  if (mode === "move" || mode === "resize-end" || unscheduled) {
    patch.end_date = new Date(endMs).toISOString();
  }
  return patch;
}

/**
 * Where a bar sits on the track, honouring an in-flight drag preview so the bar
 * and its pinned name stay together while it moves.
 */
function barBox(
  item: ProjectTimelineItem,
  preview: DragPreview | null,
  rangeStartMs: number,
  pxPerDay: number,
  minBarPx: number
): { active: DragPreview | null; top: number; height: number; laneShift: number } {
  const active = preview?.projectId === item.project.id ? preview : null;
  const top = active
    ? ((active.startMs - rangeStartMs) / DAY_MS) * pxPerDay
    : item.offsetMs * (pxPerDay / DAY_MS);
  const durationMs = active ? active.endMs - active.startMs : item.durationMs;
  return {
    active,
    top,
    height: Math.max((durationMs / DAY_MS) * pxPerDay, minBarPx),
    laneShift: active?.laneShift ?? 0,
  };
}

export function ProjectTimelineBoard({
  items,
  range,
  timezone,
  onSelectProject,
  onUpdateWindow,
  onReorder,
}: {
  items: ProjectTimelineItem[];
  range: DateRange;
  timezone: string;
  onSelectProject: (project: ProjectWithStats) => void;
  onUpdateWindow: (projectId: UUID, patch: ProjectUpdate) => void;
  onReorder: (projectId: UUID, laneShift: number) => void;
}) {
  // `null` means "not chosen yet": the board picks a scale that fits the range,
  // so a two-year roadmap is not rendered at 36px per day.
  const [chosenScale, setChosenScale] = useState<ScaleKey | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const lastDragEndRef = useRef(0);

  const rangeStartMs = range.start.getTime();
  const rangeEndMs = range.end.getTime();
  const spanDays = Math.max(1, Math.round((rangeEndMs - rangeStartMs) / DAY_MS));

  const scale = SCALES.find((candidate) => candidate.key === (chosenScale ?? fitScale(spanDays)))!;
  const { pxPerDay, minBarPx, key: scaleKey } = scale;
  const trackHeight = Math.max(pxPerDay, spanDays * pxPerDay);
  const msPerPx = DAY_MS / pxPerDay;

  const ticks = useMemo(() => buildTicks(range, timezone, scale), [range, timezone, scale]);

  const now = useMemo(() => new Date(), []);
  const nowOffset = (now.getTime() - rangeStartMs) * (pxPerDay / DAY_MS);
  const showTodayLine = nowOffset >= 0 && nowOffset <= trackHeight;

  const scrollToToday = () => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({
      top: Math.max(0, (showTodayLine ? nowOffset : 0) - node.clientHeight / 2),
      behavior: "smooth",
    });
  };

  // Centre on today on mount and keep that anchor when the scale changes.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !showTodayLine) return;
    node.scrollTop = Math.max(0, nowOffset - node.clientHeight / 2);
  }, [nowOffset, showTodayLine]);

  // Drags run on window listeners: the bar re-renders on every frame, and the
  // pointer routinely leaves it while resizing or scrolling the track.
  useEffect(() => {
    if (!dragging) return;

    const snapDays = (deltaMs: number) => Math.round(deltaMs / DAY_MS) * DAY_MS;

    const onPointerMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;

      if (!session.mode) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        session.mode =
          session.intent === "start"
            ? "resize-start"
            : session.intent === "end"
              ? "resize-end"
              : Math.abs(dx) > Math.abs(dy)
                ? "reorder"
                : "move";
      }

      let startMs = session.originStartMs;
      let endMs = session.originEndMs;
      let laneShift = 0;

      if (session.mode === "reorder") {
        if (session.laneWidthPx > 0) {
          const raw = Math.round(dx / session.laneWidthPx);
          laneShift = Math.max(
            -session.originLane,
            Math.min(session.laneCount - 1 - session.originLane, raw)
          );
        }
      } else {
        // Whole days only, so a dragged window keeps its time of day.
        const deltaMs = snapDays(dy * msPerPx);
        if (session.mode === "move") {
          startMs = session.originStartMs + deltaMs;
          endMs = session.originEndMs + deltaMs;
        } else if (session.mode === "resize-start") {
          startMs = Math.min(session.originStartMs + deltaMs, session.originEndMs - DAY_MS);
        } else {
          endMs = Math.max(session.originEndMs + deltaMs, session.originStartMs + DAY_MS);
        }
      }

      const next: DragPreview = {
        projectId: session.project.id,
        startMs,
        endMs,
        laneShift,
        mode: session.mode,
      };
      session.preview = next;
      setPreview(next);
    };

    const onPointerUp = () => {
      const session = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      setPreview(null);
      if (!session) return;

      const outcome = session.preview;
      // A press that never moved is left to the click handler, which also covers
      // keyboard activation.
      if (!outcome) return;

      lastDragEndRef.current = Date.now();
      if (outcome.mode === "reorder") {
        if (outcome.laneShift !== 0) onReorder(session.project.id, outcome.laneShift);
        return;
      }
      onUpdateWindow(
        session.project.id,
        windowPatch(session.project, outcome.mode, outcome.startMs, outcome.endMs)
      );
    };

    const onPointerCancel = () => {
      dragRef.current = null;
      setDragging(false);
      setPreview(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [dragging, msPerPx, onReorder, onUpdateWindow]);

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    item: ProjectTimelineItem,
    intent: DragIntent
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const track = trackRef.current;
    dragRef.current = {
      project: item.project,
      intent,
      mode: null,
      originStartMs: item.startMs,
      originEndMs: item.endMs,
      originLane: item.lane,
      laneCount: item.laneCount,
      laneWidthPx: track ? track.getBoundingClientRect().width / item.laneCount : 0,
      startX: event.clientX,
      startY: event.clientY,
      preview: null,
    };
    setDragging(true);
  };

  const withYear = spanDays > 365;

  // A long bar scrolls its own name out of the viewport long before the bar
  // itself leaves, which turns the rest of it into an anonymous block. Those
  // names get re-drawn just under the top edge of the visible track, so every
  // bar on screen is identifiable.
  const pinnedLabels = items
    .map((item) => ({ item, box: barBox(item, preview, rangeStartMs, pxPerDay, minBarPx) }))
    .filter(({ box }) => box.top < scrollTop && box.top + box.height > scrollTop + PINNED_LABEL_GAP_PX);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "project" : "projects"} · {formatSpan(spanDays)}
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            Drag a bar to move it, its edges to resize, or sideways to change priority.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={scrollToToday}
            disabled={!showTodayLine}
          >
            <CalendarRange className="size-4" />
            Today
          </Button>
          <div className="flex items-center gap-0.5 rounded-md border p-0.5" role="group">
            {SCALES.map((candidate) => (
              <Button
                key={candidate.key}
                type="button"
                size="sm"
                variant={scaleKey === candidate.key ? "secondary" : "ghost"}
                title={candidate.title}
                aria-label={candidate.title}
                aria-pressed={scaleKey === candidate.key}
                onClick={() => setChosenScale(candidate.key)}
                className="h-7 w-7 p-0 text-xs"
              >
                {candidate.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="relative max-h-[70vh] min-h-[320px] overflow-y-auto rounded-lg border bg-background"
      >
        <div className="relative" style={{ height: trackHeight }}>
          {ticks.map((tick) => (
            <div
              key={tick.key}
              className={cn(
                "absolute inset-x-0 border-t",
                tick.major ? "border-border" : "border-border/60"
              )}
              style={{ top: (tick.at.getTime() - rangeStartMs) * (pxPerDay / DAY_MS) }}
            >
              <span
                className={cn(
                  "absolute left-2 top-0.5 text-[10px] tabular-nums",
                  tick.major ? "font-medium text-foreground/70" : "text-muted-foreground"
                )}
              >
                {tick.label}
              </span>
            </div>
          ))}

          <div ref={trackRef} className="absolute inset-y-0" style={{ left: GUTTER_PX, right: 12 }}>
            {items.map((item) => {
              const project = item.project;
              const { active, top, height: barHeight, laneShift } = barBox(
                item,
                preview,
                rangeStartMs,
                pxPerDay,
                minBarPx
              );
              const detail = barHeight >= 52;
              const estimate = formatHours(project.estimated_hours);
              const taskEstimate = formatMinutes(project.task_estimated_minutes);

              return (
                <button
                  key={project.id}
                  type="button"
                  onPointerDown={(event) => beginDrag(event, item, "body")}
                  onClick={() => {
                    // A finished drag also emits a click; ignore it.
                    if (Date.now() - lastDragEndRef.current < CLICK_SUPPRESS_MS) return;
                    onSelectProject(project);
                  }}
                  title={`${project.name} · ${PROJECT_QUADRANT_LABELS[item.quadrant]}`}
                  className={cn(
                    "absolute select-none overflow-hidden rounded-md border border-l-4 bg-background px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !active && "cursor-grab",
                    active && "cursor-grabbing shadow-lg ring-2 ring-ring",
                    item.isUnscheduled && !active && "border-dashed"
                  )}
                  style={{
                    top,
                    height: barHeight,
                    left: `calc(${(item.lane / item.laneCount) * 100}% + 2px)`,
                    width: `calc(${100 / item.laneCount}% - 6px)`,
                    borderLeftColor: project.color,
                    backgroundColor: `${project.color}1a`,
                    transform: laneShift ? `translateX(${laneShift * 100}%)` : undefined,
                    // The track scrolls vertically; without this a touch drag
                    // would scroll the board instead of moving the bar.
                    touchAction: "none",
                    zIndex: active ? 20 : undefined,
                  }}
                >
                  {barHeight >= 24 ? (
                    <>
                      <span
                        onPointerDown={(event) => beginDrag(event, item, "start")}
                        className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                      />
                      <span
                        onPointerDown={(event) => beginDrag(event, item, "end")}
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                      />
                    </>
                  ) : null}

                  <div className="pointer-events-none flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium leading-tight">
                      {project.name}
                    </span>
                    {item.isUnscheduled && !active ? (
                      <Badge className="border-transparent bg-muted text-[10px] text-muted-foreground">
                        No dates
                      </Badge>
                    ) : null}
                  </div>

                  {detail ? (
                    <div className="pointer-events-none mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      <Badge className={cn("text-[10px]", QUADRANT_CLASSES[item.quadrant])}>
                        {PROJECT_QUADRANT_LABELS[item.quadrant]}
                      </Badge>
                      {active ? (
                        <span className="font-medium text-foreground">
                          {formatInTimezone(
                            new Date(active.startMs),
                            timezone,
                            withYear ? "MMM d yyyy HH:mm" : "MMM d HH:mm"
                          )}{" "}
                          →{" "}
                          {formatInTimezone(
                            new Date(active.endMs),
                            timezone,
                            withYear ? "MMM d yyyy HH:mm" : "MMM d HH:mm"
                          )}
                        </span>
                      ) : (
                        <span>{formatWindow(item, timezone, withYear)}</span>
                      )}
                      {estimate ? <span>Est {estimate}</span> : null}
                      {taskEstimate ? <span>Tasks {taskEstimate}</span> : null}
                      {project.task_count > 0 ? (
                        <span>
                          {project.done_task_count}/{project.task_count} done
                        </span>
                      ) : null}
                      {project.actual_seconds > 0 ? (
                        <span>{formatDuration(project.actual_seconds, { compact: true })} tracked</span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}

            {pinnedLabels.map(({ item, box }) => (
              // Mirrors the bar it belongs to: same lane column, same accent,
              // same sideways shift while a reorder drag is in flight.
              // Transparent to pointers so it never steals a drag from the bar.
              <div
                key={`pinned-${item.project.id}`}
                aria-hidden
                className="pointer-events-none absolute z-30 overflow-hidden rounded-md border border-l-4 bg-background px-2 py-0.5 shadow-sm"
                style={{
                  top: scrollTop + PINNED_LABEL_GAP_PX,
                  left: `calc(${(item.lane / item.laneCount) * 100}% + 2px)`,
                  width: `calc(${100 / item.laneCount}% - 6px)`,
                  borderLeftColor: item.project.color,
                  transform: box.laneShift ? `translateX(${box.laneShift * 100}%)` : undefined,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ backgroundColor: `${item.project.color}1a` }}
                />
                <span className="relative block truncate text-xs font-medium leading-tight">
                  {item.project.name}
                </span>
              </div>
            ))}

            {showTodayLine ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-destructive/70"
                style={{ top: nowOffset }}
              >
                <span className="absolute -top-2 right-0 rounded bg-destructive/90 px-1 text-[9px] font-medium text-destructive-foreground">
                  Today
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
