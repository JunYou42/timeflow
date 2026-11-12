"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { parseLocalInputValue, toLocalInputValue } from "@/lib/time";
import { PROJECT_QUADRANT_LABELS, projectQuadrant, type Project } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

const NO_CATEGORY = "__none__";

export interface ProjectDialogState {
  open: boolean;
  project: Project | null;
}

/**
 * Create or edit a project, including the planning metadata the timeline board
 * lays out: the planned window, the two Eisenhower axes and the hand estimate.
 */
export function ProjectDialog({
  state,
  onOpenChange,
}: {
  state: ProjectDialogState;
  onOpenChange: (open: boolean) => void;
}) {
  const timezone = useUserTimezone();
  const categories = useAppStore((store) => store.categories);
  const createProject = useAppStore((store) => store.createProject);
  const updateProject = useAppStore((store) => store.updateProject);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [estimatedHours, setEstimatedHours] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const project = state.project;
    setName(project?.name ?? "");
    setColor(project?.color ?? "#6366f1");
    setDescription(project?.description ?? "");
    setCategoryId(project?.category_id ?? null);
    setStartDate(project?.start_date ? toLocalInputValue(project.start_date, timezone) : "");
    setEndDate(project?.end_date ? toLocalInputValue(project.end_date, timezone) : "");
    setIsUrgent(project?.is_urgent ?? false);
    setIsImportant(project?.is_important ?? false);
    setEstimatedHours(project?.estimated_hours != null ? String(project.estimated_hours) : "");
  }, [state.open, state.project, timezone]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      toast.error("Colour must be a hex value like #6366f1");
      return;
    }
    const estimate = estimatedHours.trim();
    if (estimate && !/^\d+(\.\d{1,2})?$/.test(estimate)) {
      toast.error("Estimate must be a number of hours, e.g. 1.5");
      return;
    }

    const start = startDate ? parseLocalInputValue(startDate, timezone) : null;
    const end = endDate ? parseLocalInputValue(endDate, timezone) : null;
    if (start && end && end.getTime() < start.getTime()) {
      toast.error("The end date must be on or after the start date");
      return;
    }

    const payload = {
      name: name.trim(),
      color,
      description: description.trim() || null,
      category_id: categoryId,
      start_date: start ? start.toISOString() : null,
      end_date: end ? end.toISOString() : null,
      is_urgent: isUrgent,
      is_important: isImportant,
      estimated_hours: estimate ? Math.round(Number.parseFloat(estimate) * 100) / 100 : null,
    };

    setPending(true);
    try {
      if (state.project) {
        await updateProject(state.project.id, payload);
        toast.success("Project updated");
      } else {
        await createProject(payload);
        toast.success("Project created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not save the project", { description: describeError(error) });
    } finally {
      setPending(false);
    }
  };

  const quadrant = PROJECT_QUADRANT_LABELS[
    projectQuadrant({ is_urgent: isUrgent, is_important: isImportant })
  ];

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{state.project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Dates place the project on the timeline; urgency and importance pick its quadrant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-color">Colour</Label>
              <div className="flex items-center gap-2">
                <input
                  id="project-color"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1"
                />
                <Input value={color} onChange={(event) => setColor(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-estimate">Estimated hours</Label>
              <Input
                id="project-estimate"
                inputMode="decimal"
                value={estimatedHours}
                onChange={(event) => setEstimatedHours(event.target.value)}
                placeholder="e.g. 1.5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={categoryId ?? NO_CATEGORY}
              onValueChange={(value) => setCategoryId(value === NO_CATEGORY ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span
                      className="mr-2 inline-block size-2 rounded-full align-middle"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-start">Starts</Label>
              <Input
                id="project-start"
                type="datetime-local"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-end">Ends</Label>
              <Input
                id="project-end"
                type="datetime-local"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="project-urgent" className="font-normal">
                Urgent
              </Label>
              <Switch id="project-urgent" checked={isUrgent} onCheckedChange={setIsUrgent} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="project-important" className="font-normal">
                Important
              </Label>
              <Switch
                id="project-important"
                checked={isImportant}
                onCheckedChange={setIsImportant}
              />
            </div>
            <p className="text-xs text-muted-foreground">Quadrant: {quadrant}</p>
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
