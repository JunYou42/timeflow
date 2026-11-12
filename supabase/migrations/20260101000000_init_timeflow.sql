-- TimeFlow -- initial schema
--
-- Tables, enums, indexes, row level security and the helper objects the
-- application relies on. Mirrors `src/lib/types.ts` one-to-one.
--
-- Conventions
--   * uuid primary keys (gen_random_uuid)
--   * timestamptz everywhere, stored in UTC
--   * every user-owned row carries `user_id` and is protected by RLS so a user
--     can only ever read/write their own records
--   * deletes are soft where history matters (tasks -> deleted_at,
--     projects -> archived_at); time entries are hard-deleted only on request

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.schedule_type as enum ('task', 'event');
create type public.time_entry_source as enum ('timer', 'manual');
create type public.timer_status as enum ('running', 'paused', 'stopped');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  timezone      text not null default 'Asia/Shanghai',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  description  text,
  color        text not null default '#6366f1',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_user_id_idx on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  color       text not null default '#94a3b8',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tags_user_id_idx on public.tags (user_id);

-- ---------------------------------------------------------------------------
-- tasks
--
-- Tasks are an independent entity: deleting one never deletes the time that
-- was already tracked against it (see `time_entries.task_id on delete set null`).
-- `parent_task_id` gives one level of subtasks for free.
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  project_id         uuid references public.projects (id) on delete set null,
  category_id        uuid references public.categories (id) on delete set null,
  parent_task_id     uuid references public.tasks (id) on delete set null,
  title              text not null check (length(trim(title)) > 0),
  description        text,
  status             public.task_status not null default 'todo',
  priority           public.task_priority not null default 'medium',
  due_date           timestamptz,
  estimated_minutes  integer check (estimated_minutes is null or estimated_minutes >= 0),
  sort_order         integer not null default 0,
  deleted_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_parent_idx on public.tasks (parent_task_id);
create index tasks_live_idx on public.tasks (user_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- task_tags  (join table; user_id is denormalised so RLS stays a simple check)
-- ---------------------------------------------------------------------------
create table public.task_tags (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (task_id, tag_id)
);

create index task_tags_user_id_idx on public.task_tags (user_id);

-- ---------------------------------------------------------------------------
-- schedules  (planned time; independent from tasks but optionally linked)
-- ---------------------------------------------------------------------------
create table public.schedules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  task_id        uuid references public.tasks (id) on delete set null,
  title          text not null check (length(trim(title)) > 0),
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  schedule_type  public.schedule_type not null default 'task',
  description    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint schedules_time_order check (end_at > start_at)
);

create index schedules_user_start_idx on public.schedules (user_id, start_at);
create index schedules_task_idx on public.schedules (task_id);

-- ---------------------------------------------------------------------------
-- time_entries  (what actually happened)
--
-- Rows may span midnight; consumers split them per calendar day using a
-- half-open [start_at, end_at) window so nothing is counted twice.
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  task_id           uuid references public.tasks (id) on delete set null,
  schedule_id       uuid references public.schedules (id) on delete set null,
  category_id       uuid references public.categories (id) on delete set null,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  duration_seconds  integer not null default 0 check (duration_seconds >= 0),
  source            public.time_entry_source not null default 'manual',
  title             text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint time_entries_time_order check (end_at > start_at)
);

create index time_entries_user_start_idx on public.time_entries (user_id, start_at desc);
create index time_entries_task_idx on public.time_entries (task_id);
create index time_entries_category_idx on public.time_entries (category_id);

-- ---------------------------------------------------------------------------
-- timer_sessions
--
-- The partial unique index is what actually enforces "at most one active timer
-- per user"; the SQL functions in 20260101000100 move every transition into a
-- single statement so two tabs cannot create two sessions.
-- ---------------------------------------------------------------------------
create table public.timer_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  task_id              uuid references public.tasks (id) on delete set null,
  status               public.timer_status not null default 'running',
  started_at           timestamptz not null default now(),
  paused_at            timestamptz,
  accumulated_seconds  integer not null default 0 check (accumulated_seconds >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index timer_sessions_user_idx on public.timer_sessions (user_id);

create unique index timer_sessions_one_active_per_user_idx
  on public.timer_sessions (user_id)
  where status in ('running', 'paused');

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger schedules_set_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

create trigger timer_sessions_set_updated_at
  before update on public.timer_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user -> profile row + starter categories
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Asia/Shanghai')
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, color)
  values
    (new.id, 'Work', '#6366f1'),
    (new.id, 'Learning', '#0ea5e9'),
    (new.id, 'Personal', '#10b981'),
    (new.id, 'Hobby', '#f59e0b'),
    (new.id, 'Other', '#94a3b8');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- has_schedule_overlap: pure read helper used for calendar conflict feedback.
-- Half-open comparison so back-to-back blocks do not count as a conflict.
-- ---------------------------------------------------------------------------
create or replace function public.has_schedule_overlap(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_id uuid default null
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.schedules s
    where s.user_id = auth.uid()
      and (p_exclude_id is null or s.id <> p_exclude_id)
      and s.start_at < p_end
      and s.end_at > p_start
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.categories     enable row level security;
alter table public.tags           enable row level security;
alter table public.task_tags      enable row level security;
alter table public.tasks          enable row level security;
alter table public.schedules      enable row level security;
alter table public.time_entries   enable row level security;
alter table public.timer_sessions enable row level security;

create policy "profiles are self-accessible"
  on public.profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "projects belong to their owner"
  on public.projects for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "categories belong to their owner"
  on public.categories for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "tags belong to their owner"
  on public.tags for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "task tags belong to their owner"
  on public.task_tags for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "tasks belong to their owner"
  on public.tasks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "schedules belong to their owner"
  on public.schedules for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "time entries belong to their owner"
  on public.time_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "timer sessions belong to their owner"
  on public.timer_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.has_schedule_overlap(timestamptz, timestamptz, uuid) to authenticated;
