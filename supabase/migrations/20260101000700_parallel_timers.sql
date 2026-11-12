-- TimeFlow -- timers can run in parallel
--
-- A day is rarely one thing at a time: a meeting and a code review can overlap,
-- and both should end up in the log. The "at most one active timer per user"
-- rule is therefore lifted -- the partial unique index goes, and so does the
-- guard inside `start_timer` -- and every transition now names the session it
-- acts on instead of acting on "the" active one.
--
-- Function arguments take part in a PostgREST signature, so the old
-- zero-argument versions have to be dropped rather than replaced, otherwise
-- PostgREST is left with two candidates and cannot resolve either.

drop index if exists public.timer_sessions_one_active_per_user_idx;

drop function if exists public.pause_timer();
drop function if exists public.pause_timer(uuid);
drop function if exists public.resume_timer();
drop function if exists public.resume_timer(uuid);
drop function if exists public.stop_timer();
drop function if exists public.stop_timer(uuid);
drop function if exists public.discard_timer();
drop function if exists public.discard_timer(uuid);

-- ---------------------------------------------------------------------------
-- start_timer: opens a session for a task or a project. Several may be open at
-- once; starting the same thing twice hands back the session that is already
-- running rather than creating a duplicate.
-- ---------------------------------------------------------------------------
create or replace function public.start_timer(p_task_id uuid default null, p_project_id uuid default null)
returns public.timer_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.timer_sessions;
begin
  select * into v_session
  from public.timer_sessions
  where user_id = auth.uid()
    and status in ('running', 'paused')
    and task_id is not distinct from p_task_id
    and project_id is not distinct from p_project_id;

  if found then
    return v_session;
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
-- pause_timer: folds the running segment of one session into accumulated_seconds.
-- ---------------------------------------------------------------------------
create function public.pause_timer(p_session_id uuid)
returns public.timer_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.timer_sessions;
begin
  update public.timer_sessions
     set status = 'paused',
         accumulated_seconds = accumulated_seconds
           + greatest(0, floor(extract(epoch from (now() - started_at)))::int),
         paused_at = now()
   where id = p_session_id
     and user_id = auth.uid()
     and status = 'running'
  returning * into v_session;

  if not found then
    raise exception 'NO_RUNNING_TIMER';
  end if;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- resume_timer
-- ---------------------------------------------------------------------------
create function public.resume_timer(p_session_id uuid)
returns public.timer_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.timer_sessions;
begin
  update public.timer_sessions
     set status = 'running',
         started_at = now(),
         paused_at = null
   where id = p_session_id
     and user_id = auth.uid()
     and status = 'paused'
  returning * into v_session;

  if not found then
    raise exception 'NO_PAUSED_TIMER';
  end if;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- stop_timer: closes one session and writes the time entry it earned. The entry
-- is filed under whatever was tracked -- the task first, then its project.
-- Returns { "session": {...}, "entry": {...} | null }.
-- ---------------------------------------------------------------------------
create function public.stop_timer(p_session_id uuid)
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
  where id = p_session_id
    and user_id = auth.uid()
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

-- ---------------------------------------------------------------------------
-- discard_timer: close one session without recording any time.
-- ---------------------------------------------------------------------------
create function public.discard_timer(p_session_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.timer_sessions
     set status = 'stopped'
   where id = p_session_id
     and user_id = auth.uid()
     and status in ('running', 'paused');
$$;

grant execute on function public.start_timer(uuid, uuid) to authenticated;
grant execute on function public.pause_timer(uuid) to authenticated;
grant execute on function public.resume_timer(uuid) to authenticated;
grant execute on function public.stop_timer(uuid) to authenticated;
grant execute on function public.discard_timer(uuid) to authenticated;

-- Refresh the PostgREST schema cache so the new signatures are callable right
-- away instead of after the next project restart.
notify pgrst, 'reload schema';
