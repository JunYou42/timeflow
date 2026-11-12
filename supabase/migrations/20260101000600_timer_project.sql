-- TimeFlow -- a timer can track a project as well as a task
--
-- The timer mirrors a calendar block: it points either at a single task or at
-- an ongoing project, never both. What it points at decides the category (and
-- the title) of the time entry written when the timer stops, so nothing has to
-- be picked by hand.

alter table public.timer_sessions
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'timer_sessions_project_id_fkey'
  ) then
    alter table public.timer_sessions
      add constraint timer_sessions_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
end;
$$;

create index if not exists timer_sessions_project_idx on public.timer_sessions (project_id);

-- ---------------------------------------------------------------------------
-- start_timer gains the project link. A new parameter is a *different*
-- signature, so `create or replace` is not enough -- the one-argument version
-- has to go, otherwise PostgREST is left with two candidates and cannot resolve
-- `start_timer(p_task_id, p_project_id)`.
-- ---------------------------------------------------------------------------
drop function if exists public.start_timer(uuid);

create function public.start_timer(p_task_id uuid default null, p_project_id uuid default null)
returns public.timer_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.timer_sessions;
  v_session  public.timer_sessions;
begin
  select * into v_existing
  from public.timer_sessions
  where user_id = auth.uid()
    and status in ('running', 'paused')
  for update;

  if found
     and (v_existing.task_id is distinct from p_task_id
          or v_existing.project_id is distinct from p_project_id) then
    raise exception 'TIMER_ALREADY_ACTIVE'
      using detail = v_existing.id::text, hint = 'Stop or pause the current timer first.';
  end if;

  if found then
    return v_existing;
  end if;

  insert into public.timer_sessions (
    user_id, task_id, project_id, status, started_at, accumulated_seconds
  )
  values (auth.uid(), p_task_id, p_project_id, 'running', now(), 0)
  returning * into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- stop_timer now files the entry under whatever was tracked: the task first,
-- then its project. Same signature as before, so it is simply replaced.
-- ---------------------------------------------------------------------------
create or replace function public.stop_timer()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session  public.timer_sessions;
  v_entry    public.time_entries;
  v_elapsed  int;
  v_end      timestamptz := now();
  v_category uuid;
  v_title    text;
begin
  select * into v_session
  from public.timer_sessions
  where user_id = auth.uid()
    and status in ('running', 'paused')
  for update;

  if not found then
    return jsonb_build_object('session', null, 'entry', null);
  end if;

  v_elapsed := v_session.accumulated_seconds
    + case when v_session.status = 'running'
        then greatest(0, floor(extract(epoch from (v_end - v_session.started_at)))::int)
        else 0
      end;

  update public.timer_sessions
     set status = 'stopped',
         accumulated_seconds = v_elapsed,
         paused_at = case when v_session.status = 'running' then v_end else v_session.paused_at end
   where id = v_session.id
  returning * into v_session;

  if v_elapsed > 0 then
    select category_id, title into v_category, v_title
    from public.tasks
    where id = v_session.task_id;

    if v_category is null and v_session.project_id is not null then
      select category_id, name into v_category, v_title
      from public.projects
      where id = v_session.project_id;
    end if;

    insert into public.time_entries (
      user_id, task_id, project_id, category_id, start_at, end_at, duration_seconds, source, title
    )
    values (
      auth.uid(),
      v_session.task_id,
      v_session.project_id,
      v_category,
      v_end - make_interval(secs => v_elapsed),
      v_end,
      v_elapsed,
      'timer',
      coalesce(v_title, 'Tracked session')
    )
    returning * into v_entry;
  end if;

  return jsonb_build_object('session', to_jsonb(v_session), 'entry', to_jsonb(v_entry));
end;
$$;

grant execute on function public.start_timer(uuid, uuid) to authenticated;
grant execute on function public.stop_timer() to authenticated;

-- Refresh the PostgREST schema cache so the new signature is callable right
-- away instead of after the next project restart.
notify pgrst, 'reload schema';
