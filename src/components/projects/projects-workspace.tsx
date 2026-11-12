"use client";

import { useMemo, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { ProjectDialog, type ProjectDialogState } from "@/components/projects/project-dialog";
import { ProjectEstimateDashboard } from "@/components/projects/project-estimate-dashboard";
import { ProjectTimeDashboard } from "@/components/projects/project-time-dashboard";
import { ProjectTimelineBoard } from "@/components/projects/project-timeline-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import {
  buildProjectTimeline,
  decorateProjectsWithStats,
  planProjectReorder,
  projectTimelineRange,
} from "@/lib/stats";
import { formatDuration, formatInTimezone } from "@/lib/time";
import {
  PROJECT_QUADRANT_LABELS,
  projectQuadrant,
  type ProjectQuadrant,
  type ProjectUpdate,
  type ProjectWithStats,
  type UUID,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

const QUADRANT_ORDER: ProjectQuadrant[] = ["do", "plan", "delegate", "drop"];

const QUADRANT_DOT: Record<ProjectQuadrant, string> = {
  do: "bg-red-500",
  plan: "bg-sky-500",
  delegate: "bg-amber-500",
  drop: "bg-slate-400",
};

export function ProjectsWorkspace() {
  const timezone = useUserTimezone();
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const categories = useAppStore((state) => state.categories);
  const timeEntries = useAppStore((state) => state.timeEntries);
  const updateProject = useAppStore((state) => state.updateProject);

  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, project: null });

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const decorated = useMemo(
    () => decorateProjectsWithStats(projects, tasks, timeEntries),
    [projects, tasks, timeEntries]
  );

  // The timeline is a plan, so it only plots projects that have an end date.
  // Open-ended ones are listed beside it rather than given a made-up length.
  const scheduled = useMemo(
    () => decorated.filter((project) => project.end_date !== null),
    [decorated]
  );

  const openEnded = useMemo(
    () =>
      decorated
        .filter((project) => project.end_date === null)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [decorated]
  );

  const range = useMemo(() => projectTimelineRange(scheduled, timezone), [scheduled, timezone]);

  const items = useMemo(() => buildProjectTimeline(scheduled, range), [scheduled, range]);

  const quadrantCounts = useMemo(() => {
    const counts: Record<ProjectQuadrant, number> = { do: 0, plan: 0, delegate: 0, drop: 0 };
    for (const project of decorated) counts[projectQuadrant(project)] += 1;
    return counts;
  }, [decorated]);

  const totals = useMemo(
    () =>
      decorated.reduce(
        (sum, project) => ({
          estimated: sum.estimated + (project.estimated_hours ?? 0),
          taskEstimate: sum.taskEstimate + project.task_estimated_minutes,
          actual: sum.actual + project.actual_seconds,
        }),
        { estimated: 0, taskEstimate: 0, actual: 0 }
      ),
    [decorated]
  );

  const openProject = (project: ProjectWithStats) => setDialog({ open: true, project });

  const changeWindow = (projectId: UUID, patch: ProjectUpdate) => {
    void updateProject(projectId, patch).catch((error) => {
      toast.error("Could not move the project", { description: describeError(error) });
    });
  };

  const reorderProjects = (projectId: UUID, laneShift: number) => {
    const patches = planProjectReorder(items, projectId, laneShift);
    if (patches.length === 0) return;
    void Promise.all(
      patches.map((patch) => updateProject(patch.id, { sort_order: patch.sort_order }))
    ).catch((error) => {
      toast.error("Could not change the priority", { description: describeError(error) });
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description="Projects with an end date, laid out on a vertical timeline — scroll to travel through time."
        actions={
          <Button size="sm" onClick={() => setDialog({ open: true, project: null })}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      {decorated.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project, give it a start and end date, and it will appear on the timeline."
          action={
            <Button size="sm" onClick={() => setDialog({ open: true, project: null })}>
              <Plus className="size-4" />
              New project
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-xs">
              {QUADRANT_ORDER.map((quadrant) => (
                <span key={quadrant} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", QUADRANT_DOT[quadrant])} />
                  <span className="font-medium">{PROJECT_QUADRANT_LABELS[quadrant]}</span>
                  <span className="text-muted-foreground">{quadrantCounts[quadrant]}</span>
                </span>
              ))}
              <span className="ml-auto text-muted-foreground">
                Estimated {formatDuration(totals.estimated * 3600, { compact: true })} · Tasks{" "}
                {formatDuration(totals.taskEstimate * 60, { compact: true })} · Tracked{" "}
                {formatDuration(totals.actual, { compact: true })}
              </span>
            </CardContent>
          </Card>

          {/* Side by side: what the period's hours went into, next to whether
              each project is still inside its own estimate. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectTimeDashboard projects={projects} tasks={tasks} timeEntries={timeEntries} />

            <ProjectEstimateDashboard projects={projects} tasks={tasks} timeEntries={timeEntries} />
          </div>

          <div className={cn("gap-4", openEnded.length > 0 && "grid xl:grid-cols-[minmax(0,1fr)_18rem]")}>
            <div className="min-w-0">
              {scheduled.length > 0 ? (
                <ProjectTimelineBoard
                  items={items}
                  range={range}
                  timezone={timezone}
                  onSelectProject={openProject}
                  onUpdateWindow={changeWindow}
                  onReorder={reorderProjects}
                />
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No project has an end date yet, so there is nothing to plot.
                  </CardContent>
                </Card>
              )}
            </div>

            {openEnded.length > 0 ? (
              <aside className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">No end date</h2>
                  <span className="text-xs text-muted-foreground">{openEnded.length}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/80">
                  Kept off the timeline until they get an end date.
                </p>
                <div className="space-y-1.5">
                  {openEnded.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project)}
                      title={`${project.name} · ${PROJECT_QUADRANT_LABELS[projectQuadrant(project)]}`}
                      className="flex w-full items-start gap-2 rounded-md border border-l-4 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        borderLeftColor: project.color,
                        backgroundColor: `${project.color}1a`,
                      }}
                    >
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          QUADRANT_DOT[projectQuadrant(project)]
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium leading-tight">
                          {project.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>
                            {project.start_date
                              ? `From ${formatInTimezone(project.start_date, timezone, "MMM d")}`
                              : "No dates"}
                          </span>
                          {project.category_id ? (
                            <span className="flex items-center gap-1">
                              <span
                                className="size-1.5 rounded-full"
                                style={{
                                  backgroundColor: categoryById.get(project.category_id)?.color,
                                }}
                              />
                              {categoryById.get(project.category_id)?.name}
                            </span>
                          ) : null}
                          {project.task_count > 0 ? (
                            <span>
                              {project.done_task_count}/{project.task_count} done
                            </span>
                          ) : null}
                          {project.actual_seconds > 0 ? (
                            <span>{formatDuration(project.actual_seconds, { compact: true })} tracked</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>
        </>
      )}

      <ProjectDialog
        state={dialog}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </div>
  );
}
