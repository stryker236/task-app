# Backend API

This document lists the most important API surfaces. Keep endpoint behavior here; keep product semantics in the domain docs.

## Tasks

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/tasks` | List tasks with filters. |
| `GET` | `/tasks/:id` | Get one task. |
| `POST` | `/tasks` | Create task. |
| `PUT` | `/tasks/:id` | Update task. |
| `DELETE` | `/tasks/:id` | Delete task. |
| `POST` | `/tasks/:id/archive` | Archive task. |
| `DELETE` | `/tasks/:id/archive` | Restore task. |
| `POST` | `/tasks/archive-bulk` | Archive all done/cancelled tasks. |
| `POST` | `/tasks/:id/progress` | Add progress note. |
| `PUT` | `/tasks/:id/progress/:entryId` | Edit progress note. |
| `POST` | `/tasks/:id/calendar-events/:eventId/review` | Review a past scheduled event. |

### Scheduled Review Body

```json
{
  "status": "completed",
  "note": "Finished during the scheduled slot.",
  "feedback": {
    "reason": "good_time"
  }
}
```

Allowed statuses:

- `completed`
- `missed`
- `skipped`

Effects:

- updates `task_calendar_events.review_status` and related review fields;
- creates task activity;
- creates productivity event;
- marks task `done` only when status is `completed`.

## Advisor / Scheduler

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/advisor?limit=5` | Local next-action suggestions. |
| `POST` | `/ai/advisor/request` | Generate proposals for a supported action. |
| `POST` | `/ai/commands/preview` | Validate and preview commands. |
| `POST` | `/ai/commands/apply` | Apply accepted commands. |
| `POST` | `/ai/advisor/feedback` | Store structured proposal feedback. |
| `GET` | `/scheduler/rules` | List scheduler rules. |
| `POST` | `/scheduler/rules/from-text` | Interpret and create multiple rules from text. |
| `POST` | `/scheduler/rules` | Create one rule. |
| `PATCH` | `/scheduler/rules/:id` | Update rule and constraints. |
| `POST` | `/scheduler/rules/:id/reinterpret` | Reinterpret rule from text. |
| `DELETE` | `/scheduler/rules/:id` | Delete rule. |

## Google

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/google/status` | Check connection. |
| `POST` | `/google/oauth/url` | Create OAuth URL. |
| `GET` | `/google/oauth/callback` | OAuth callback. |
| `DELETE` | `/google/connection` | Disconnect. |
| `GET` | `/google/calendars` | List calendars. |
| `GET` | `/google/calendar/events` | List calendar events with TTL cache. |
| `POST` | `/google/calendar/events` | Create linked task calendar event. |
| `POST` | `/google/gmail/daily-tasks` | Send daily task email. |

## Periodic Tasks

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/periodic-tasks` | List routines. |
| `POST` | `/periodic-tasks` | Create routine. |
| `PATCH` | `/periodic-tasks/:id` | Update/pause routine. |
| `DELETE` | `/periodic-tasks/:id` | Delete routine. |
| `GET` | `/periodic-tasks/:id/occurrences` | List occurrence history. |
| `POST` | `/periodic-tasks/:id/constraints` | Add routine constraint. |
| `PATCH` | `/periodic-task-constraints/:id` | Update routine constraint. |
| `DELETE` | `/periodic-task-constraints/:id` | Delete routine constraint. |
| `PATCH` | `/periodic-task-occurrences/:id` | Update occurrence state. |
