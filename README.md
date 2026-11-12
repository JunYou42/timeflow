# TimeFlow

A personal productivity and time-management app built around four linked ideas:

| Concept          | Question it answers      | Table           |
| ---------------- | ------------------------ | --------------- |
| **Task**         | What needs doing?        | `tasks`         |
| **Schedule**     | When do I plan to do it? | `schedules`     |
| **Time entry**   | How long did it take?    | `time_entries`  |
| **Analytics**    | Where did the time go?   | derived         |

The four are deliberately independent: a task exists without a schedule, a
schedule exists without a task (events), and time can be tracked with or without
a task. Everything you see in the dashboard and analytics is computed from real
records — no hard-coded chart values.

## Features

- **Overview** — today / this week / open / overdue summary, a 14-day trend,
  today's plan, what's next, and an always-available timer. Starting a timer
  asks for a task **or** an ongoing project, so a session can be tracked against
  either kind of work. **Timers run in parallel**: several can be open at once
  (a meeting and a review, say), each with its own Pause / Resume / Stop, and
  each writes its own time entry — so overlapping records show up on both
  Calendar and Time logs.
- **Tasks** — table, list and kanban views over the same data; search, filter by
  period / status / project / category; five sort orders; one level of
  subtasks; a right-hand detail drawer showing estimates vs. tracked time and
  everything scheduled or logged against the task. Rows, cards and the drawer
  all surface the completion date once a task is done, and the edit form lets
  you set or correct that date by hand (leave it blank to record the moment you
  save). The period switch (today / this week / this month, this week by
  default) is a floor rather than a window:
  work that was already finished before the period drops out, while open tasks
  stay listed however old they are. New tasks open with the due date filled in as
  today at 9am. The list view is divided by project — one section per project in
  the projects page's own order, plus a trailing "No project" bucket — with the
  status kept in reading order inside each section. A task can only be filed
  under a project that is still running: the project picker hides anything whose
  end date has passed, unless that is already where the task lives.
- **Projects** — a vertical timeline (time runs down the page): each project is a
  bar placed at its planned start and sized by its planned duration, overlapping
  projects are spread across lanes, and a dashed "today" line is always visible.
  Bars are draggable: drag the body to slide the whole window (whole days, so the
  time of day is kept), drag an edge to move only that end, or drag **sideways**
  to change the project's priority — lanes are handed out in priority order, so
  the left-most lane is the most important of the overlapping group.
  Scroll to travel through time. Zooming switches the axis **granularity** —
  days → weeks → months → quarters → years — so a two-year roadmap is ~90px per
  year instead of ~36px per day; the board starts on the finest scale that keeps
  the range within a comfortable height. Every
  project carries two independent axes — **urgent** and **important** — which map
  onto the four Eisenhower quadrants (do / plan / delegate / drop), plus a
  hand-written estimate in hours (decimals allowed, e.g. `1.5`) shown next to
  the sum of its tasks' estimates. Projects file under the same categories as
  tasks, and projects without an end date are listed beside the board instead
  of being drawn on it. Above the board, two cards sit side by side. On the left
  **时间都去哪了** answers "what did each project actually cost me lately": pick
  a period (today / this week / this month / a custom range) and it ranks the
  projects by tracked time, each bar a share of that period's project time, with
  time booked directly against a project and against its tasks folded together.
  On the right **项目进度** gives every project a fuel gauge whose needle is the
  share of its hand-written estimate already burnt — dial full means the estimate
  is used up, and a red dial means it ran over — with the exact numbers and an
  under / on track / over badge underneath. Only projects that are under way
  right now are listed — started already, not finished yet: what has ended has
  nothing left to plan, and what has no end date has no finish line to aim at.
- **Calendar** — FullCalendar day / week / month with drag-to-reschedule and
  drag-to-resize, click-to-create, and a conflict warning when a new block
  overlaps an existing one. A block can be linked to a single task **or** to an
  ongoing project (one picker offers both), and it borrows the colour of what it
  works on — the colour of the project behind the tracked task first, then that
  task's category, then the block's own project. The pick-up area beside the
  grid lists the open tasks
  and ongoing projects: drag one onto the calendar and a one-hour block is
  created for it, already linked. Any saved block can be **duplicated** — the
  copy keeps its title, duration and links, and can be pushed to the next day,
  the next week, the next weekday, or any window you type in — or **deleted**
  (with a confirmation step) straight from the edit dialog. Above the grid,
  **plan vs. actual by category** follows the visible period as one ring per
  category, its projects drawn as the sectors: the light outer ring splits by
  plan, the solid inner one by what was tracked, so a project that outgrew its
  share of the plan shows up as a fat dark sector behind a thin light one —
  navigating the calendar re-scopes both the plan and what was actually
  tracked.
