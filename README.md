# Task App

Task App is a personal day-to-day work agent for managing real tasks, blockers, priorities, follow-ups, deadlines, and short-term reminders.

The goal is not to become a heavy project management platform. The goal is to become a practical personal agent that helps answer questions like:

- What should I do now?
- What is overdue?
- What is blocked?
- Which cards depend on other cards?
- What needs follow-up?
- Which cards can be archived?
- Which tags, checklist items, priorities, dependencies, or deadlines are missing?
- What can be improved automatically, while still letting me approve every change?
- Which Feedback AI memory rules are affecting new suggestions?

The app is desktop-first, but the backend is designed so other clients can be added later, for example an Android app.

## Documentation Map

Detailed project documentation is organized under [`docs/`](./docs/):

- [Overview](./docs/00-overview.md)
- [System Design](./docs/01-system-design.md)
- [Data Model](./docs/02-data-model.md)
- [Scheduling Model](./docs/03-scheduling-model.md)
- [Google Calendar](./docs/04-google-calendar.md)
- [AI Advisor](./docs/05-ai-advisor.md)
- [Frontend Architecture](./docs/06-frontend-architecture.md)
- [Backend API](./docs/07-backend-api.md)
- [Development Workflow](./docs/08-development-workflow.md)
- [Decisions](./docs/09-decisions.md)
- [Python Scheduler Service](./docs/10-python-scheduler-service.md)
- [Diagnostic Flows](./docs/11-diagnostic-flows.md)
- [Schema Reference](./docs/12-schema-reference.md)
- [Full Schema ERD](./docs/diagrams/full-schema-erd.md)

The README is the entry point and setup reference. Domain details should go in the matching `docs/` file.
## Product direction

The long-term direction is for Task App to become a personal operating layer for daily work.

Instead of only storing tasks, it should help interpret the task list, propose improvements, surface risks, suggest next actions, and reduce the amount of manual grooming needed to keep tasks useful.

The AI Advisor is intentionally approval-based. It should not silently mutate data. It proposes actions into a review buffer, and the user chooses what to accept or ignore. The frontend only exposes fixed advisor buttons; the backend owns the prompts for each action. Feedback on proposals is also structured: the user answers fixed controls, OpenAI interprets that feedback into contextual memory rules when available, and the backend validates/falls back to deterministic rules.

## What the app does today

The app organizes work through several views:

- Kanban, for status-based work tracking.
- Queue, for execution order and prioritization.
- Probable follow-ups, for overdue, urgent, waiting, and no-deadline cards.
- Quick Queue, for short-term reminders synchronized through the database.
- Notes, for shared notes that can be reused across tasks.
- Calendar, for Google Calendar visibility, Advisor-generated schedule previews, and committed scheduled events.
- Rotinas, for reusable periodic tasks such as study, gym, and other recurring work.
- A rever, for reviewing scheduled task events whose time has already passed.
- Feedback AI, for reviewing and deleting advisor memory learned from feedback.
- Agenda AI, for natural-language scheduler rules that affect calendar planning.
- Archived, for closed work.

Each task can have:

- title and notes;
- priority;
- due date;
- reusable tags;
- checklist;
- relations with other cards;
- dependencies/blockers;
- progress history;
- shared notes;
- archived state;
- favorite flag;
- optional estimate;
- linked calendar scheduling events, separate from due dates.

The AI Advisor can currently suggest:

- better tags;
- priority changes based on task age and overdue duration;
- missing due dates;
- checklist items;
- dependencies/blockers;
- related cards;
- priority increases/decreases;
- follow-up tasks.

It does not apply changes automatically. Suggestions appear in a buffer where each action can be accepted or ignored individually or in bulk.

The Advisor can also learn from structured feedback. For example, if a tag suggestion is weak, the user can mark which tags were good or bad and whether there should have been more or fewer tags. Priority recommendations use a separate feedback form for whether the priority was too high/low, and whether task age or overdue duration were weighted correctly. The backend sends proposal feedback, source task context, and existing memory to OpenAI to interpret a reusable Feedback AI rule. The interpreted rule is stored in `advisor_memory_rules.rule` with summary, context, behavior, confidence, and source fields. If OpenAI is unavailable, the backend stores a deterministic fallback rule. Future suggestions use both prompt context and backend deterministic checks.

