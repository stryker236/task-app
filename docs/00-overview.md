# Overview

Task App is a personal operating layer for daily work. It manages tasks, deadlines, blockers, scheduling proposals, Google Calendar events, periodic routines, advisor suggestions, progress notes, and productivity events.

The core product rule is approval first: the Advisor and scheduler can propose changes, but user acceptance is required before data is changed or calendar events are created.

## Navigation

- [System Design](./01-system-design.md): components, responsibilities, and main flows.
- [Data Model](./02-data-model.md): database entities, relations, and domain rules.
- [Scheduling Model](./03-scheduling-model.md): due dates, scheduled events, constraints, previews, commits, and review.
- [Google Calendar](./04-google-calendar.md): OAuth, cache, event creation, reminders, and calendar syncing.
- [AI Advisor](./05-ai-advisor.md): advisor actions, preview/apply flow, feedback, and memory rules.
- [Frontend Architecture](./06-frontend-architecture.md): major views, controllers, contexts, and UI responsibilities.
- [Backend API](./07-backend-api.md): API surfaces grouped by domain.
- [Development Workflow](./08-development-workflow.md): setup, validation, migrations, and local running.
- [Decisions](./09-decisions.md): accepted architecture/product decisions.
- [Python Scheduler Service](./10-python-scheduler-service.md): payload contract and deterministic scheduling internals.
- [Diagnostic Flows](./11-diagnostic-flows.md): non-happy-path diagrams for debugging.
- [Schema Reference](./12-schema-reference.md): literal table/column reference.
- [Full Schema ERD](./diagrams/full-schema-erd.md): complete Mermaid diagram of app tables and relationships.

## Current Main Views

- Kanban: status-based task tracking.
- Queue: ordered execution and prioritization.
- Collections: overdue, today, urgent, waiting, and no-deadline groupings.
- Quick Queue: short-term reminders backed by the database.
- Notes: shared notes reusable across tasks.
- Calendar: Google Calendar visibility and Advisor schedule previews.
- Rotinas: reusable periodic task definitions and constraints.
- A rever: review scheduled task events whose time has passed.
- Feedback AI: advisor memory learned from proposal feedback.
- Agenda AI: natural-language scheduler rules and constraints.
- Logs: structured request/application logs.
- Settings: app and UI settings.
- Archived: closed tasks.

## Core Semantics

- `dueDateTime` is a deadline, not an appointment.
- `task_calendar_events` stores real scheduled calendar events associated with tasks.
- A task with a future/current linked calendar event is scheduled and should not be proposed again.
- A past linked calendar event does not block future scheduling.
- A past linked calendar event that has not been reviewed appears in `A rever` if the task is still open.
- Advisor proposals are previewed and accepted/ignored by the user.
- Breaks are explicit calendar events named `Pausa`.
