-- TimeFlow -- manual project priority
--
-- `sort_order` is a user-controlled priority, lowest first. On the project
-- timeline it decides which of several overlapping projects takes the left-most
-- lane, so its effect is visible without changing any date.
--
-- Kept in its own migration because `20260101000200_project_planning.sql` may
-- already have been applied.

alter table public.projects
  add column if not exists sort_order integer not null default 0;

-- The board always reads a user's projects ordered by priority.
create index if not exists projects_user_sort_idx on public.projects (user_id, sort_order);

-- Refresh the PostgREST schema cache so the new column is visible to the API
-- without a restart. Run on its own if your SQL editor wraps the batch in a
-- single transaction — a syntax error anywhere would roll the whole thing back.
notify pgrst, 'reload schema';