## What it could become

Possible future directions:

- Android app or PWA using the same backend.
- Authentication and multiple users.
- Supabase Realtime synchronization.
- Notifications for overdue or soon-due work.
- Recurring tasks.
- Richer calendar/timeline planning beyond the current weekly Google Calendar view.
- Task and checklist templates.
- Daily planning mode: "what should I do today?"
- End-of-day review: what changed, what is still blocked, what should move to tomorrow.
- Automatic task hygiene suggestions: missing tags, vague cards, stale waiting tasks, unprioritized work.
- Smarter dependency analysis between cards.
- AI Advisor that can plan multi-step improvements and ask for confirmation.
- Natural-language commands such as "prepare my morning queue" or "show tasks blocked by client replies".
- Deeper personal memory/context layer for recurring people, clients, projects, and working patterns.
- Metrics about time, tags, priority drift, blocked work, and completed work.
- Permissions and workspaces if the app grows beyond personal use.

## Technical context

Application with React/Vite frontend, Node.js/Express backend, and PostgreSQL persistence in Supabase.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Scheduler: Python microservice using Google OR-Tools
- Database: PostgreSQL on Supabase
- Migrations: Supabase CLI
- AI Advisor and scheduler rule interpretation: optional OpenAI API
- Google OAuth for Calendar/Gmail integration
- No app login/authentication in this version

## Main features

- Kanban, Queue, Quick Queue, Probable Follow-ups, Notes, Calendar, Rotinas, A rever, Feedback AI, Agenda AI, and Archived views
- Independent filters per view
- Reusable tags, multi-tag filtering, and deactivation/reactivation of unused tags
- Priorities, due dates, favorites, checklist, and optional estimate
- Relations between cards and dependencies/blockers
- Blockers prevent completing a task while dependencies or checklist items are pending
- Editable progress history
- Shared notes with tags and task associations
- Archive/restore tasks and bulk archive `done`/`cancelled` tasks
- Database-backed Quick Queue for short-term reminders shared between clients
- Google Calendar weekly view with multiple calendars and calendar filters
- OR-Tools calendar scheduling with draggable preview events, custom proposal commits, and per-day commits
- Periodic task routines with target frequency, hard windows/days, one-off constraints, and occurrence history
- Natural-language scheduler rules with persisted derived constraints
- Break proposals as explicit calendar events and exact-date scheduling constraints
- Gmail daily task email for today's and overdue active tasks
- AI Advisor with proposal buffer: accept/ignore individually or in bulk
- Feedback AI advisor memory from structured feedback, with a dedicated management view
- Scheduled task review for calendar events that ended before the task was completed

## Structure

```text
task-app/
  backend/
    ai/
    db/
    middleware/
    routes/
    scripts/
    tasks/
    utils/
    server.ts
    package.json

  frontend/
    src/
      components/
      constants/
      hooks/
      styles/
      utils/
      App.tsx
      api.ts
    package.json

  supabase/
    migrations/
    config.toml
    seed.sql

  python-scheduler-service/
    app.py
    scheduler.py
    scheduler_constraints.py
    scheduler_breaks.py
    scheduler_time.py
    scheduler_types.py
    requirements.txt

  package.json
  docker-compose.yml
```

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.11+
- Docker Desktop, only if using Docker Compose or local Supabase tooling
- Supabase project with PostgreSQL connection string

## Initial setup

Install root, backend, and frontend dependencies:

```bash
npm install
cd backend
npm install
cd ../frontend
npm install
```

Configure backend:

```bash
cd backend
copy .env.example .env
```

Set in `backend/.env`:

```text
DATABASE_URL=postgresql://...
DATABASE_SSL=true
CORS_ORIGIN=http://localhost:5173
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
FRONTEND_URL=http://localhost:5173
SCHEDULER_SERVICE_URL=http://127.0.0.1:8000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/google/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=
```

`OPENAI_API_KEY` is optional. Without it, `/advisor` still works with local rule-based advice, but AI-generated proposals are unavailable.

`GOOGLE_*` variables are optional. Without them, the app works normally, but Google Calendar/Gmail connection is unavailable.

`SCHEDULER_SERVICE_URL` points the Node backend to the Python OR-Tools scheduler. If unset, the backend uses `http://127.0.0.1:8000`.

