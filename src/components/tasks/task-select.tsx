"use client";

import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/use-app-store";
import type { Task, UUID } from "@/lib/types";

interface TaskSelectProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Include an explicit "No task" entry (used by manual time entries). */
  allowNone?: boolean;
  noneLabel?: string;
  /** Hide a task (e.g. the task currently being edited). */
  excludeTaskId?: UUID;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Also offer projects that have not finished yet, under their own heading.
   * The picked id is just an id, so the caller decides whether it belongs to a
   * task or to a project.
   */
  includeProjects?: boolean;
}

/**
 * Shared task picker. Only open tasks are offered, but a task that is already
 * selected is always shown so editing never silently drops the association.
 */
export function TaskSelect({
  value,
  onChange,
  allowNone = true,
  noneLabel = "No task",
  excludeTaskId,
  placeholder = "Select a task",
  disabled,
  includeProjects = false,
}: TaskSelectProps) {
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);

  const options = useMemo(() => {
    const projectName = new Map(projects.map((project) => [project.id, project.name]));
    const visible = tasks.filter((task) => {
      if (task.deleted_at) return false;
      if (task.id === excludeTaskId) return false;
      if (task.id === value) return true;
      return task.status === "todo" || task.status === "in_progress";
    });
    return [...visible]
      .sort((a, b) => {
        const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;
        return a.title.localeCompare(b.title);
      })
      .map((task: Task) => ({
        id: task.id,
        title: task.title,
        project: task.project_id ? projectName.get(task.project_id) ?? null : null,
        isSubtask: task.parent_task_id !== null,
      }));
  }, [tasks, projects, value, excludeTaskId]);

  const projectOptions = useMemo(() => {
    if (!includeProjects) return [];
    const now = Date.now();
    return projects
      .filter((project) => {
        // Already picked? Keep it in the list even if it has since finished.
        if (project.id === value) return true;
        return !project.end_date || new Date(project.end_date).getTime() > now;
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((project) => ({ id: project.id, name: project.name, color: project.color }));
  }, [projects, includeProjects, value]);

  const isEmpty = options.length === 0 && projectOptions.length === 0;

  return (
    <Select
      value={value ?? (allowNone ? NONE_VALUE : undefined)}
      onValueChange={(next) => onChange(next === NONE_VALUE ? undefined : next)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem> : null}
        {isEmpty ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Nothing to pick</div>
        ) : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="truncate">
              {option.isSubtask ? "↳ " : ""}
              {option.title}
            </span>
            {option.project ? (
              <span className="ml-2 text-xs text-muted-foreground">{option.project}</span>
            ) : null}
          </SelectItem>
        ))}
        {projectOptions.length > 0 ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Ongoing projects</SelectLabel>
              {projectOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span className="truncate">
                    <span
                      className="mr-2 inline-block size-2 rounded-full align-middle"
                      style={{ backgroundColor: option.color }}
                    />
                    {option.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}

const NONE_VALUE = "__none__";
