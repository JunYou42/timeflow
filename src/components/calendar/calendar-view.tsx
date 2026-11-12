"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { DateClickArg, EventReceiveArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { CategoryPlanActual } from "@/components/analytics/category-plan-actual";
import { ScheduleDialog } from "@/components/calendar/schedule-dialog";
import type { ScheduleDialogDefaults } from "@/components/calendar/schedule-dialog";
import { ScheduleDuplicateDialog } from "@/components/calendar/schedule-duplicate-dialog";
import { SchedulePool } from "@/components/calendar/schedule-pool";
import { Button } from "@/components/ui/button";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { buildCategoryPlanVsActual, findOverlappingSchedules } from "@/lib/stats";
import {
  formatDateLabel,
  formatDateTimeLabel,
  resolveRange,
  toLocalInputValue,
  type DateRange,
} from "@/lib/time";
import type { Schedule } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

const TASK_COLOR = "#6366f1";
const EVENT_COLOR = "#0ea5e9";

export function CalendarView() {
  const timezone = useUserTimezone();
  const schedules = useAppStore((state) => state.schedules);
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const timeEntries = useAppStore((state) => state.timeEntries);
  const updateSchedule = useAppStore((state) => state.updateSchedule);
  const createSchedule = useAppStore((state) => state.createSchedule);

  const calendarRef = useRef<FullCalendar | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [defaults, setDefaults] = useState<ScheduleDialogDefaults | undefined>(undefined);
  const [duplicateSource, setDuplicateSource] = useState<Schedule | null>(null);
  const [title, setTitle] = useState("Calendar");
  // The visible period of the grid, so the summary above follows the navigation.
  const [range, setRange] = useState<DateRange>(() => resolveRange("week", timezone));

  const categoryRows = useMemo(
    () => buildCategoryPlanVsActual(schedules, timeEntries, tasks, projects, categories, range),
    [schedules, timeEntries, tasks, projects, categories, range]
  );

  const taskTitles = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks]
  );

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const categoryColors = useMemo(
    () => new Map(categories.map((category) => [category.id, category.color])),
    [categories]
  );

  const events = useMemo(
    () =>
      schedules.map((schedule) => {
        // A block borrows the colour of what it is working on: the project the
        // tracked task belongs to first, then that task's category, then the
        // block's own project, then the fallback -- the same rule the pick-up
        // list uses, so a block keeps its colour when it is dragged in.
        const task = schedule.task_id ? tasksById.get(schedule.task_id) : undefined;
        const taskProject = task?.project_id ? projectsById.get(task.project_id) : undefined;
        const project = schedule.project_id ? projectsById.get(schedule.project_id) : undefined;
        const color =
          taskProject?.color ??
          (task?.category_id ? categoryColors.get(task.category_id) : undefined) ??
          project?.color ??
          (schedule.schedule_type === "task" ? TASK_COLOR : EVENT_COLOR);
        return {
          id: schedule.id,
          title: schedule.title,
          start: schedule.start_at,
          end: schedule.end_at,
          backgroundColor: color,
          borderColor: color,
          extendedProps: {
            scheduleId: schedule.id,
            taskId: schedule.task_id,
            projectId: schedule.project_id,
            scheduleType: schedule.schedule_type,
          },
        };
      }),
    [schedules, tasksById, projectsById, categoryColors]
  );

  const openCreate = useCallback((start: Date, end: Date) => {
    setEditing(null);
    setDefaults({
      title: "",
      start_at: toLocalInputValue(start, timezone),
      end_at: toLocalInputValue(end, timezone),
      schedule_type: "event",
    });
    setDialogOpen(true);
  }, [timezone]);

  const handleDateClick = (arg: DateClickArg) => {
    const start = arg.date;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    openCreate(start, end);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const schedule = schedules.find((item) => item.id === arg.event.id) ?? null;
    if (!schedule) return;
    setEditing(schedule);
    setDefaults(undefined);
    setDialogOpen(true);
  };

  const persistMove = async (
    scheduleId: string,
    start: Date | null,
    end: Date | null
  ) => {
    if (!start || !end) return;
    const candidate = { id: scheduleId, start_at: start.toISOString(), end_at: end.toISOString() };
    const conflicts = findOverlappingSchedules(candidate, schedules);
    try {
      await updateSchedule(scheduleId, {
        start_at: candidate.start_at,
        end_at: candidate.end_at,
      });
      if (conflicts.length > 0) {
        toast.warning("Saved, but this overlaps another block", {
          description: conflicts
            .slice(0, 2)
            .map((conflict) => conflict.title)
            .join(", "),
        });
      } else {
        toast.success("Schedule updated");
      }
    } catch (error) {
      toast.error("Could not move the schedule", { description: describeError(error) });
    }
  };

  const handleEventDrop = (arg: EventDropArg) => {
    void persistMove(arg.event.id, arg.event.start, arg.event.end);
  };

  const handleEventResize = (arg: EventResizeDoneArg) => {
    void persistMove(arg.event.id, arg.event.start, arg.event.end);
  };

  /**
   * A block dropped in from the pick-up area.
   *
   * FullCalendar has already added its own event for the drop; that placeholder
   * is removed and replaced by the record we store, which is what the grid
   * renders from.
   */
  const handleEventReceive = async (arg: EventReceiveArg) => {
    const taskId = (arg.event.extendedProps.taskId as string | null) ?? null;
    const projectId = (arg.event.extendedProps.projectId as string | null) ?? null;
    const droppedStart = arg.event.start;
    const droppedEnd = arg.event.end;
    const allDay = arg.event.allDay;
    const droppedTitle = arg.event.title;
    arg.event.remove();
    if (!droppedStart) return;

    // A drop onto the month grid is all-day, so it is given a working-hour slot
    // rather than being left as an entry in the all-day row.
    const start = new Date(droppedStart);
    if (allDay) start.setHours(9, 0, 0, 0);
    const end =
      !allDay && droppedEnd ? new Date(droppedEnd) : new Date(start.getTime() + 60 * 60 * 1000);

    try {
      const saved = await createSchedule({
        title: droppedTitle || "Untitled",
        task_id: taskId,
        project_id: projectId,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        schedule_type: taskId || projectId ? "task" : "event",
        description: null,
      });
      const conflicts = findOverlappingSchedules(
        { id: saved.id, start_at: saved.start_at, end_at: saved.end_at },
        schedules
      );
      if (conflicts.length > 0) {
        toast.warning("Scheduled, but it overlaps another block", {
          description: conflicts
            .slice(0, 2)
            .map((conflict) => conflict.title)
            .join(", "),
        });
      } else {
        toast.success("Scheduled", {
          description: formatDateTimeLabel(saved.start_at, timezone),
        });
      }
    } catch (error) {
      toast.error("Could not schedule it", { description: describeError(error) });
    }
  };

  const openDuplicate = useCallback((schedule: Schedule) => {
    setDialogOpen(false);
    setEditing(null);
    setDuplicateSource(schedule);
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Plan when the work happens. Drag a task or project in, drag a block to reschedule, click a slot to add."
        actions={
          <Button
            size="sm"
            onClick={() => {
              const start = new Date();
              start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
              openCreate(start, new Date(start.getTime() + 60 * 60 * 1000));
            }}
          >
            <Plus className="size-4" />
            New schedule
          </Button>
        }
      />

      <CategoryPlanActual
        rows={categoryRows}
        rangeLabel={`${formatDateLabel(range.start, timezone)} → ${formatDateLabel(
          new Date(range.end.getTime() - 1),
          timezone
        )}`}
      />

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="self-start xl:sticky xl:top-20">
          <SchedulePool />
        </div>

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => calendarRef.current?.getApi().today()}
            >
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
              {(
                [
                  { label: "Day", view: "timeGridDay" },
                  { label: "Week", view: "timeGridWeek" },
                  { label: "Month", view: "dayGridMonth" },
                ] as const
              ).map((item) => (
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
            // Bounded height: the grid scrolls inside this box, so its toolbar
            // and the day header row stay put while the hours scroll past.
            height="calc(100vh - 24rem)"
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
              // Keep the same Date objects when the period has not moved, so the
              // summary above is not recomputed on every render.
              setRange((previous) =>
                previous.start.getTime() === arg.start.getTime() &&
                previous.end.getTime() === arg.end.getTime()
                  ? previous
                  : { start: arg.start, end: arg.end }
              );
            }}
            eventContent={(arg) => {
              const taskId = arg.event.extendedProps.taskId as string | null;
              const projectId = arg.event.extendedProps.projectId as string | null;
              const label =
                (projectId ? projectsById.get(projectId)?.name : null) ??
                (taskId ? taskTitles.get(taskId) : null);
              return (
                <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                  <div className="truncate font-medium">{arg.event.title}</div>
                  {arg.timeText ? (
                    <div className="truncate opacity-80">{arg.timeText}</div>
                  ) : null}
                  {label ? (
                    <div className="truncate opacity-70">
                      {projectId ? "▸ " : "↳ "}
                      {label}
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarPlus className="size-3.5" />
        Tip: drag a task or project from the list onto the grid, or click and drag to block out
        time. Drag a block to reschedule it; conflicts are flagged when you save.
      </p>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schedule={editing}
        defaults={defaults}
        onDuplicate={openDuplicate}
      />

      <ScheduleDuplicateDialog
        open={Boolean(duplicateSource)}
        onOpenChange={(open) => {
          if (!open) setDuplicateSource(null);
        }}
        source={duplicateSource}
      />
    </div>
  );
}