Generate `GOOGLE_TOKEN_ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Google Calendar and Gmail setup

The Google integration supports reading calendars and sending a daily task summary email from the connected Gmail account.

In Google Cloud Console:

1. Create or select a project.
2. Enable Google Calendar API.
3. Enable Gmail API.
4. Configure the OAuth consent screen.
5. Create an OAuth Client of type `Web application`.
6. Add this authorized redirect URI for local development:

```text
http://localhost:4000/google/oauth/callback
```

Set the Google variables in `backend/.env`, run migrations, then restart the backend.

Required scopes:

```text
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/userinfo.email
```

Google connections are stored encrypted in `google_connections` and expire after 1 day. Reconnect Google if scopes change or the connection expires.

Test database connection:

```bash
cd backend
npm run db:check
```

## Run locally

Terminal 1:

```bash
cd python-scheduler-service
python -m pip install -r requirements.txt
python app.py
```

Scheduler:

```text
http://127.0.0.1:8000
```

Terminal 2:

```bash
cd backend
npm run dev
```

Backend:

```text
http://localhost:4000
```

Terminal 3:

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173
```

In development, the frontend uses `/api` and Vite proxies requests to `http://127.0.0.1:4000`.

## Docker Compose

The database remains in Supabase. Compose runs frontend, backend, scheduler service, and the local logging stack when configured in `docker-compose.yml`.

```bash
docker compose up --build
```

Services:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
Scheduler: http://localhost:8000
Health:   http://localhost:4000/health
Grafana:  http://localhost:3001
Loki:     http://localhost:3100
```

Stop:

```bash
docker compose down
```

## Logging

The backend always writes structured JSON logs to stdout using `pino` and `pino-http`.

There is no `pino-pretty`, no environment-specific formatting, and no local log file. Development and production use the same JSON format so logs are easy to ship and query later.

The Docker logging stack is:

- Backend app: writes JSON logs to stdout.
- Promtail: reads Docker container logs and sends them to Loki.
- Loki: stores and queries logs at `http://localhost:3100`.
- Grafana: UI at `http://localhost:3001`, with Loki auto-loaded as the default datasource.

Start everything:

```bash
docker compose up --build
```

Open Grafana:

```text
http://localhost:3001
```

Default Grafana login:

```text
admin / admin
```

Follow backend logs directly:

```bash
docker compose logs -f backend
```

Stop everything:

```bash
docker compose down
```

Backend log code:

```ts
const { logInfo, logWarn, logError } = require('./logger');

logInfo({
  event: 'user.login.success',
  requestId,
  userId: '123',
  entity: 'user',
  entityId: '123'
}, 'user logged in');

logWarn({
  event: 'calendar.connection.expiring',
  requestId,
  userId: '123'
}, 'calendar connection is near expiry');

logError({
  event: 'calendar.sync.failed',
  requestId,
  userId: '123',
  err: error
}, 'calendar sync failed');
```

Example JSON log line:

```json
{"level":30,"time":"2026-07-04T13:30:00.000Z","event":"http.request.finished","requestId":"6f53a370-6d60-4d52-9588-c6cfd0d22b55","route":"/tasks","method":"GET","statusCode":200,"durationMs":18,"msg":"request finished"}
```

Grafana/Loki queries:

```logql
{container_name=~".*backend.*"} | json
```

```logql
{container_name=~".*backend.*"} | json | event="user.login.success"
```

```logql
{container_name=~".*backend.*"} | json | statusCode >= 500
```

```logql
{container_name=~".*backend.*"} | json | userId="123"
```

```logql
{container_name=~".*backend.*"} | json | requestId="PASTE_REQUEST_ID_HERE"
```

Sensitive fields are redacted by the backend logger, including passwords, tokens, access/refresh tokens, authorization headers, and cookies. Do not log full request bodies.

## Database migrations with Supabase CLI

Migrations live in:

```text
supabase/migrations/
```

The remote migration history has already been aligned with the existing migrations:

