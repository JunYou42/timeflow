"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  Database,
  FolderOpen,
  GripVertical,
  Loader2,
  Plus,
  Tags,
  Trash2,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectDialog } from "@/components/projects/project-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { planProjectMove } from "@/lib/stats";
import { detectTimezone, FALLBACK_TIMEZONE } from "@/lib/time";
import { DEFAULT_CATEGORIES, type Category, type Project, type UUID } from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

const FALLBACK_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return FALLBACK_TIMEZONES;
}

/** A drag of one project row, measured in whole row heights. */
interface ProjectDrag {
  id: UUID;
  /** Priority slot the row was picked up from. */
  from: number;
  /** Priority slot the row is currently over. */
  to: number;
  startY: number;
  rowHeight: number;
}

export function SettingsWorkspace() {
  const timezone = useUserTimezone();
  const mode = useAppStore((state) => state.mode);
  const user = useAppStore((state) => state.user);
  const profile = useAppStore((state) => state.profile);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const tasks = useAppStore((state) => state.tasks);
  const timeEntries = useAppStore((state) => state.timeEntries);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const createCategory = useAppStore((state) => state.createCategory);
  const updateCategory = useAppStore((state) => state.updateCategory);
  const deleteCategory = useAppStore((state) => state.deleteCategory);
  const resetLocalData = useAppStore((state) => state.resetLocalData);
  const refresh = useAppStore((state) => state.refresh);

  const timezones = useMemo(listTimezones, []);

  const [displayName, setDisplayName] = useState("");
  const [timezoneValue, setTimezoneValue] = useState(timezone);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setTimezoneValue(profile?.timezone ?? timezone);
  }, [profile?.display_name, profile?.timezone, timezone]);

  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project: Project | null }>({
    open: false,
    project: null,
  });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });
  const [resetOpen, setResetOpen] = useState(false);

  /**
   * The settings list shows every project, so it mirrors the priority order the
   * timeline lanes are laid out in: dragging a row here is the same edit as
   * dragging a bar sideways on the projects page.
   */
  const orderedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
      ),
    [projects]
  );

  const [drag, setDrag] = useState<ProjectDrag | null>(null);
  const dragRef = useRef<ProjectDrag | null>(null);

  /** Rows shift under the pointer while dragging; the store is only touched on release. */
  const shownProjects = useMemo(() => {
    if (!drag || drag.from === drag.to) return orderedProjects;
    const next = [...orderedProjects];
    const [moved] = next.splice(drag.from, 1);
    next.splice(drag.to, 0, moved);
    return next;
  }, [orderedProjects, drag]);

  const dragging = drag !== null;

  // Drags run on window listeners: the row re-renders on every step and the
  // pointer routinely leaves it while the list reflows around it.
  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;
      const steps = Math.round((event.clientY - session.startY) / session.rowHeight);
      const to = Math.max(0, Math.min(orderedProjects.length - 1, session.from + steps));
      if (to === session.to) return;
      session.to = to;
      setDrag({ ...session });
    };

    const onPointerUp = () => {
      const session = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!session || session.from === session.to) return;

      const patches = planProjectMove(orderedProjects, session.from, session.to);
      if (patches.length === 0) return;
      void Promise.all(
        patches.map((patch) => updateProject(patch.id, { sort_order: patch.sort_order }))
      ).catch((error) => {
        toast.error("Could not reorder projects", { description: describeError(error) });
      });
    };

    const onPointerCancel = () => {
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [dragging, orderedProjects, updateProject]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, projectId: UUID) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const index = orderedProjects.findIndex((project) => project.id === projectId);
    if (index < 0) return;
    const row = event.currentTarget.closest("li");
    const session: ProjectDrag = {
      id: projectId,
      from: index,
      to: index,
      startY: event.clientY,
      rowHeight: row?.getBoundingClientRect().height ?? 40,
    };
    dragRef.current = session;
    setDrag(session);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ display_name: displayName.trim() || null, timezone: timezoneValue });
      toast.success("Profile saved");
    } catch (error) {
      toast.error("Could not save your profile", { description: describeError(error) });
    } finally {
      setSavingProfile(false);
    }
  };

  const addDefaultCategories = async () => {
    try {
      for (const category of DEFAULT_CATEGORIES) {
        await createCategory(category);
      }
      toast.success("Default categories added");
    } catch (error) {
      toast.error("Could not add categories", { description: describeError(error) });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Your profile, the vocabulary you organise work with, and where the data lives."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="size-4 text-muted-foreground" />
            Profile
          </CardTitle>
          <CardDescription>
            Timezone controls how timestamps are grouped and displayed. Values are stored in UTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Display name</Label>
              <Input
                id="settings-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-timezone">Timezone (IANA)</Label>
              <Input
                id="settings-timezone"
                list="timeflow-timezones"
                value={timezoneValue}
                onChange={(event) => setTimezoneValue(event.target.value)}
                placeholder={FALLBACK_TIMEZONE}
              />
              <datalist id="timeflow-timezones">
                {timezones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Detected: {detectTimezone()}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? <Loader2 className="size-4 animate-spin" /> : null}
            Save profile
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="size-4 text-muted-foreground" />
                Projects
              </CardTitle>
              <CardDescription>
                Group related tasks together. Drag a row to set its priority — the order they are
                listed in is the order the timeline lanes are handed out.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setProjectDialog({ open: true, project: null })}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <ul className="divide-y">
                {shownProjects.map((project) => (
                  <li
                    key={project.id}
                    className={cn(
                      "flex items-center gap-3 py-2",
                      drag?.id === project.id && "relative z-10 rounded bg-accent"
                    )}
                  >
                    <span
                      onPointerDown={(event) => beginDrag(event, project.id)}
                      title="Drag to change priority"
                      aria-hidden
                      className={cn(
                        "cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground",
                        drag?.id === project.id && "cursor-grabbing"
                      )}
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                      onClick={() => setProjectDialog({ open: true, project })}
                    >
                      {project.name}
                    </button>
                    {project.category_id ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor:
                              categories.find((item) => item.id === project.category_id)?.color ??
                              "transparent",
                          }}
                        />
                        {categories.find((item) => item.id === project.category_id)?.name}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {tasks.filter((task) => task.project_id === project.id && !task.deleted_at).length} tasks
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      aria-label={`Delete ${project.name}`}
                      onClick={async () => {
                        try {
                          await deleteProject(project.id);
                          toast.success("Project deleted");
                        } catch (error) {
                          toast.error("Could not delete", { description: describeError(error) });
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tags className="size-4 text-muted-foreground" />
                Categories
              </CardTitle>
              <CardDescription>How time is bucketed in the analytics.</CardDescription>
            </div>
            <div className="flex gap-2">
              {categories.length === 0 ? (
                <Button size="sm" variant="outline" onClick={addDefaultCategories}>
                  Add defaults
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCategoryDialog({ open: true, category: null })}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            ) : (
              <ul className="divide-y">
                {categories.map((category) => (
                  <li key={category.id} className="flex items-center gap-3 py-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                      onClick={() => setCategoryDialog({ open: true, category })}
                    >
                      {category.name}
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      aria-label={`Delete ${category.name}`}
                      onClick={async () => {
                        try {
                          await deleteCategory(category.id);
                          toast.success("Category deleted");
                        } catch (error) {
                          toast.error("Could not delete", { description: describeError(error) });
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-muted-foreground" />
            Data &amp; storage
          </CardTitle>
          <CardDescription>
            {mode === "supabase"
              ? "Connected to Supabase. Records are stored in PostgreSQL behind row level security."
              : "Local Mode stores everything in this browser. Add Supabase keys to sync across devices."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={mode === "supabase" ? "default" : "secondary"}>
              {mode === "supabase" ? "Supabase" : "Local Mode"}
            </Badge>
            <span className="text-muted-foreground">
              {tasks.filter((task) => !task.deleted_at).length} tasks ·{" "}
              {timeEntries.length} time entries
            </span>
            {user?.email ? <span className="text-muted-foreground">{user.email}</span> : null}
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Reset local dataset</p>
              <p className="text-xs text-muted-foreground">
                Replaces the browser dataset with fresh sample data. Only available in Local Mode.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={mode === "supabase"}
              onClick={() => setResetOpen(true)}
            >
              <AlertTriangle className="size-4" />
              Reset data
            </Button>
          </div>
        </CardContent>
      </Card>

      <ProjectDialog
        state={projectDialog}
        onOpenChange={(open) => setProjectDialog((current) => ({ ...current, open }))}
      />

      <CategoryDialog
        state={categoryDialog}
        onOpenChange={(open) => setCategoryDialog((current) => ({ ...current, open }))}
        onCreate={createCategory}
        onUpdate={updateCategory}
      />

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the local dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              All tasks, schedules and time entries in this browser are replaced with the sample
              dataset. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await resetLocalData();
                  await refresh();
                  toast.success("Local data reset");
                } catch (error) {
                  toast.error("Could not reset", { description: describeError(error) });
                }
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Category dialog                                                             */
/* -------------------------------------------------------------------------- */

function CategoryDialog({
  state,
  onOpenChange,
  onCreate,
  onUpdate,
}: {
  state: { open: boolean; category: Category | null };
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; color: string }) => Promise<Category>;
  onUpdate: (id: string, patch: { name?: string; color?: string }) => Promise<Category>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setName(state.category?.name ?? "");
    setColor(state.category?.color ?? "#6366f1");
  }, [state.open, state.category]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      toast.error("Colour must be a hex value like #6366f1");
      return;
    }
    setPending(true);
    try {
      if (state.category) {
        await onUpdate(state.category.id, { name: name.trim(), color });
        toast.success("Category updated");
      } else {
        await onCreate({ name: name.trim(), color });
        toast.success("Category created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not save the category", { description: describeError(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.category ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input id="category-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-color">Colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="category-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1"
              />
              <Input value={color} onChange={(event) => setColor(event.target.value)} className="w-32" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
