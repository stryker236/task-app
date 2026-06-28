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

The app is desktop-first, but the backend is designed so other clients can be added later, for example an Android app.

## Product direction

The long-term direction is for Task App to become a personal operating layer for daily work.

Instead of only storing tasks, it should help interpret the task list, propose improvements, surface risks, suggest next actions, and reduce the amount of manual grooming needed to keep tasks useful.

The AI Advisor is intentionally approval-based. It should not silently mutate data. It proposes actions into a review buffer, and the user chooses what to accept or ignore. The frontend only exposes fixed advisor buttons; the backend owns the prompts for each action.

## What the app does today

The app organizes work through several views:

- Kanban, for status-based work tracking.
- Queue, for execution order and prioritization.
- Probable follow-ups, for overdue, urgent, waiting, and no-deadline cards.
- Quick Queue, for short-term reminders synchronized through the database.
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
- archived state;
- favorite flag;
- optional estimate.

The AI Advisor can currently suggest:

- better tags;
- missing due dates;
- checklist items;
- dependencies/blockers;
- related cards;
- priority increases/decreases;
- follow-up tasks.

It does not apply changes automatically. Suggestions appear in a buffer where each action can be accepted or ignored individually or in bulk.

## What it could become

Possible future directions:

- Android app or PWA using the same backend.
- Authentication and multiple users.
- Supabase Realtime synchronization.
- Notifications for overdue or soon-due work.
- Recurring tasks.
- Calendar/timeline view.
- Task and checklist templates.
- Daily planning mode: "what should I do today?"
- End-of-day review: what changed, what is still blocked, what should move to tomorrow.
- Automatic task hygiene suggestions: missing tags, vague cards, stale waiting tasks, unprioritized work.
- Smarter dependency analysis between cards.
- AI Advisor that can plan multi-step improvements and ask for confirmation.
- Natural-language commands such as "prepare my morning queue" or "show tasks blocked by client replies".
- Personal memory/context layer for recurring people, clients, projects, and working patterns.
- Metrics about time, tags, priority drift, blocked work, and completed work.
- Permissions and workspaces if the app grows beyond personal use.

## Technical context

Application with React/Vite frontend, Node.js/Express backend, and PostgreSQL persistence in Supabase.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL on Supabase
- Migrations: Supabase CLI
- AI Advisor: optional OpenAI API
- No login/authentication in this version

## Main features

- Kanban, Queue, Quick Queue, Probable Follow-ups, and Archived views
- Independent filters per view
- Reusable tags, multi-tag filtering, and deactivation/reactivation of unused tags
- Priorities, due dates, favorites, checklist, and optional estimate
- Relations between cards and dependencies/blockers
- Blockers prevent completing a task while dependencies or checklist items are pending
- Editable progress history
- Archive/restore tasks and bulk archive `done`/`cancelled` tasks
- Database-backed Quick Queue for short-term reminders shared between clients
- AI Advisor with proposal buffer: accept/ignore individually or in bulk

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
    server.js
    package.json

  frontend/
    src/
      components/
      constants/
      hooks/
      styles/
      utils/
      App.jsx
      api.js
    package.json

  supabase/
    migrations/
    config.toml
    seed.sql

  package.json
  docker-compose.yml
```

## Prerequisites

- Node.js 20+
- npm 10+
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
```

`OPENAI_API_KEY` is optional. Without it, `/advisor` still works with local rule-based advice, but AI-generated proposals are unavailable.

Test database connection:

```bash
cd backend
npm run db:check
```

## Run locally

Terminal 1:

```bash
cd backend
npm run dev
```

Backend:

```text
http://localhost:4000
```

Terminal 2:

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

The database remains in Supabase. Compose only runs frontend and backend locally.

```bash
docker compose up --build
```

Services:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
```

Stop:

```bash
docker compose down
```

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
- `tagMode=and|or` controls whether repeated tags must all match or any match
- `search=text`
- `sort=priority|dueDateTime|createdAt|updatedAt|requestedBy|status`

Examples:

```text
GET /tasks?status=new&sort=priority
GET /tasks?priority=4&overdue=true
GET /tasks?tag=excel&tag=prices
GET /tasks?tag=excel&tag=prices&tagMode=or
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
| `POST` | `/ai/commands/preview` | Validate/preview AI commands |
| `POST` | `/ai/commands/apply` | Apply accepted AI commands |

The backend rate-limits AI generation requests to `3` requests per `10` seconds per client/IP.

The Advisor does not accept free-text chat prompts from the UI. The frontend sends one of the supported action keys, and the backend maps that action to the controlled prompt:

```text
improve_tasks
suggest_tags
create_followups
organize_blockers
```

The Advisor does not apply changes by itself. It generates proposals shown in the frontend buffer, where the user accepts or ignores each action.

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

Backend syntax check:

```bash
cd backend
node --check server.js
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
