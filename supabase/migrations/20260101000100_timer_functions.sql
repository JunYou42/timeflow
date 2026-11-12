-- TimeFlow -- timer operations
--
-- The timer is the one place where a client-side read-modify-write is unsafe:
-- two tabs (or a refresh mid-request) could otherwise create two active
-- sessions or lose accumulated time. These functions move each transition into
-- a single transactional statement and are the only supported way to mutate
-- `timer_sessions`.
--
-- The client reaches them over PostgREST (`rpc('start_timer', { p_task_id })`),
-- which resolves a function by its argument *names*. `create or replace` will
-- not rename an existing parameter, so a function left over from an earlier
-- build would survive and PostgREST would keep answering
-- "Could not find the function public.start_timer(p_task_id) in the schema
-- cache". Dropping by argument *types* first -- names do not take part in the
-- match -- makes this file safe to re-run as a repair.

drop function if exists public.start_timer(uuid);
drop function if exists public.pause_timer();
drop function if exists public.resume_timer();
drop function if exists public.stop_timer();
drop function if exists public.discard_timer();

-- ---------------------------------------------------------------------------
-- start_timer: guarantees at most one active session per user.
-- ---------------------------------------------------------------------------
create or replace function public.start_timer(p_task_id uuid default null)
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

  if found and v_existing.task_id is distinct from p_task_id then
    raise exception 'TIMER_ALREADY_ACTIVE'
      using detail = v_existing.id::text, hint = 'Stop or pause the current timer first.';
  end if;

  if found then
    return v_existing;
  end if;

  insert into public.timer_sessions (user_id, task_id, status, started_at, accumulated_seconds)
  values (auth.uid(), p_task_id, 'running', now(), 0)
  returning * into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- pause_timer: folds the running segment into accumulated_seconds.
-- ---------------------------------------------------------------------------
create or replace function public.pause_timer()
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
   where user_id = auth.uid()
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
create or replace function public.resume_timer()
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
   where user_id = auth.uid()
     and status = 'paused'
  returning * into v_session;

  if not found then
    raise exception 'NO_PAUSED_TIMER';
  end if;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- stop_timer: stops the active session and writes the derived time entry.
-- Returns { "session": {...}, "entry": {...} | null }.
-- ---------------------------------------------------------------------------
create or replace function public.stop_timer()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.timer_sessions;
  v_entry   public.time_entries;
  v_elapsed int;
  v_end     timestamptz := now();
  v_category uuid;
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
    select category_id into v_category
    from public.tasks
    where id = v_session.task_id;

    insert into public.time_entries (
      user_id, task_id, category_id, start_at, end_at, duration_seconds, source, title
    )
    values (
      auth.uid(),
      v_session.task_id,
      v_category,
      v_end - make_interval(secs => v_elapsed),
      v_end,
      v_elapsed,
      'timer',
      (select title from public.tasks where id = v_session.task_id)
    )
    returning * into v_entry;
  end if;

  return jsonb_build_object('session', to_jsonb(v_session), 'entry', to_jsonb(v_entry));
end;
$$;

-- ---------------------------------------------------------------------------
-- discard_timer: stop without recording any time.
-- ---------------------------------------------------------------------------
create or replace function public.discard_timer()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.timer_sessions
     set status = 'stopped'
   where user_id = auth.uid()
     and status in ('running', 'paused');
$$;

grant execute on function public.start_timer(uuid) to authenticated;
grant execute on function public.pause_timer() to authenticated;
grant execute on function public.resume_timer() to authenticated;
grant execute on function public.stop_timer() to authenticated;
grant execute on function public.discard_timer() to authenticated;
grant execute on function public.has_schedule_overlap(timestamptz, timestamptz, uuid) to authenticated;

-- Refresh the PostgREST schema cache so the (re)created functions are callable
-- right away instead of after the next project restart.
notify pgrst, 'reload schema';