```text
20260621000000_normalize_tags.sql
20260622000000_add_task_archiving.sql
20260622000100_expand_task_model.sql
20260628134327_deactivate_tags.sql
20260628150000_add_quick_queue_items.sql
20260628162000_add_google_connections.sql
20260629103000_add_shared_notes.sql
20260629113000_add_shared_note_tags.sql
20260701120000_expire_google_connections.sql
20260702100000_extend_google_connections_to_one_day.sql
20260702110000_add_advisor_memory.sql
20260710100000_add_scheduler_rules.sql
20260711100000_add_scheduler_reserved_blocks.sql
20260718120000_add_task_calendar_event_reviews.sql
```

Login/link project:

```bash
npm run db:login
npm run db:link
```

Check migration state:

```bash
npm run db:migration:list
```

Create a new migration:

```bash
npm run db:migration:new -- migration_name
```

Edit the generated file in `supabase/migrations/`.

Apply pending migrations to remote Supabase:

```bash
npm run db:push
```

Dump remote schema for inspection:

```bash
npm run db:dump:file
```

This creates `schema-current.sql`, which is ignored by Git.

Rule: avoid manual schema changes in the Supabase Dashboard. Schema changes should be committed as SQL migrations.

## API

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Basic API info |
| `GET` | `/health` | Checks API and database connection |

### Tasks

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/tasks` | List, filter, and sort tasks |
| `POST` | `/tasks` | Create task |
| `GET` | `/tasks/:id` | Get task |
| `PUT` | `/tasks/:id` | Update task |
| `DELETE` | `/tasks/:id` | Delete task |
| `POST` | `/tasks/:id/duplicate` | Duplicate task as `new` |
| `POST` | `/tasks/:id/archive` | Archive task |
| `DELETE` | `/tasks/:id/archive` | Restore archived task |
| `POST` | `/tasks/archive-bulk` | Archive all tasks with a given status |
| `PATCH` | `/tasks/:id/checklist/:itemId` | Toggle checklist item |
| `POST` | `/tasks/:id/progress` | Add progress log |
| `PUT` | `/tasks/:id/progress/:entryId` | Edit progress log |
| `POST` | `/tasks/:id/blockers` | Create a task that blocks the selected task |

Filters for `GET /tasks`:

- `status=new|in_progress|waiting|done|cancelled`
- `priority=1|2|3|4`
- `overdue=true`
- `today=true`
- `noDueDate=true`
- `hideBlocked=true`
- `hideDone=true`
- `hideCancelled=true`
- `archived=true`
- `tag=name` can be repeated
- `tagMode=and|or|not|nand` controls how repeated tags are combined
- `search=text`
- `sort=priority|dueDateTime|createdAt|updatedAt|requestedBy|status`

Examples:

```text
GET /tasks?status=new&sort=priority
GET /tasks?priority=4&overdue=true
GET /tasks?tag=excel&tag=prices
GET /tasks?tag=excel&tag=prices&tagMode=or
GET /tasks?tag=excel&tag=prices&tagMode=nand
GET /tasks?archived=true
```

### Tags

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/tags` | List/search reusable tags |
| `DELETE` | `/tags/:id` | Deactivate tag when it is not used by active tasks |
| `DELETE` | `/tags/:id?force=true` | Remove tag from active tasks and deactivate it |
| `DELETE` | `/tags` | Deactivate multiple tags with `{ ids: [], force?: boolean }` |

Tags are soft-deactivated, not physically deleted. A tag can be deactivated when it is not used by active tasks. Usage in `done`, `cancelled`, or archived tasks does not block deactivation. With `force=true`, the backend first removes the tag from active tasks and then deactivates it. If a deactivated tag is used again later, the backend reactivates it automatically.

