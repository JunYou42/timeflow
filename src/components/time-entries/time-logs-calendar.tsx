"use client";

import { useMemo, useRef, useState } from "react";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { DateClickArg, EventReceiveArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/time";
import type { TimeEntry } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

const TIMER_COLOR = "#6366f1";
const MANUAL_COLOR = "#0ea5e9";

const VIEWS = [
  { label: "Day", view: "timeGridDay" },
  { label: "Week", view: "timeGridWeek" },
  { label: "Month", view: "dayGridMonth" },
] as const;

interface TimeLogsCalendarProps {
  /** Entries already narrowed by the task / source filters and the visible period. */
  entries: TimeEntry[];
  onSelectEntry: (entry: TimeEntry) => void;
  onCreateEntry: (start: Date, end: Date) => void;
  /** Fired whenever the visible period changes, so the page can scope its stats. */
  onRangeChange: (range: { start: Date; end: Date }) => void;
}

/**
 * Time Logs calendar.
 *
 * Where the Calendar page plots the *plan* (`schedules`), this plots what
 * actually happened (`time_entries`). Dragging a block or one of its edges
 * rewrites the entry's window, and the repository recomputes the duration.
 * Dropping a task or project in from the pick-up area logs the time; clicking a
 * block opens the full form, where it can also be deleted.
 */
export function TimeLogsCalendar({
  entries,
  onSelectEntry,
  onCreateEntry,
  onRangeChange,
}: TimeLogsCalendarProps) {
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const updateTimeEntry = useAppStore((state) => state.updateTimeEntry);
  const createTimeEntry = useAppStore((state) => state.createTimeEntry);

  const calendarRef = useRef<FullCalendar | null>(null);
  const lastRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [title, setTitle] = useState("");

  const events = useMemo(() => {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    return entries.map((entry) => {
      const task = entry.task_id ? tasksById.get(entry.task_id) : undefined;
      const taskProject = task?.project_id ? projectsById.get(task.project_id) : undefined;
      const project = entry.project_id ? projectsById.get(entry.project_id) : undefined;
      const category = entry.category_id ? categoriesById.get(entry.category_id) : undefined;
      // Same rule the Calendar page paints its blocks with, so a dropped item
      // keeps its colour: a task entry borrows the colour of the project behind
      // the task first, then the task's category, a project entry wears the
      // project's own colour, and a record with neither falls back to its
      // manual category or its source.
      const color =
        taskProject?.color ??
        (task?.category_id ? categoriesById.get(task.category_id)?.color : undefined) ??
        project?.color ??
        category?.color ??
        (entry.source === "timer" ? TIMER_COLOR : MANUAL_COLOR);
      return {
        id: entry.id,
        title:
          entry.title ??
          project?.name ??
          (entry.task_id ? task?.title ?? "Untitled" : "Untracked"),
        start: entry.start_at,
        end: entry.end_at,
        backgroundColor: color,
        borderColor: color,
        extendedProps: {
          entryId: entry.id,
          categoryName: category?.name ?? null,
        },
      };
    });
  }, [entries, tasks, projects, categories]);

  const persistMove = async (entryId: string, start: Date | null, end: Date | null) => {
    // The database rejects an end that is not strictly after the start.
    if (!start || !end || end.getTime() <= start.getTime()) return;
    try {
      await updateTimeEntry(entryId, {
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      });
      toast.success("Time entry updated", {
        description: formatDuration(Math.round((end.getTime() - start.getTime()) / 1000)),
      });
    } catch (error) {
      toast.error("Could not move the entry", { description: describeError(error) });
    }
  };

  const handleDateClick = (arg: DateClickArg) => {
    onCreateEntry(arg.date, new Date(arg.date.getTime() + 60 * 60 * 1000));
  };

  const handleEventClick = (arg: EventClickArg) => {
    const entry = entries.find((item) => item.id === arg.event.id);
    if (entry) onSelectEntry(entry);
  };

  const handleEventDrop = (arg: EventDropArg) => {
    void persistMove(arg.event.id, arg.event.start, arg.event.end);
  };

  const handleEventResize = (arg: EventResizeDoneArg) => {
    void persistMove(arg.event.id, arg.event.start, arg.event.end);
  };

  /**
   * A task or project dropped in from the pick-up area.
   *
   * The drop writes what actually happened, not a plan: a manual time entry is
   * created for the tracked task or project, with its category filled in for it.
   * FullCalendar's own placeholder event is removed -- the grid renders from the
   * stored entry instead.
   */
  const handleEventReceive = async (arg: EventReceiveArg) => {
    const taskId = (arg.event.extendedProps.taskId as string | null) ?? null;
    const projectId = (arg.event.extendedProps.projectId as string | null) ?? null;
    const droppedStart = arg.event.start;
    const droppedEnd = arg.event.end;
    const allDay = arg.event.allDay;
    arg.event.remove();
    if (!droppedStart) return;

    // A drop onto the month grid is all-day, so it is given a working-hour slot
    // rather than being left as an entry in the all-day row.
    const start = new Date(droppedStart);
    if (allDay) start.setHours(9, 0, 0, 0);
    const end =
      !allDay && droppedEnd ? new Date(droppedEnd) : new Date(start.getTime() + 60 * 60 * 1000);

    const task = taskId ? tasks.find((item) => item.id === taskId) : undefined;
    const project = projectId ? projects.find((item) => item.id === projectId) : undefined;

    try {
      const saved = await createTimeEntry({
        task_id: taskId,
        project_id: projectId,
        category_id: task?.category_id ?? project?.category_id ?? null,
        title: task?.title ?? project?.name ?? null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        notes: null,
        source: "manual",
      });
      toast.success("Time logged", {
        description: formatDuration(saved.duration_seconds),
      });
    } catch (error) {
      toast.error("Could not log the time", { description: describeError(error) });
    }
  };

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="sticky top-14 z-10 -mx-4 -mt-4 mb-4 flex flex-wrap items-center gap-2 rounded-t-lg bg-background px-4 pb-3 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => calendarRef.current?.getApi().prev()}
          aria-label="Previous period"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => calendarRef.current?.getApi().today()}>
          Today
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => calendarRef.current?.getApi().next()}
          aria-label="Next period"
        >
          <ChevronRight className="size-4" />
        </Button>
        <span className="ml-1 text-sm font-medium">{title}</span>

        <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
          {VIEWS.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => calendarRef.current?.getApi().changeView(item.view)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={false}
        firstDay={1}
        // Bounded height: the grid scrolls inside this box, so its toolbar and
        // the day header row stay put while the hours scroll past.
        height="calc(100vh - 32rem)"
        nowIndicator
        editable
        selectable
        droppable
        dayMaxEvents={3}
        slotMinTime="05:00:00"
        slotMaxTime="24:00:00"
        scrollTime="08:00:00"
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        events={events}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventReceive={handleEventReceive}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        datesSet={(arg) => {
          setTitle(arg.view.title);
          const next = { start: arg.start.getTime(), end: arg.end.getTime() };
          const previous = lastRangeRef.current;
          if (previous && previous.start === next.start && previous.end === next.end) return;
          lastRangeRef.current = next;
          onRangeChange({ start: arg.start, end: arg.end });
        }}
        eventContent={(arg) => {
          const categoryName = arg.event.extendedProps.categoryName as string | null;
          const seconds =
            arg.event.start && arg.event.end
              ? Math.round((arg.event.end.getTime() - arg.event.start.getTime()) / 1000)
              : 0;
          return (
            <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
              <div className="truncate font-medium">{arg.event.title}</div>
              {arg.timeText ? <div className="truncate opacity-80">{arg.timeText}</div> : null}
              <div className="truncate opacity-70">
                {formatDuration(seconds)}
                {categoryName ? ` · ${categoryName}` : ""}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
