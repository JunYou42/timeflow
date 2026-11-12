"use client";

import { useEffect, useMemo, useRef } from "react";
import { Draggable } from "@fullcalendar/interaction";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/store/use-app-store";

const TASK_COLOR = "#6366f1";
/** Dropped blocks land as one-hour slots; resize them afterwards. */
const DEFAULT_DURATION = "01:00";

interface PoolItem {
  id: string;
  kind: "task" | "project";
  title: string;
  subtitle: string | null;
  color: string;
}

/**
 * The pick-up area beside a calendar.
 *
 * Open tasks and ongoing projects are plain list items that FullCalendar's
 * `Draggable` turns into external events. Everything the drop handler needs
 * travels on `data-*` attributes, which is the only channel between a list item
 * and the `eventReceive` callback on the calendar itself.
 *
 * The same list feeds both calendars -- the plan (Calendar) and what actually
 * happened (Time logs) -- so the wording is configurable.
 */
interface SchedulePoolProps {
  title?: string;
  description?: string;
}

export function SchedulePool({
  title = "Drag to schedule",
  description = "Drag a task or an ongoing project onto the calendar.",
}: SchedulePoolProps = {}) {
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);

  const { taskItems, projectItems } = useMemo(() => {
    const categoryColors = new Map(categories.map((category) => [category.id, category.color]));
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const now = Date.now();

    const taskItems: PoolItem[] = tasks
      .filter(
        (task) => !task.deleted_at && (task.status === "todo" || task.status === "in_progress")
      )
      .sort((a, b) => {
        const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue || a.title.localeCompare(b.title);
      })
      .map((task) => ({
        id: task.id,
        kind: "task",
        title: task.title,
        subtitle: task.project_id ? projectById.get(task.project_id)?.name ?? null : null,
        // The same rule both calendars paint their blocks with: a task wears the
        // colour of the project it belongs to, then its own category, then the
        // fallback.
        color:
          (task.project_id ? projectById.get(task.project_id)?.color : undefined) ??
          (task.category_id ? categoryColors.get(task.category_id) : undefined) ??
          TASK_COLOR,
      }));

    const projectItems: PoolItem[] = projects
      // Same rule as the dialog's picker: only projects that have not finished.
      .filter((project) => !project.end_date || new Date(project.end_date).getTime() > now)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((project) => ({
        id: project.id,
        kind: "project",
        title: project.name,
        subtitle: "Ongoing project",
        color: project.color,
      }));

    return { taskItems, projectItems };
  }, [tasks, projects, categories]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const draggable = new Draggable(container, {
      itemSelector: "[data-pool-item]",
      eventData: (element) => {
        const kind = element.getAttribute("data-kind");
        const color = element.getAttribute("data-color") ?? undefined;
        return {
          title: element.getAttribute("data-title") ?? "",
          duration: DEFAULT_DURATION,
          backgroundColor: color,
          borderColor: color,
          extendedProps: {
            taskId: kind === "task" ? element.getAttribute("data-id") : null,
            projectId: kind === "project" ? element.getAttribute("data-id") : null,
          },
        };
      },
    });
    return () => draggable.destroy();
  }, []);

  const isEmpty = taskItems.length === 0 && projectItems.length === 0;

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="space-y-3">
          {isEmpty ? (
            <p className="text-xs text-muted-foreground">Nothing open to schedule.</p>
          ) : null}
          {taskItems.length > 0 ? <PoolSection title="Tasks" items={taskItems} /> : null}
          {projectItems.length > 0 ? (
            <PoolSection title="Ongoing projects" items={projectItems} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PoolSection({ title, items }: { title: string; items: PoolItem[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="ml-1 tabular-nums">({items.length})</span>
      </p>
      <ul className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
        {items.map((item) => (
          <li
            key={item.id}
            data-pool-item
            data-id={item.id}
            data-kind={item.kind}
            data-title={item.title}
            data-color={item.color}
            className="flex cursor-grab touch-none select-none items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm transition-colors hover:bg-accent active:cursor-grabbing"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.title}</span>
              {item.subtitle ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.subtitle}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
