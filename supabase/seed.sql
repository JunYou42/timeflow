-- TimeFlow -- optional demo seed
--
-- Run this AFTER the migrations, from the Supabase SQL editor (service role) or
-- `psql`, to explore the product with realistic data:
--
--     psql "$DATABASE_URL" -f supabase/seed.sql
--
-- The rows are inserted for the most recently created auth user and use fixed
-- uuid literals + `on conflict do nothing`, so re-running the script is safe.
-- It never touches other users' data, and it is entirely optional -- the app
-- works on an empty database.

do $$
declare
  v_user  uuid;
  v_today timestamptz := date_trunc('day', now());
begin
  select id into v_user from auth.users order by created_at desc limit 1;

  if v_user is null then
    raise notice 'TimeFlow seed: no auth user found -- sign up in the app first, then re-run.';
    return;
  end if;

  -- Profile ------------------------------------------------------------------
  insert into public.profiles (id, display_name, timezone)
  values (v_user, 'Demo User', 'Asia/Shanghai')
  on conflict (id) do nothing;

  -- Categories (the sign-up trigger normally creates these) -------------------
  insert into public.categories (user_id, name, color)
  select v_user, c.name, c.color
  from (values
    ('Work', '#6366f1'),
    ('Learning', '#0ea5e9'),
    ('Personal', '#10b981'),
    ('Hobby', '#f59e0b'),
    ('Other', '#94a3b8')
  ) as c(name, color)
  where not exists (
    select 1 from public.categories x where x.user_id = v_user and x.name = c.name
  );

  -- Projects -----------------------------------------------------------------
  -- Ranges deliberately overlap so the timeline has lanes, and all four
  -- Eisenhower quadrants are represented. `sort_order` sets the priority and
  -- therefore which project takes the left-most lane where the windows overlap.
  insert into public.projects (
    id, user_id, name, description, color,
    start_date, end_date, is_urgent, is_important, estimated_hours, sort_order
  ) values
    ('b1000000-0000-4000-8000-000000000001', v_user, 'TimeFlow',           'Ship the personal time management app', '#6366f1', v_today - interval '6 days',  v_today + interval '6 days',  true,  true,   40, 0),
    ('b1000000-0000-4000-8000-000000000004', v_user, 'Certification prep', 'AWS Solutions Architect study plan',    '#f59e0b', v_today - interval '2 days',  v_today + interval '2 days',  true,  false,  15, 1),
    ('b1000000-0000-4000-8000-000000000002', v_user, 'Flight Data',        'Analyse QAR / ALPR exports',            '#0ea5e9', v_today - interval '10 days', v_today - interval '1 day',   false, true,   20, 2),
    ('b1000000-0000-4000-8000-000000000003', v_user, 'Personal',           'Health, reading and side quests',       '#10b981', v_today,                     v_today + interval '20 days', false, false,  10, 3)
  on conflict (id) do nothing;

  -- File each project under the same categories its tasks use.
  update public.projects p
  set category_id = c.id
  from public.categories c
  where p.user_id = v_user
    and c.user_id = v_user
    and (p.name, c.name) in (
      ('TimeFlow', 'Work'),
      ('Certification prep', 'Learning'),
      ('Flight Data', 'Work'),
      ('Personal', 'Personal')
    );

  -- Tags ---------------------------------------------------------------------
  insert into public.tags (id, user_id, name, color) values
    ('f1000000-0000-4000-8000-000000000001', v_user, 'focus',     '#6366f1'),
    ('f1000000-0000-4000-8000-000000000002', v_user, 'deep-work', '#8b5cf6'),
    ('f1000000-0000-4000-8000-000000000003', v_user, 'admin',     '#94a3b8')
  on conflict (id) do nothing;

  -- Tasks --------------------------------------------------------------------
  insert into public.tasks (
    id, user_id, project_id, category_id, parent_task_id, title, description,
    status, priority, due_date, estimated_minutes, sort_order, completed_at
  )
  select
    t.id, v_user, t.project_id,
    (select id from public.categories where user_id = v_user and name = t.category limit 1),
    t.parent_id, t.title, t.descr, t.status::public.task_status, t.priority::public.task_priority,
    v_today + t.due_offset, t.estimate, t.sort_order, t.completed_offset
  from (values
    ('c1000000-0000-4000-8000-000000000001'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, 'Work'::text, null::uuid, 'Draft TimeFlow database schema', null, 'done', 'high', interval '-2 days 18 hours', 120, 0, interval '-2 days 17 hours'),
    ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Work', null, 'Build task management module', 'Table, list and kanban views plus the detail drawer.', 'in_progress', 'urgent', interval '18 hours', 240, 1, null),
    ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'Work', null, 'Wire timer persistence to the database', null, 'todo', 'high', interval '1 day 18 hours', 180, 2, null),
    ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'Work', null, 'Review analytics charts', null, 'todo', 'medium', interval '2 days 12 hours', 60, 3, null),
    ('c1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000002', 'Work', null, 'Prepare monthly fleet report', null, 'in_progress', 'high', interval '3 days 18 hours', 300, 4, null),
    ('c1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000004', 'Learning', null, 'Read ''Deep Work'' chapter 4', null, 'todo', 'low', interval '1 day 22 hours', 45, 5, null),
    ('c1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000003', 'Hobby', null, 'Morning run', null, 'done', 'low', interval '7 hours', 40, 6, interval '7 hours 40 minutes'),
    ('c1000000-0000-4000-8000-000000000008', 'b1000000-0000-4000-8000-000000000003', 'Personal', null, 'Weekly review', null, 'todo', 'medium', interval '-1 day 20 hours', 30, 7, null),
    ('c1000000-0000-4000-8000-000000000009', 'b1000000-0000-4000-8000-000000000002', 'Work', null, 'Migrate legacy time logs', null, 'cancelled', 'low', null, null, 8, null),
    ('c1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-000000000001', 'Work', 'c1000000-0000-4000-8000-000000000002'::uuid, 'Implement kanban drag & drop', null, 'todo', 'high', null, 90, 0, null),
    ('c1000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-000000000001', 'Work', 'c1000000-0000-4000-8000-000000000002'::uuid, 'Add task detail drawer', null, 'done', 'medium', null, 60, 1, interval '11 hours')
  ) as t(id, project_id, category, parent_id, title, descr, status, priority, due_offset, estimate, sort_order, completed_offset)
  on conflict (id) do nothing;

  -- Schedules ----------------------------------------------------------------
  insert into public.schedules (id, user_id, task_id, title, start_at, end_at, schedule_type, description) values
    ('d1000000-0000-4000-8000-000000000001', v_user, 'c1000000-0000-4000-8000-000000000007', 'Morning run',                        v_today + interval '7 hours',        v_today + interval '7 hours 45 minutes', 'task',  null),
    ('d1000000-0000-4000-8000-000000000002', v_user, null,                                    'Team stand-up',                      v_today + interval '9 hours 30 minutes', v_today + interval '10 hours',      'event', 'Daily sync'),
    ('d1000000-0000-4000-8000-000000000003', v_user, 'c1000000-0000-4000-8000-000000000002', 'Build task management module',       v_today + interval '10 hours',       v_today + interval '12 hours 30 minutes', 'task',  null),
    ('d1000000-0000-4000-8000-000000000004', v_user, null,                                    'Lunch',                              v_today + interval '12 hours 30 minutes', v_today + interval '13 hours 30 minutes', 'event', null),
    ('d1000000-0000-4000-8000-000000000005', v_user, 'c1000000-0000-4000-8000-000000000002', 'Build task management module',       v_today + interval '14 hours',       v_today + interval '17 hours',      'task',  null),
    ('d1000000-0000-4000-8000-000000000006', v_user, 'c1000000-0000-4000-8000-000000000006', 'Read ''Deep Work'' chapter 4',       v_today + interval '1 day 21 hours',  v_today + interval '1 day 22 hours', 'task',  null),
    ('d1000000-0000-4000-8000-000000000007', v_user, 'c1000000-0000-4000-8000-000000000003', 'Wire timer persistence',             v_today + interval '1 day 10 hours',  v_today + interval '1 day 12 hours', 'task',  null),
    ('d1000000-0000-4000-8000-000000000008', v_user, 'c1000000-0000-4000-8000-000000000004', 'Review analytics charts',            v_today + interval '2 days 10 hours', v_today + interval '2 days 11 hours', 'task', null),
    ('d1000000-0000-4000-8000-000000000009', v_user, 'c1000000-0000-4000-8000-000000000005', 'Prepare monthly fleet report',       v_today + interval '3 days 9 hours',  v_today + interval '3 days 12 hours', 'task', null),
    ('d1000000-0000-4000-8000-00000000000a', v_user, 'c1000000-0000-4000-8000-000000000008', 'Weekly review',                      v_today - interval '1 day' + interval '19 hours 30 minutes', v_today - interval '1 day' + interval '20 hours', 'task', null),
    ('d1000000-0000-4000-8000-00000000000b', v_user, 'c1000000-0000-4000-8000-000000000001', 'Draft TimeFlow database schema',     v_today - interval '2 days' + interval '15 hours', v_today - interval '2 days' + interval '17 hours', 'task', null)
  on conflict (id) do nothing;

  -- One event belongs to a project rather than a task, so the calendar shows a
  -- project-linked block out of the box.
  update public.schedules
  set project_id = 'b1000000-0000-4000-8000-000000000001'
  where id = 'd1000000-0000-4000-8000-000000000002'
    and user_id = v_user;

  -- Time entries (two weeks of history so trends have shape) ------------------
  -- One entry deliberately crosses midnight to prove per-day splitting works.
  insert into public.time_entries (id, user_id, task_id, category_id, start_at, end_at, duration_seconds, source, title, notes)
  select
    e.id, v_user, e.task_id,
    (select id from public.categories where user_id = v_user and name = e.category limit 1),
    e.start_at, e.end_at,
    greatest(0, floor(extract(epoch from (e.end_at - e.start_at)))::int),
    e.source::public.time_entry_source, e.title, e.notes
  from (values
    ('e1000000-0000-4000-8000-000000000001'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid, 'Work',     v_today - interval '2 days' + interval '15 hours', v_today - interval '2 days' + interval '17 hours 10 minutes', 'timer',  null, null),
    ('e1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000008', 'Personal', v_today - interval '1 day' + interval '19 hours 30 minutes', v_today - interval '1 day' + interval '20 hours 5 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000007', 'Hobby',    v_today + interval '7 hours', v_today + interval '7 hours 42 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000002', 'Work',     v_today + interval '10 hours 5 minutes', v_today + interval '12 hours 15 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-000000000005', null,                                   'Personal', v_today + interval '12 hours 30 minutes', v_today + interval '13 hours 10 minutes', 'manual', 'Lunch', 'Unplanned break'),
    ('e1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000002', 'Work',     v_today + interval '14 hours 10 minutes', v_today + interval '15 hours 30 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000005', 'Work',     v_today - interval '3 days' + interval '9 hours 30 minutes', v_today - interval '3 days' + interval '12 hours 30 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000005', 'Work',     v_today - interval '4 days' + interval '9 hours', v_today - interval '4 days' + interval '11 hours 45 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000006', 'Learning', v_today - interval '5 days' + interval '21 hours', v_today - interval '5 days' + interval '21 hours 50 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-00000000000a', null,                                   'Personal', v_today - interval '5 days' + interval '8 hours', v_today - interval '5 days' + interval '8 hours 25 minutes', 'manual', 'Commute', null),
    ('e1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-000000000002', 'Work',     v_today - interval '6 days' + interval '10 hours', v_today - interval '6 days' + interval '13 hours', 'timer', null, null),
    ('e1000000-0000-4000-8000-00000000000c', 'c1000000-0000-4000-8000-000000000004', 'Work',     v_today - interval '7 days' + interval '15 hours', v_today - interval '7 days' + interval '16 hours', 'timer', null, null),
    ('e1000000-0000-4000-8000-00000000000d', 'c1000000-0000-4000-8000-000000000005', 'Work',     v_today - interval '8 days' + interval '9 hours', v_today - interval '8 days' + interval '12 hours 20 minutes', 'timer', null, null),
    ('e1000000-0000-4000-8000-00000000000e', null,                                   'Hobby',    v_today - interval '9 days' + interval '19 hours', v_today - interval '9 days' + interval '20 hours 30 minutes', 'manual', 'Guitar practice', null),
    ('e1000000-0000-4000-8000-00000000000f', 'c1000000-0000-4000-8000-000000000002', 'Work',     v_today - interval '1 day' + interval '23 hours', v_today + interval '1 hour', 'timer', null, 'Crosses midnight on purpose')
  ) as e(id, task_id, category, start_at, end_at, source, title, notes)
  on conflict (id) do nothing;

  -- One block is tracked against a project rather than a task, the way a
  -- calendar block can be. `category_id` already matches the project's category.
  update public.time_entries
  set project_id = 'b1000000-0000-4000-8000-000000000002',
      task_id = null
  where id = 'e1000000-0000-4000-8000-000000000006' and user_id = v_user;

  raise notice 'TimeFlow seed: demo data inserted for user %.', v_user;
end;
$$;