- **Time logs** — the audit trail: every entry, grouped by day in the list view
  and by slice of the calendar in the grid, filterable by
  range / category (including everything with no category), editable and
  deletable. Because timers run in parallel,
  several entries can overlap on the same day — the log keeps them all as
  separate records, each with its own duration. An entry is attached the same
  way a calendar block is — to a single task **or** to an ongoing project —
  which is what decides its category, so nothing has to be picked by hand (an
  entry with neither, like a commute, keeps a manual category). The same data is
  also available as a drag-and-drop day / week / month calendar — the view the
  page opens on — with the same
  pick-up area as the Calendar page beside it: drag a block or one of its edges
  to correct when the time was actually spent, drop a task or project in to log
  newly-spent time (its category comes with it), click an empty slot to backfill
  a missing entry, and click a block to open the full form — where it can also
  be **deleted**. Both
  views are headed by the same per-category **plan vs. actual** rings, scoped
  to the selected period (or, in calendar view, to the visible grid).
- **Analytics** — planned vs. actual per day, category breakdown, daily trend,
  plan adherence, completion rate and an estimation-accuracy table per task and
  per category.
- **Settings** — profile (display name, IANA timezone), projects and categories,
  storage mode, and a reset for the local dataset. The project list is drag-
  sortable: it edits the same `sort_order` the timeline lanes are laid out in, so
  reordering here is reflected on the projects page and vice versa.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS ·
shadcn/ui-style components · Lucide icons · FullCalendar · Recharts · Zustand ·
React Hook Form + Zod · Supabase (Postgres, Auth, RLS) · Vitest.

## Quick start (Local Mode — no database needed)

```bash
npm install
cp .env.example .env.local   # leave the Supabase values empty
npm run dev                  # http://localhost:3000
```

With no Supabase credentials the app runs in **Local Mode**: the same repository
interface is served by an adapter that persists to `localStorage` and seeds
relative-to-now sample data so every screen has something meaningful in it. The
sidebar and footer say so, and Settings → Data & storage can reset the dataset.

Local Mode exists so the product can be evaluated end to end without a backend.
It is **not** a replacement for Supabase: data is per-browser, unauthenticated
and never synced.

## Configuring Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the project URL and the **anon** key into `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   `NEXT_PUBLIC_FORCE_LOCAL_MODE=true` overrides both and forces Local Mode.

3. Apply the migrations, in filename order, from the SQL editor or the CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push          # or: psql "$DATABASE_URL" -f <file> for each file
   ```

   - `supabase/migrations/20260101000000_init_timeflow.sql` — enums, tables,
     indexes, `updated_at` triggers, `handle_new_user` (profile + starter
     categories), `has_schedule_overlap`, and **row level security** on every
     table.
   - `supabase/migrations/20260101000100_timer_functions.sql` —
     `start_timer` / `pause_timer` / `resume_timer` / `stop_timer` /
     `discard_timer`.
   - `supabase/migrations/20260101000200_project_planning.sql` — the project
     planning columns used by the timeline board (`start_date`, `end_date`,
     `is_urgent`, `is_important`, `estimated_hours`), their constraints and
     index.
   - `supabase/migrations/20260101000300_project_sort_order.sql` — the manual
     priority (`sort_order`) that the sideways drag edits and that orders the
     timeline lanes.
   - `supabase/migrations/20260101000400_project_category_schedule_project.sql` —
     links projects to categories (`projects.category_id`) and lets a schedule
     belong to a project instead of a task (`schedules.project_id`).
   - `supabase/migrations/20260101000500_time_entry_project.sql` — lets a time
     entry belong to a project instead of a task (`time_entries.project_id`),
     so tracked time is filed the same way a calendar block is.
   - `supabase/migrations/20260101000600_timer_project.sql` — lets a timer track
     a project instead of a task (`timer_sessions.project_id`), and updates
     `start_timer` / `stop_timer` so a session picks up the project's category
     and title. `start_timer` gains a parameter, which is a new signature, so the
     old one-argument version is dropped.
   - `supabase/migrations/20260101000700_parallel_timers.sql` — removes the
     "at most one active timer per user" rule (partial unique index plus the
     guard inside `start_timer`) so several timers can run in parallel. Every
     transition now names the session it acts on (`p_..._timer(p_session_id)`)
     instead of acting on "the" active one; the zero-argument versions are
     dropped because the parameter names take part in the PostgREST signature.

4. Optional demo data (run after signing up once):

   ```bash
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

   It seeds the most recent auth user with projects, tasks, schedules and two
   weeks of time entries, and is safe to re-run.

