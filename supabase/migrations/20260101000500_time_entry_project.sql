-- TimeFlow -- time entries can belong to a project
--
-- Time logs mirror the calendar: a recorded block is attached either to a
-- single task or to an ongoing project. The entry's category is then derived
-- from whichever of the two it points at, so the analytics breakdown stays
-- consistent without asking the user to pick one by hand.
--
-- Nullable with `on delete set null`: archiving a project keeps the tracked
-- history, it only drops the association.
--
-- Kept as its own migration so it can be applied on top of
-- 20260101000400_project_category_schedule_project.sql as well as to a fresh
-- database.

alter table public.time_entries
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'time_entries_project_id_fkey'
  ) then
    alter table public.time_entries
      add constraint time_entries_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
end;
$$;

create index if not exists time_entries_project_idx on public.time_entries (project_id);

-- Refresh the PostgREST schema cache so the new column is visible to the API
-- without a restart.
notify pgrst, 'reload schema';
