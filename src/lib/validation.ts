import { z } from "zod";

import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";

/**
 * Form schemas.
 *
 * These deliberately avoid `.transform()`: form fields stay as the raw strings
 * produced by `<input />` elements and are normalised in the submit handler.
 * Keeping input and output types identical means `zodResolver` output assigns
 * directly to the `useForm` generic without casts.
 */

const optionalUuid = z
  .string()
  .optional()
  .refine(
    (value) => !value || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value),
    "Pick a valid option"
  );

/** `datetime-local` yields "2026-11-11T09:30"; full ISO is accepted too. */
const optionalDateTime = z
  .string()
  .optional()
  .refine(
    (value) => !value || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date and time"
  );

const requiredDateTime = z
  .string()
  .min(1, "Required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Enter a valid date and time");

const optionalWholeNumber = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+$/.test(value.trim()), "Enter a whole number");

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  description: z.string().max(5000, "Description is too long").optional(),
  project_id: optionalUuid,
  category_id: optionalUuid,
  parent_task_id: optionalUuid,
  status: z.enum(TASK_STATUSES as [string, ...string[]]),
  priority: z.enum(TASK_PRIORITIES as [string, ...string[]]),
  due_date: optionalDateTime,
  estimated_minutes: optionalWholeNumber,
});
export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const scheduleFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    task_id: optionalUuid,
    project_id: optionalUuid,
    start_at: requiredDateTime,
    end_at: requiredDateTime,
    schedule_type: z.enum(["task", "event"]),
    description: z.string().max(2000, "Description is too long").optional(),
  })
  .refine((data) => new Date(data.end_at).getTime() > new Date(data.start_at).getTime(), {
    message: "End time must be later than start time",
    path: ["end_at"],
  });
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export const timeEntryFormSchema = z
  .object({
    task_id: optionalUuid,
    project_id: optionalUuid,
    category_id: optionalUuid,
    title: z.string().max(200, "Title is too long").optional(),
    start_at: requiredDateTime,
    end_at: requiredDateTime,
    notes: z.string().max(2000, "Notes are too long").optional(),
  })
  .refine((data) => new Date(data.end_at).getTime() > new Date(data.start_at).getTime(), {
    message: "End time must be later than start time",
    path: ["end_at"],
  });
export type TimeEntryFormValues = z.infer<typeof timeEntryFormSchema>;

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6366f1"),
  category_id: optionalUuid,
});
export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6366f1"),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const profileFormSchema = z.object({
  display_name: z.string().trim().max(100, "Name is too long").optional(),
  timezone: z.string().min(1, "Timezone is required"),
});
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = signInSchema.extend({
  display_name: z.string().trim().min(1, "Name is required").max(100),
});
export type SignUpValues = z.infer<typeof signUpSchema>;

/** Parse "90" -> 90; blank -> null; anything else is rejected by the schema. */
export function parseOptionalWholeNumber(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