5. Restart `npm run dev`. The app now shows the sign-in screen; create an
   account and the `on_auth_user_created` trigger provisions your profile and
   five starter categories.

### How access control works

Every user-owned table carries `user_id` and a single `for all` policy comparing
it to `auth.uid()`. `profiles` is keyed by `id`. The timer functions run with
`security invoker`, so RLS still applies to every row they touch.

## Project structure

```
src/
  app/
    (app)/                 # app shell route group: dashboard, tasks, projects, calendar, time-logs, analytics, settings
    layout.tsx             # metadata, manifest, providers
    page.tsx               # "/" -> /dashboard
  components/
    auth/                  # sign-in / sign-up screen
    layout/                # shell, sidebar, header, stat cards, loading & error states
    tasks/ projects/ calendar/ time-entries/ analytics/ dashboard/ timer/ settings/
    ui/                    # shadcn-style primitives
  hooks/                   # timezone, media query, timer tick
  lib/
    data/                  # Repository interface + Supabase & Local adapters + seed
    time.ts                # timezone-safe date maths
    stats.ts               # all aggregation used by the dashboard/analytics
    types.ts validation.ts utils.ts
  store/use-app-store.ts   # Zustand store (optimistic writes + rollback)
supabase/
  migrations/ seed.sql
```

## Data model & business rules

- **UUID primary keys, `timestamptz` in UTC.** Everything is rendered in the
  profile's IANA timezone, so travelling does not move your history.
- **Half-open ranges.** All range maths uses `[start, end)`, and a record that
  crosses midnight is split per calendar day, so a two-hour session from 23:00
  contributes one hour to each day and never double-counts.
- **Timers run in parallel.** A day is rarely one thing at a time, so any number
  of sessions can be open at once; each one is stopped (or discarded)
  individually and writes its own time entry. Starting a timer for something
  that is already being tracked hands back the open session instead of opening a
  second one.
- **Timers never lose time.** A pause folds the running segment into
  `accumulated_seconds`; the displayed value is always recomputed from the
  persisted timestamps, never counted in the client.
- **Deleting a task never deletes history.** Tasks are soft-deleted
  (`deleted_at`); time entries and schedules keep their rows with `task_id` set
  to `null`. Projects archive (`archived_at`) instead of vanishing.
- **Free-form time is allowed.** `time_entries.task_id` is nullable, so breaks,
  commutes and anything else can be tracked without inventing a task.
- **The project timeline is derived, never stored.** Layout positions and lane
  assignments are computed from `start_date` / `end_date` on every render (greedy
  interval colouring, so overlapping projects share a row without covering each
  other). A project with no dates is pinned to today as a one-day placeholder
  and flagged "No dates".

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Development server                            |
| `npm run build`     | Production build                              |
| `npm run start`     | Serve the production build                    |
| `npm run lint`      | ESLint (`next/core-web-vitals`)               |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run test`      | Vitest (unit tests, watch-free)               |
| `npm run test:watch`| Vitest in watch mode                          |

## Tests

`src/lib/time.test.ts`, `src/lib/stats.test.ts` and
`src/lib/data/local-repository.test.ts` cover the logic where bugs are expensive
and silent: timezone conversion, range resolution, duration formatting, timer
arithmetic, per-day splitting of midnight-crossing records, category/trend
aggregation, estimation accuracy, the project roll-up and timeline lane
assignment, schedule overlap detection, the completion-rate rules, and the
end-to-end acceptance flow (task → schedule → timer → stop → persisted time
entry → analytics) against the Local adapter.

```bash
npm run test     # 53 assertions across the three suites
```

## Deployment

The app is Vercel-ready (`next build` passes). Set the two
`NEXT_PUBLIC_SUPABASE_*` variables in the project's environment settings and
deploy. `public/manifest.webmanifest` plus the metadata in `app/layout.tsx`
make the app installable on desktop and mobile.

## Verification status

- `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` all
  pass in this repository.
- **Local Mode has been exercised end to end**: create a task → schedule it →
  start the timer → stop it → the entry appears in Time logs and in the
  Overview/Analytics totals.
- **The Supabase path has not been run against a live project.** The adapters,
  RPC calls, migrations and RLS policies are implemented and type-checked, but
  no Supabase credentials or local Postgres/Docker were available in this
  environment, so the SQL has not been executed and server-side persistence is
  unverified. Treat the Supabase steps above as the next thing to validate.