### Advisor / AI

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/advisor?limit=5` | Simple suggestion of what to do next |
| `POST` | `/ai/advisor/request` | Generate AI proposals from a user request |
| `POST` | `/ai/advisor/feedback` | Store structured proposal feedback and interpret a contextual Feedback AI memory rule |
| `POST` | `/ai/advisor/interaction-feedback` | Store structured feedback for the whole Advisor interaction |
| `GET` | `/ai/advisor/memory` | List Feedback AI advisor memory rules |
| `DELETE` | `/ai/advisor/memory/:id` | Delete a Feedback AI advisor memory rule |
| `POST` | `/ai/commands/preview` | Validate/preview AI commands |
| `POST` | `/ai/commands/apply` | Apply accepted AI commands |
| `POST` | `/tasks/:id/calendar-events/:eventId/review` | Review a past scheduled task event as completed, missed, or skipped |
| `GET` | `/scheduler/rules` | List natural-language scheduler rules and derived constraints |
| `POST` | `/scheduler/rules/from-text` | Split and interpret one text message into persisted scheduler rules |
| `POST` | `/scheduler/rules` | Create one scheduler rule from text |
| `PATCH` | `/scheduler/rules/:id` | Enable, disable, or update a scheduler rule |
| `POST` | `/scheduler/rules/:id/reinterpret` | Re-run OpenAI interpretation for a scheduler rule |
| `DELETE` | `/scheduler/rules/:id` | Delete a scheduler rule |

The backend rate-limits AI generation requests to `3` requests per `10` seconds per client/IP.

The Advisor does not accept free-text chat prompts from the UI. The frontend sends one of the supported action keys, and the backend maps that action to the controlled prompt:

```text
suggest_tags
suggest_due_dates
priority_management
schedule_calendar_events
```

The Advisor does not apply changes by itself. It generates proposals shown in the frontend buffer, where the user accepts or ignores each action.

For `suggest_tags`, the backend sends about 70% of active tasks to the model, prioritized by highest priority and then nearest due date. Feedback AI memory rules are passed as structured context, and the backend also filters repeated bad tag suggestions deterministically before returning proposals.

For `priority_management`, the backend asks only for priority changes. It prioritizes context by overdue duration, then task age, then current priority, and filters out proposals that try to change anything other than `priority`.

For `suggest_due_dates`, the backend asks only for due date changes. It prioritizes tasks without due dates, overdue tasks, higher priorities, and nearest due dates, and filters out proposals that try to change anything other than `dueDateTime`.

For `schedule_calendar_events`, the backend sends eligible tasks to the Python scheduler service. Eligible tasks are active tasks with status `new` or `in_progress` that do not already have a future/current linked calendar event. Past linked events do not block scheduling; if a past scheduled event has not been reviewed and the task is still open, it appears in the scheduled review view instead of silently blocking future scheduling.

Calendar event proposals are previews. Users can drag preview task events before accepting them; dragged tasks become fixed constraints for the next scheduling run. The calendar exposes `Limpar ajustes` when moved-task constraints exist. Proposal commits can be done individually, as a selected custom set, by day, or as the full batch.

Accepting a calendar proposal creates a Google Calendar event and stores the task-event association in `task_calendar_events`. It does not update `dueDateTime`; due date remains the task deadline. Normal task events are created with a Google Calendar popup reminder 30 minutes before the event. Breaks are created as explicit `Pausa` calendar events and do not get reminders.

Scheduled state is derived from linked calendar events. A task with a future/current linked event is shown as scheduled and is not eligible for new calendar proposals. When the event is in the past and the task is still open, the event can be reviewed as completed, missed, or skipped; missed/skipped reviews leave the task eligible for future scheduling.

Scheduler rule constraints currently include:

```text
blocked_window
allowed_window
allowed_date
preferred_window
avoid_day
priority_boost
daily_limit
break_after_task
break_after_work_block
min_duration
max_duration
```

Example exact-date rule constraint:

```json
{
  "type": "allowed_date",
  "scope": { "titleIncludes": ["Prepare invoice"] },
  "payload": {
    "date": "2026-07-18",
    "startTime": "10:00",
    "endTime": "12:00"
  },
  "hard": true
}
```

Example break rule constraints:

```json
{
  "type": "break_after_task",
  "scope": { "allTasks": true },
  "payload": {
    "breakMinutes": 15,
    "minDurationMinutes": 60
  }
}
```

```json
{
  "type": "break_after_work_block",
  "scope": { "allTasks": true },
  "payload": {
    "workMinutes": 90,
    "breakMinutes": 15
  }
}
```

### Shared notes

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/shared-notes` | List/search shared notes |
| `POST` | `/shared-notes` | Create shared note |
| `PUT` | `/shared-notes/:id` | Update shared note |
| `DELETE` | `/shared-notes/:id` | Archive shared note |
| `POST` | `/tasks/:id/shared-notes` | Attach existing shared note to task |
| `POST` | `/tasks/:id/shared-notes/create` | Create and attach a shared note |
| `DELETE` | `/tasks/:id/shared-notes/:noteId` | Detach shared note from task |

