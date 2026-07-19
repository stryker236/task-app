# Python Scheduler Service

Small HTTP service for Advisor calendar scheduling. It uses a deterministic greedy scheduler to place eligible tasks into future work slots.

## Setup

```bash
python -m pip install -r requirements.txt
```

## Run

```bash
python app.py
```

Defaults:

- Host: `127.0.0.1`
- Port: `8000`
- Health: `GET /health`
- Schedule: `POST /schedule`

The Node backend reads `SCHEDULER_SERVICE_URL`; if unset, it uses `http://127.0.0.1:8000`.

## Test

```bash
python -m unittest discover -s . -p "test_*.py"
```

## Scheduling Model

The service schedules compact task payloads only. It does not interpret natural language and does not match tags or task titles. The Node backend resolves active scheduler rules into per-task constraints before calling this service.

Working hours are `08:00` to `22:00` in the supplied timezone. Candidate slots use 15-minute increments. Existing busy calendar events, committed reserved blocks, user-fixed preview constraints, task duration, and due dates are respected.

## Request Shape

```json
{
  "now": "2026-07-08T08:00:00Z",
  "horizonEnd": "2026-07-20T22:00:00Z",
  "timeZone": "Europe/Lisbon",
  "busy": [
    {
      "calendarId": "primary",
      "start": "2026-07-08T09:00:00Z",
      "end": "2026-07-08T10:00:00Z"
    }
  ],
  "constraints": [
    {
      "taskId": "task-a",
      "fixedStart": "2026-07-10T10:00:00Z",
      "fixedEnd": "2026-07-10T10:30:00Z"
    }
  ],
  "taskConstraints": {
    "task-a": [
      {
        "id": "constraint-id",
        "ruleId": "rule-id",
        "type": "allowed_date",
        "payload": {
          "date": "2026-07-18",
          "startTime": "10:00",
          "endTime": "12:00"
        },
        "hard": true
      }
    ]
  },
  "tasks": [
    {
      "id": "task-a",
      "title": "Prepare invoice",
      "durationMinutes": 30,
      "dueDateTime": null
    }
  ]
}
```

## Supported Constraints

- `blocked_window`: rejects candidate slots overlapping `startTime`/`endTime`, optionally limited by `days`, `date`, or `dates`.
- `allowed_window`: only allows slots inside `startTime`/`endTime`, optionally limited by `days`, `date`, or `dates`.
- `allowed_date`: only allows slots on one exact `date` or a list of `dates`, optionally inside `startTime`/`endTime`.
- `preferred_window`: gives matching slots a better score, optionally limited by `days`, `date`, or `dates`.
- `avoid_day`: rejects ISO weekdays listed in `days`.
- `priority_boost`: moves matching tasks/slots earlier by score, optionally limited by `days`, `date`, or `dates`.
- `daily_limit`: caps matching tasks per day, optionally limited by `days`, `date`, or `dates`.
- `break_after_task`: reserves a break after a scheduled task.
- `break_after_work_block`: reserves a break after a continuous work threshold.
- `min_duration`: rejects tasks shorter than `minutes`.
- `max_duration`: rejects tasks longer than `minutes`.

Time payloads use `HH:mm`. Weekdays use ISO numbers: Monday is `1`, Sunday is `7`. Exact calendar dates use `date: "YYYY-MM-DD"` or `dates: ["YYYY-MM-DD"]`.

## Breaks

Breaks are returned as `reserved` preview blocks. They are calculated by the scheduler and can push following tasks later in the same scheduling run.

Example:

```json
{
  "type": "break_after_work_block",
  "payload": {
    "workMinutes": 90,
    "breakMinutes": 15
  }
}
```

Three 30-minute tasks become:

```text
08:00-08:30 task
08:30-09:00 task
09:00-09:30 task
09:30-09:45 break
09:45-10:15 next task
```

Preview breaks are disposable. The Node backend persists them only when the user accepts the full schedule batch.

## Response Shape

```json
{
  "scheduled": [
    {
      "taskId": "task-a",
      "start": "2026-07-18T10:00:00Z",
      "end": "2026-07-18T10:30:00Z",
      "appliedConstraintIds": ["constraint-id"]
    }
  ],
  "reserved": [
    {
      "type": "break",
      "start": "2026-07-18T10:30:00Z",
      "end": "2026-07-18T10:45:00Z",
      "reason": "break_after_task",
      "sourceRuleId": "rule-id",
      "sourceConstraintId": "constraint-id"
    }
  ],
  "unscheduled": [
    {
      "taskId": "task-b",
      "reason": "no available slot before due date"
    }
  ]
}
```
