"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KanbanSquare, List, Plus, Rows3, Search, SlidersHorizontal, X } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { TaskBoardView } from "@/components/tasks/task-board-view";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskListView } from "@/components/tasks/task-list-view";
import { TaskTableView } from "@/components/tasks/task-table-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { decorateTasksWithStats } from "@/lib/stats";
import { resolveRange, type RangePreset } from "@/lib/time";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/use-app-store";

type ViewMode = "table" | "board" | "list";
type SortKey = "due" | "priority" | "created" | "tracked" | "title";
type PeriodKey = Extract<RangePreset, "today" | "week" | "month">;

const ALL = "__all__";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function TasksWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const timeEntries = useAppStore((state) => state.timeEntries);

  const timezone = useUserTimezone();

  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [status, setStatus] = useState<string>(ALL);
  const [projectId, setProjectId] = useState<string>(ALL);
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [createOpen, setCreateOpen] = useState(false);

  const selectedTaskId = searchParams.get("task");

  const openTask = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeTask = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  // A stale ?task= that no longer exists should not leave a dead drawer open.
  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId && !task.deleted_at)) {
      closeTask();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId, tasks]);

  const decorated = useMemo(() => decorateTasksWithStats(tasks, timeEntries), [tasks, timeEntries]);

  // The period is a floor rather than a window: work that was already finished
  // before it began is history and drops out, while open tasks stay put however
  // old they are -- the page is a backlog to move, not an archive to browse.
  const range = useMemo(() => resolveRange(period, timezone), [period, timezone]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = decorated.filter((task) => {
      if (task.deleted_at) return false;
      if (task.completed_at && new Date(task.completed_at).getTime() < range.start.getTime()) {
        return false;
      }
      if (needle && !task.title.toLowerCase().includes(needle)) return false;
      if (status !== ALL && task.status !== status) return false;
      if (projectId !== ALL && task.project_id !== projectId) return false;
      if (categoryId !== ALL && task.category_id !== categoryId) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "priority":
          if (a.priority !== b.priority) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
          return a.title.localeCompare(b.title);
        case "created":
          return b.created_at.localeCompare(a.created_at);
        case "tracked":
          return b.actual_seconds - a.actual_seconds;
        case "title":
          return a.title.localeCompare(b.title);
        case "due":
        default: {
          const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          if (aDue !== bDue) return aDue - bDue;
          return a.title.localeCompare(b.title);
        }
      }
    });

    return result;
  }, [decorated, query, status, projectId, categoryId, sortKey, range]);

  const activeFilters =
    (status !== ALL ? 1 : 0) +
    (projectId !== ALL ? 1 : 0) +
    (categoryId !== ALL ? 1 : 0);

  const resetFilters = () => {
    setStatus(ALL);
    setProjectId(ALL);
    setCategoryId(ALL);
    setQuery("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description={`${decorated.filter((task) => !task.deleted_at).length} tasks in total`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New task
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 lg:flex-row lg:items-center">
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={period}
            onChange={(value) => setPeriod(value as PeriodKey)}
            placeholder="Period"
          >
            {PERIODS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </FilterSelect>

          <FilterSelect value={status} onChange={setStatus} placeholder="Status">
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TASK_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {TASK_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </FilterSelect>

          <FilterSelect value={projectId} onChange={setProjectId} placeholder="Project">
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </FilterSelect>

          <FilterSelect value={categoryId} onChange={setCategoryId} placeholder="Category">
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </FilterSelect>

          <FilterSelect value={sortKey} onChange={(value) => setSortKey(value as SortKey)} placeholder="Sort">
            <SelectItem value="due">Sort: Due date</SelectItem>
            <SelectItem value="priority">Sort: Priority</SelectItem>
            <SelectItem value="created">Sort: Newest</SelectItem>
            <SelectItem value="tracked">Sort: Most tracked</SelectItem>
            <SelectItem value="title">Sort: Title</SelectItem>
          </FilterSelect>

          {activeFilters > 0 || query ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
          <ViewButton active={view === "table"} onClick={() => setView("table")} label="Table view">
            <Rows3 className="size-4" />
          </ViewButton>
          <ViewButton active={view === "board"} onClick={() => setView("board")} label="Board view">
            <KanbanSquare className="size-4" />
          </ViewButton>
          <ViewButton active={view === "list"} onClick={() => setView("list")} label="List view">
            <List className="size-4" />
          </ViewButton>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title={decorated.length === 0 ? "No tasks yet" : "No tasks match your filters"}
          description={
            decorated.length === 0
              ? "Create your first task to start planning and tracking time against it."
              : "Try clearing a filter or searching for something else."
          }
          action={
            decorated.length === 0 ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                New task
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            )
          }
        />
      ) : view === "table" ? (
        <TaskTableView tasks={visible} onOpenTask={openTask} />
      ) : view === "board" ? (
        <TaskBoardView tasks={visible} onOpenTask={openTask} />
      ) : (
        <TaskListView tasks={visible} onOpenTask={openTask} />
      )}

      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TaskDetailSheet taskId={selectedTaskId} open={Boolean(selectedTaskId)} onOpenChange={(next) => (next ? undefined : closeTask())} />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px] gap-1 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("h-8 px-2")}
    >
      {children}
    </Button>
  );
}
