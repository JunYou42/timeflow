-- TimeFlow -- project planning fields
--
-- Adds the planning attributes the Projects timeline needs: a planned window,
-- the two Eisenhower axes and a hand-written estimate (in hours, decimals
-- allowed so 1.5 means ninety minutes).
--
-- Kept as a separate migration so it can be applied to a database that already
-- ran 20260101000000_init_timeflow.sql as well as to a fresh one.

alter table public.projects
  add column if not exists start_date        timestamptz,
  add column if not exists end_date          timestamptz,
  add column if not exists is_urgent         boolean not null default false,
  add column if not exists is_important      boolean not null default false,
  add column if not exists estimated_hours   numeric(6, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_estimated_hours_check'
  ) then
    alter table public.projects
      add constraint projects_estimated_hours_check
      check (estimated_hours is null or estimated_hours >= 0);
  end if;

  -- Bounds may be open-ended, but an end before the start is never valid.
  if not exists (
    select 1 from pg_constraint where conname = 'projects_time_order'
  ) then
    alter table public.projects
      add constraint projects_time_order
      check (end_date is null or start_date is null or end_date >= start_date);
  end if;
end;
$$;

create index if not exists projects_user_start_idx on public.projects (user_id, start_date);
