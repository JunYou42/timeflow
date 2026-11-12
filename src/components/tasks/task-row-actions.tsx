"use client";

import { useState } from "react";
import { CalendarPlus, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ScheduleDialog } from "@/components/calendar/schedule-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { StartTimerDialog } from "@/components/timer/start-timer-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Task } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

interface TaskRowActionsProps {
  task: Task;
}

/** Kebab menu shared by the table and list views. */
export function TaskRowActions({ task }: TaskRowActionsProps) {
  const deleteTask = useAppStore((state) => state.deleteTask);
  const [editOpen, setEditOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Task actions"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setTimerOpen(true)}>
            <Play className="size-4" />
            Start timer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setScheduleOpen(true)}>
            <CalendarPlus className="size-4" />
            Schedule
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} task={task} />
      <StartTimerDialog open={timerOpen} onOpenChange={setTimerOpen} initialTaskId={task.id} />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        defaults={{ title: task.title, task_id: task.id, schedule_type: "task" }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              The task is archived. Recorded time entries and schedules are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteTask(task.id);
                  toast.success("Task deleted");
                } catch (error) {
                  toast.error("Could not delete the task", { description: describeError(error) });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
