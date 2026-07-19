# Decisions

## ADR 001: Due Date Is Not Scheduled Time

Status: accepted

Context:

Calendar commits previously risked making task deadlines and scheduled appointments ambiguous.

Decision:

`dueDateTime` represents only the task deadline. Scheduled time comes from linked calendar events in `task_calendar_events`.

Consequences:

- Committing calendar proposals must not patch `dueDateTime`.
- Task UI must show deadline and scheduled event separately.
- Scheduler eligibility must inspect future/current linked events.
- Past linked events should be review/history, not active schedule state.

## ADR 002: Scheduled Review Is Per Event

Status: accepted

Context:

A task can be scheduled multiple times. Review state must not be stored only on the task, because that would lose event-specific history.

Decision:

Store review state on `task_calendar_events`.

Consequences:

- One task can have multiple historical scheduled events.
- Each event can be completed, missed, or skipped separately.
- Feedback can later be mined for scheduling improvements.

## ADR 003: Breaks Are Explicit Calendar Events

Status: accepted

Context:

Hidden reserved breaks made calendar cache/debug behavior harder to reason about.

Decision:

Represent scheduled breaks as explicit Google Calendar events named `Pausa`.

Consequences:

- Breaks are visible in Google Calendar.
- Breaks do not have reminders.
- Breaks no longer need hidden local reservation records for normal preview commit flow.

## ADR 004: Advisor Is Approval-Based

Status: accepted

Context:

The app should assist with task grooming and scheduling without surprising data mutations.

Decision:

Advisor actions produce proposals. The user chooses which proposals to accept or ignore.

Consequences:

- UI needs a proposal buffer.
- Backend must validate proposals before applying.
- Feedback can be collected before/after decisions.
