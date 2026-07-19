# Diagnostic Flows

This document shows non-happy-path flows. Use it when behavior looks wrong and you need to decide which layer to inspect first.

## Task Is Not Proposed For Scheduling

```mermaid
flowchart TD
  Start[Task missing from schedule preview] --> Archived{Archived?}
  Archived -->|Yes| StopArchived[Not eligible]
  Archived -->|No| Status{Status new/in_progress?}
  Status -->|No| StopStatus[Not eligible]
  Status -->|Yes| ActiveEvent{Future/current unreviewed task_calendar_events?}
  ActiveEvent -->|Yes| StopScheduled[Already scheduled]
  ActiveEvent -->|No| PastEvent{Past unreviewed event exists?}
  PastEvent -->|Yes| Review[A rever before rescheduling]
  PastEvent -->|No| HardRules{Hard constraints satisfiable?}
  HardRules -->|No| Unscheduled[Scheduler returns unscheduled reason]
  HardRules -->|Yes| Busy{Calendar busy leaves enough time?}
  Busy -->|No| NoSlot[No available slot]
  Busy -->|Yes| Candidate[Should be candidate]
```

Where to inspect:

- task status/archive: `tasks`
- active event: `task_calendar_events`
- review state: `task_calendar_events.review_status`
- hard constraints: `scheduler_constraints`, `periodic_task_constraints`
- busy input/debug: Advisor schedule debug panel/logs

## Calendar Looks Stale

```mermaid
flowchart TD
  Start[Calendar UI looks stale] --> Source{Source of event?}
  Source -->|Google event| Cache{Read served from cache?}
  Cache -->|Yes| Refresh[Press Atualizar]
  Refresh --> Reload[Backend fetches Google and rewrites cache]
  Cache -->|No| Google[Check Google API response/logs]
  Source -->|Committed proposal| Commit{Commit completed?}
  Commit -->|No| CheckApply[Check /ai/commands/apply error]
  Commit -->|Yes| ClearCache{Cache cleared after create/delete?}
  ClearCache -->|No| BackendBug[Inspect googleRoutes cache invalidation]
  ClearCache -->|Yes| Linked{task_calendar_events link exists?}
  Linked -->|No| DBBug[Inspect insertTaskCalendarEvent]
  Linked -->|Yes| UIRefresh[Inspect frontend reload after commit]
```

Where to inspect:

- frontend refresh: `useGoogleCalendar.ts`
- backend cache: `backend/routes/googleRoutes.ts`
- linked event: `task_calendar_events`
- commit flow: `backend/ai/aiCommands.ts`, `backend/routes/advisorRoutes.ts`

## Scheduled Event Passed But Task Did Not Appear In Review

```mermaid
flowchart TD
  Start[Past event not in A rever] --> Linked{Linked in task_calendar_events?}
  Linked -->|No| NotTracked[Not tracked by app]
  Linked -->|Yes| EndPast{end_at < now?}
  EndPast -->|No| Future[Not ready for review]
  EndPast -->|Yes| TaskOpen{Task still open?}
  TaskOpen -->|No| Done[No review needed]
  TaskOpen -->|Yes| Reviewed{review_status is null?}
  Reviewed -->|No| AlreadyReviewed[Already reviewed]
  Reviewed -->|Yes| FrontendFilter[Inspect pendingScheduledReviewEvents]
```

Where to inspect:

- review helper: `frontend/src/utils/taskScheduling.ts`
- review view: `frontend/src/components/ScheduledReviewView.tsx`
- API data: `GET /tasks` includes `calendarEvents`

## Rule Does Not Affect A Task

```mermaid
flowchart TD
  Start[Rule not affecting task] --> Enabled{Rule enabled and active?}
  Enabled -->|No| FixRule[Enable/activate rule]
  Enabled -->|Yes| Constraint{Constraint enabled?}
  Constraint -->|No| FixConstraint[Enable constraint]
  Constraint -->|Yes| Scope{Scope matches task?}
  Scope -->|No| FixScope[Check tags/title/taskIds/status/priority]
  Scope -->|Yes| HardSoft{Hard or soft?}
  HardSoft -->|Soft| Ranking[It only affects ranking/preference]
  HardSoft -->|Hard| Supported{Scheduler supports this type?}
  Supported -->|No| Implement[Implement/validate constraint type]
  Supported -->|Yes| Debug[Check scheduler debug/rejection reason]
```

Where to inspect:

- rule editor: `SchedulerRulesView.tsx`
- applicable rules in task detail: `TaskDetails.tsx`
- scheduler constraint logic: `python-scheduler-service/scheduler_constraints.py`
- backend request assembly: `backend/routes/advisorRoutes.ts`

## Review Missed Fails To Save

```mermaid
flowchart TD
  Start[Click Nao ficou feita] --> Route{POST review route succeeds?}
  Route -->|No| Backend[Inspect taskRoutes review endpoint]
  Route -->|Yes| EventUpdate{task_calendar_events updated?}
  EventUpdate -->|No| DBReview[Inspect updateTaskCalendarEventReview]
  EventUpdate -->|Yes| XP{productivity_events insert succeeds?}
  XP -->|No| Constraint[Check xp constraint allows negative values]
  XP -->|Yes| Refresh[Inspect frontend refresh]
```

Where to inspect:

- route: `backend/routes/taskRoutes.ts`
- DB function: `backend/db/database.ts`
- XP schema: `productivity_events.xp`
- frontend action: `useTaskActions.reviewScheduledTaskEvent`
