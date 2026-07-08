from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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


def schedule_timezone(payload: dict[str, Any]) -> timezone | ZoneInfo:
    name = str(payload.get("timeZone") or payload.get("timezone") or "Europe/Lisbon")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def parse_datetime(value: str | None, target_timezone: timezone | ZoneInfo) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=target_timezone)
    return parsed.astimezone(target_timezone)


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


def constraint_map(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    constraints = payload.get("constraints", [])
    if not isinstance(constraints, list):
        return {}
    mapped: dict[str, dict[str, Any]] = {}
    for item in constraints:
        if not isinstance(item, dict):
            continue
        task_id = str(item.get("taskId") or item.get("id") or "")
        fixed_start = item.get("fixedStart") or item.get("start")
        if task_id and fixed_start:
            mapped[task_id] = {
                "fixedStart": fixed_start,
                "fixedEnd": item.get("fixedEnd") or item.get("end"),
            }
    return mapped


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
    constraints: dict[str, dict[str, Any]],
    target_timezone: timezone | ZoneInfo,
) -> tuple[list[Candidate], str | None]:
    task_id = str(task.get("id") or "")
    minutes = duration_minutes(task)
    constraint = constraints.get(task_id, {})
    fixed_start = parse_datetime(constraint.get("fixedStart") or task.get("fixedStart"), target_timezone)
    fixed_end = parse_datetime(constraint.get("fixedEnd") or task.get("fixedEnd"), target_timezone) or (fixed_start + timedelta(minutes=minutes) if fixed_start else None)
    due = parse_datetime(task.get("dueDateTime"), target_timezone)

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
    target_timezone = schedule_timezone(payload)
    now = parse_datetime(payload.get("now"), target_timezone) or datetime.now(target_timezone)
    horizon_end = parse_datetime(payload.get("horizonEnd"), target_timezone) or (now + timedelta(days=14))
    tasks = [task for task in payload.get("tasks", []) if isinstance(task, dict) and task.get("id")]
    constraints = constraint_map(payload)
    busy = []
    busy_items = payload.get("busy", payload.get("calendarAvailability", []))
    for item in busy_items:
        if not isinstance(item, dict):
            continue
        start = parse_datetime(item.get("start"), target_timezone)
        end = parse_datetime(item.get("end"), target_timezone)
        if start and end and end > start:
            busy.append((start, end))

    scheduled = []
    unscheduled: list[dict[str, str]] = []
    task_order = {str(task["id"]): index for index, task in enumerate(tasks)}
    ordered_tasks = sorted(
        tasks,
        key=lambda task: (
            0 if str(task["id"]) in constraints else 1,
            parse_datetime(task.get("dueDateTime"), target_timezone) or horizon_end,
            task_order[str(task["id"])],
        ),
    )

    for task in ordered_tasks:
        task_id = str(task["id"])
        order = task_order[task_id]
        candidates, reason = build_candidates(task, order, now, horizon_end, busy, constraints, target_timezone)
        if not candidates:
            unscheduled.append({"taskId": task_id, "reason": reason or "no valid candidates"})
            continue

        model = cp_model.CpModel()
        candidate_vars: list[tuple[Candidate, cp_model.IntVar]] = []
        for index, candidate in enumerate(candidates):
            var = model.NewBoolVar(f"{task_id}_{index}")
            candidate_vars.append((candidate, var))
        model.AddExactlyOne(var for _, var in candidate_vars)
        model.Minimize(sum((candidate.slot * max(1, len(tasks)) + candidate.order) * var for candidate, var in candidate_vars))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 1
        solver.parameters.num_search_workers = 8
        status = solver.Solve(model)
        selected = None
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for candidate, var in candidate_vars:
                if solver.BooleanValue(var):
                    selected = candidate
                    break
        if not selected:
            unscheduled.append({"taskId": task_id, "reason": "no valid slot selected"})
            continue

        busy.append((selected.start, selected.end))
        for candidate, var in candidate_vars:
            if candidate == selected:
                scheduled.append({
                    "taskId": selected.task_id,
                    "start": iso(selected.start),
                    "end": iso(selected.end),
                })
                break

    scheduled.sort(key=lambda item: item["start"])
    return {"scheduled": scheduled, "unscheduled": unscheduled}