Shared notes can have tags and can be attached to multiple tasks. The Notes view can search by note title and associated task title.

### Quick Queue

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/quick-queue` | List quick queue items |
| `POST` | `/quick-queue` | Create quick queue item |
| `PATCH` | `/quick-queue/:id` | Update quick queue item |
| `DELETE` | `/quick-queue/:id` | Delete quick queue item |
| `POST` | `/quick-queue/:id/move` | Move item up/down |
| `POST` | `/quick-queue/reorder` | Persist a dragged custom order |
| `DELETE` | `/quick-queue/done` | Clear completed items |

### Periodic Tasks

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/periodic-tasks` | List reusable periodic task routines |
| `POST` | `/periodic-tasks` | Create a periodic task routine |
| `PATCH` | `/periodic-tasks/:id` | Update or pause a periodic task routine |
| `DELETE` | `/periodic-tasks/:id` | Delete a periodic task routine |
| `GET` | `/periodic-tasks/:id/occurrences` | List schedule history for a routine |
| `POST` | `/periodic-tasks/:id/constraints` | Add a one-off hard constraint |
| `PATCH` | `/periodic-task-constraints/:id` | Update a one-off constraint |
| `DELETE` | `/periodic-task-constraints/:id` | Delete a one-off constraint |
| `PATCH` | `/periodic-task-occurrences/:id` | Mark an occurrence scheduled/completed/skipped/cancelled |

Periodic tasks are reusable scheduling candidates, not duplicated normal tasks. Active routines are included in calendar scheduling, and accepted periodic calendar proposals create `periodic_task_occurrences` for history tracking.

### Google

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/google/status` | Check Google connection and expiry |
| `POST` | `/google/oauth/url` | Create OAuth URL |
| `GET` | `/google/oauth/callback` | OAuth callback |
| `DELETE` | `/google/connection` | Disconnect Google |
| `GET` | `/google/calendars` | List accessible calendars |
| `GET` | `/google/calendar/events` | List calendar events by day or date range, backed by a short TTL cache |
| `POST` | `/google/calendar/events` | Create a linked task calendar event without changing the task due date |
| `POST` | `/google/gmail/daily-tasks` | Email today's active task summary |

`GET /google/calendar/events` accepts either `date=YYYY-MM-DD` or `start=YYYY-MM-DD&end=YYYY-MM-DD`. `calendarId` can be repeated to query multiple calendars. Calendar event reads use a TTL cache; pressing `Atualizar` refreshes the cache from Google Calendar. Creating or deleting calendar events clears the relevant cache so new committed events are visible quickly.

## Main data model

Main API fields:

```js
{
  id,
  title,
  notes,
  priority,
  status,
  dueDateTime,
  estimatedMinutes,
  isFavorite,
  tags,
  blockedByTaskIds,
  relations,
  checklistItems,
  createdAt,
  updatedAt,
  completedAt,
  cancelledAt,
  archivedAt,
  isArchived,
  activityLog
  sharedNotes
}
```

Valid statuses:

```text
new
in_progress
waiting
done
cancelled
```

Priorities:

```text
1 = low
2 = medium
3 = high
4 = urgent
```

## Import old JSON data

To import `backend/tasks.json` once into an empty database:

```bash
cd backend
npm run db:import-json
```

The importer refuses to run if the `tasks` table already contains data.

## Build

Frontend:

```bash
cd frontend
npm run build
```

Backend type check:

```bash
cd backend
npm run typecheck
```

## Deploy

### Backend

`backend/Dockerfile` runs the Express API.

Typical environment variables:

```text
PORT=8000
DATABASE_URL=postgresql://...
DATABASE_SSL=true
DATABASE_POOL_MAX=5
CORS_ORIGIN=https://frontend.example.com
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AI_RATE_LIMIT_WINDOW_MS=10000
AI_RATE_LIMIT_MAX=3
```

Health check:

```text
/health
```

### Frontend

`frontend/Dockerfile` builds the frontend and serves it with Nginx.

Variable:

```text
BACKEND_URL=https://backend.example.com
```

The browser uses `/api`; Nginx proxies that path to `BACKEND_URL`.
