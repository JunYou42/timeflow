-- TimeFlow -- project category + schedule project link
--
-- Two optional associations:
--   * projects.category_id -- file a project under the same categories the
--                             tasks and time entries already use, so the
--                             analytics breakdown can roll projects up too.
--   * schedules.project_id -- a calendar block can belong to an ongoing
--                             project, not only to a task.
--
-- Both are nullable with `on delete set null`: removing a category or
-- archiving a project never deletes a schedule or the project itself.
--
-- Kept as its own migration so it can be applied on top of
-- 20260101000300_project_sort_order.sql as well as to a fresh database.

alter table public.projects
  add column if not exists category_id uuid;

alter table public.schedules
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_category_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_category_id_fkey
      foreign key (category_id) references public.categories (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'schedules_project_id_fkey'
  ) then
    alter table public.schedules
      add constraint schedules_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
end;
$$;

create index if not exists projects_category_idx on public.projects (category_id);
create index if not exists schedules_project_idx on public.schedules (project_id);

-- Refresh the PostgREST schema cache so the new columns are visible to the API
-- without a restart. Run on its own if your SQL editor wraps the batch in a
-- single transaction -- a syntax error anywhere would roll the whole thing back.
notify pgrst, 'reload schema';
