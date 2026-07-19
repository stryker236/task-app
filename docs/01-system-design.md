# System Design

## Component Diagram

```mermaid
flowchart TD
  User[User] --> FE[React/Vite Frontend]
  FE --> API[Node/Express Backend]
  API --> DB[(PostgreSQL / Supabase)]
  API --> Scheduler[Python Scheduler Service]
  API --> Google[Google Calendar / Gmail APIs]
  API --> OpenAI[OpenAI API]
  API --> Logs[Structured Logs]

  Scheduler --> API
  Google --> API
  OpenAI --> API
```

## Responsibilities

| Component | Responsibilities |
| --- | --- |
| Frontend | Views, forms, proposal review, calendar preview, drag/drop adjustments, settings, scheduled review UI. |
| Backend | API, validation, persistence, Advisor orchestration, Google integration, scheduler request preparation, productivity events. |
| PostgreSQL/Supabase | Durable storage for tasks, tags, relations, scheduler rules, calendar event links, review state, settings, and logs. |
| Python Scheduler | Converts tasks, busy windows, constraints, and preferences into proposed calendar slots. |
| Google Calendar | External source of busy events and destination for committed scheduled events. |
| OpenAI | Optional interpretation/generation for Advisor proposals and natural-language scheduler rules. |

## Main Flows

### Task Lifecycle

```mermaid
flowchart LR
  Create[Create task] --> Groom[Add tags, priority, estimate, due date]
  Groom --> Schedule[Advisor schedule preview]
  Schedule --> Commit[Commit Google event]
  Commit --> Scheduled[Task has active scheduled event]
  Scheduled --> Review[A rever after event ends]
  Review --> Done[Mark done]
  Review --> Missed[Mark missed/skipped]
  Missed --> Eligible[Eligible for rescheduling]
```

### Advisor Proposal Flow

```mermaid
sequenceDiagram
  participant UI as Frontend
  participant API as Backend
  participant AI as OpenAI / Local Rules
  participant DB as PostgreSQL

  UI->>API: Request advisor action
  API->>DB: Load tasks/rules/memory/context
  API->>AI: Generate or interpret proposals
  AI-->>API: Proposed commands
  API->>API: Validate and preview commands
  API-->>UI: Proposal buffer
  UI->>API: Apply accepted proposals
  API->>DB: Persist accepted changes
  API-->>UI: Updated state
```

### Calendar Scheduling Flow

```mermaid
sequenceDiagram
  participant UI as Frontend Calendar
  participant API as Backend
  participant DB as PostgreSQL
  participant PY as Python Scheduler
  participant GCal as Google Calendar

  UI->>API: Request schedule_calendar_events
  API->>DB: Load active tasks, rules, linked events
  API->>GCal: Load busy events
  API->>PY: Send tasks + busy + constraints
  PY-->>API: Proposed schedule + breaks
  API-->>UI: Preview events
  UI->>UI: Drag/edit/select proposals
  UI->>API: Commit selected proposals
  API->>GCal: Create Google Calendar events
  API->>DB: Insert task_calendar_events links
  API-->>UI: Updated tasks/calendar cache
```

## Design Principles

- The backend owns domain validation and side effects.
- The frontend can preview and edit proposals, but committed behavior is enforced server-side.
- Google Calendar is external state; internal task scheduling state comes from linked `task_calendar_events`.
- Natural-language rules are converted into structured constraints before they affect scheduling.
- Durable history matters: reviews, activities, and productivity events are stored instead of inferred only from current state.
