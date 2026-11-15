-- TimeFlow -- routine tasks
--
-- Some tasks are standing commitments rather than one-off pieces of work: a
-- weekly review, a daily stand-up, an inbox sweep. They never really finish, so
-- "done" is the wrong place for them and so is a backlog full of "todo". The
-- new `routine` value sits with the other progress stages, after `done` and
-- before `cancelled`, matching `TaskStatus` in `src/lib/types.ts`.

alter type public.task_status add value if not exists 'routine' after 'done';
