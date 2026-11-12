import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";

const STATUS_CLASSES: Record<TaskStatus, string> = {
  todo: "border-transparent bg-slate-100 text-slate-700",
  in_progress: "border-transparent bg-blue-100 text-blue-700",
  done: "border-transparent bg-emerald-100 text-emerald-700",
  cancelled: "border-transparent bg-muted text-muted-foreground",
};

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: "border-transparent bg-slate-100 text-slate-600",
  medium: "border-transparent bg-sky-100 text-sky-700",
  high: "border-transparent bg-amber-100 text-amber-800",
  urgent: "border-transparent bg-red-100 text-red-700",
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge className={cn(STATUS_CLASSES[status], className)}>{TASK_STATUS_LABELS[status]}</Badge>
  );
}

export function TaskPriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <Badge className={cn(PRIORITY_CLASSES[priority], className)}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
