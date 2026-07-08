from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from ortools.sat.python import cp_model

SLOT_MINUTES = 15
WORKDAY_START_HOUR = 8
WORKDAY_END_HOUR = 22
DEFAULT_DURATION_MINUTES = 30
MAX_DURATION_MINUTES = 240


@dataclass(frozen=True)
class Candidate:
    task_id: str
    start: datetime
    end: datetime
    slot: int
    order: int


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def ceil_to_slot(value: datetime) -> datetime:
    minute = (value.minute // SLOT_MINUTES) * SLOT_MINUTES
    rounded = value.replace(minute=minute, second=0, microsecond=0)
    if rounded < value:
        rounded += timedelta(minutes=SLOT_MINUTES)
    return rounded


def duration_minutes(task: dict[str, Any]) -> int:
    try:
        minutes = int(task.get("durationMinutes") or DEFAULT_DURATION_MINUTES)
    except (TypeError, ValueError):
        minutes = DEFAULT_DURATION_MINUTES
    return max(SLOT_MINUTES, min(MAX_DURATION_MINUTES, minutes))


def overlaps(left_start: datetime, left_end: datetime, right_start: datetime, right_end: datetime) -> bool:
    return left_start < right_end and right_start < left_end


def workday_bounds(day: datetime) -> tuple[datetime, datetime]:
    start = day.replace(hour=WORKDAY_START_HOUR, minute=0, second=0, microsecond=0)
    end = day.replace(hour=WORKDAY_END_HOUR, minute=0, second=0, microsecond=0)
    return start, end


def candidate_overlaps_busy(candidate: Candidate, busy: list[tuple[datetime, datetime]]) -> bool:
    return any(overlaps(candidate.start, candidate.end, start, end) for start, end in busy)


def build_candidates(
    task: dict[str, Any],
    order: int,
    now: datetime,
    horizon_end: datetime,
    busy: list[tuple[datetime, datetime]],
) -> tuple[list[Candidate], str | None]:
    task_id = str(task.get("id") or "")
    minutes = duration_minutes(task)
    fixed_start = parse_datetime(task.get("fixedStart"))
    fixed_end = parse_datetime(task.get("fixedEnd")) or (fixed_start + timedelta(minutes=minutes) if fixed_start else None)
    due = parse_datetime(task.get("dueDateTime"))

    if fixed_start:
        fixed_end = fixed_end or fixed_start + timedelta(minutes=minutes)
        day_start, day_end = workday_bounds(fixed_start)
        if fixed_start < now:
            return [], "fixed slot is in the past"
        if fixed_start < day_start or fixed_end > day_end:
            return [], "fixed slot is outside working hours"
        if due and fixed_end > due:
            return [], "fixed slot exceeds due date"
        candidate = Candidate(task_id, fixed_start, fixed_end, int((fixed_start - now).total_seconds() // 60), order)
        if candidate_overlaps_busy(candidate, busy):
            return [], "fixed slot overlaps busy time"
        return [candidate], None

    candidates: list[Candidate] = []
    cursor = ceil_to_slot(now)
    while cursor + timedelta(minutes=minutes) <= horizon_end:
        day_start, day_end = workday_bounds(cursor)
        if cursor < day_start:
            cursor = day_start
        end = cursor + timedelta(minutes=minutes)
        if end <= day_end and (not due or end <= due):
            candidate = Candidate(task_id, cursor, end, int((cursor - now).total_seconds() // 60), order)
            if not candidate_overlaps_busy(candidate, busy):
                candidates.append(candidate)
        cursor += timedelta(minutes=SLOT_MINUTES)

    if candidates:
        return candidates, None
    if due and due <= now:
        return [], "due date is in the past"
    return [], "no available slot before due date" if due else "no available future slot"


def solve_schedule(payload: dict[str, Any]) -> dict[str, Any]:
    now = parse_datetime(payload.get("now")) or datetime.now(timezone.utc)
    horizon_end = parse_datetime(payload.get("horizonEnd")) or (now + timedelta(days=14))
    tasks = [task for task in payload.get("tasks", []) if isinstance(task, dict) and task.get("id")]
    busy = []
    for item in payload.get("busy", []):
        if not isinstance(item, dict):
            continue
        start = parse_datetime(item.get("start"))
        end = parse_datetime(item.get("end"))
        if start and end and end > start:
            busy.append((start, end))

    model = cp_model.CpModel()
    candidate_vars: list[tuple[Candidate, cp_model.IntVar]] = []
    task_vars: dict[str, list[cp_model.IntVar]] = {}
    unscheduled: list[dict[str, str]] = []

    for order, task in enumerate(tasks):
        task_id = str(task["id"])
        candidates, reason = build_candidates(task, order, now, horizon_end, busy)
        if not candidates:
            unscheduled.append({"taskId": task_id, "reason": reason or "no valid candidates"})
            continue
        task_vars[task_id] = []
        for index, candidate in enumerate(candidates):
            var = model.NewBoolVar(f"{task_id}_{index}")
            candidate_vars.append((candidate, var))
            task_vars[task_id].append(var)
        model.AddAtMostOne(task_vars[task_id])

    for index, (left, left_var) in enumerate(candidate_vars):
        for right, right_var in candidate_vars[index + 1 :]:
            if left.task_id != right.task_id and overlaps(left.start, left.end, right.start, right.end):
                model.Add(left_var + right_var <= 1)

    if candidate_vars:
        scheduled_count = sum(var for _, var in candidate_vars)
        start_cost = sum((candidate.slot * max(1, len(tasks)) + candidate.order) * var for candidate, var in candidate_vars)
        model.Maximize(scheduled_count * 1_000_000 - start_cost)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    scheduled = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for candidate, var in candidate_vars:
            if solver.BooleanValue(var):
                scheduled.append({
                    "taskId": candidate.task_id,
                    "start": iso(candidate.start),
                    "end": iso(candidate.end),
                })

    scheduled_ids = {item["taskId"] for item in scheduled}
    for task_id in task_vars:
        if task_id not in scheduled_ids:
            unscheduled.append({"taskId": task_id, "reason": "no non-overlapping slot found"})

    scheduled.sort(key=lambda item: item["start"])
    return {"scheduled": scheduled, "unscheduled": unscheduled}
