from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo


from scheduler_breaks import reserve_breaks_after_selected_task, update_daily_limits
from scheduler_constraints import (
    candidate_overlaps_busy,
    constraint_map,
    evaluate_task_constraints,
    normalize_constraints,
    task_constraints,
    task_priority_bias,
)
from scheduler_time import ceil_to_slot, iso, parse_datetime, schedule_timezone, workday_bounds
from scheduler_types import Candidate, DEFAULT_DURATION_MINUTES, MAX_DURATION_MINUTES, SLOT_MINUTES


def duration_minutes(task: dict[str, Any]) -> int:
    try:
        minutes = int(task.get("durationMinutes") or DEFAULT_DURATION_MINUTES)
    except (TypeError, ValueError):
        minutes = DEFAULT_DURATION_MINUTES
    return max(SLOT_MINUTES, min(MAX_DURATION_MINUTES, minutes))


def sorted_busy_intervals(busy: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    return sorted(busy, key=lambda item: item[0])


def first_busy_overlap(start: datetime, end: datetime, busy: list[tuple[datetime, datetime]]) -> tuple[datetime, datetime] | None:
    for busy_start, busy_end in busy:
        if busy_start >= end:
            return None
        if start < busy_end and busy_start < end:
            return busy_start, busy_end
    return None


def better_candidate(current: Candidate | None, candidate: Candidate) -> Candidate:
    if current is None:
        return candidate
    return candidate if candidate_sort_key(candidate) < candidate_sort_key(current) else current


def build_candidates(
    task: dict[str, Any],
    order: int,
    now: datetime,
    horizon_end: datetime,
    busy: list[tuple[datetime, datetime]],
    constraints: dict[str, dict[str, Any]],
    task_rule_constraints: list[dict[str, Any]],
    daily_counts: dict[tuple[str, str], int],
    target_timezone: timezone | ZoneInfo,
) -> tuple[list[Candidate], str | None, list[str]]:
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
            return [], "fixed slot is in the past", []
        if fixed_start < day_start or fixed_end > day_end:
            return [], "fixed slot is outside working hours", []
        if due and fixed_end > due:
            return [], "fixed slot exceeds due date", []
        candidate = Candidate(task_id, fixed_start, fixed_end, int((fixed_start - now).total_seconds() // 60), order)
        if candidate_overlaps_busy(candidate, busy):
            return [], "fixed slot overlaps busy time", []
        allowed, score, applied, blocking = evaluate_task_constraints(candidate, task_rule_constraints, minutes, daily_counts)
        if not allowed:
            return [], "fixed slot violates scheduler constraints", blocking
        return [Candidate(candidate.task_id, candidate.start, candidate.end, candidate.slot, candidate.order, score, tuple(applied))], None, []

    ordered_busy = sorted_busy_intervals(busy)
    best: Candidate | None = None
    cursor = ceil_to_slot(now)
    while cursor + timedelta(minutes=minutes) <= horizon_end:
        day_start, day_end = workday_bounds(cursor)
        if cursor < day_start:
            cursor = day_start
        end = cursor + timedelta(minutes=minutes)
        if end > day_end:
            cursor = ceil_to_slot(day_start + timedelta(days=1))
            continue
        if due and end > due:
            break
        overlap = first_busy_overlap(cursor, end, ordered_busy)
        if overlap:
            cursor = ceil_to_slot(overlap[1])
            continue
        candidate = Candidate(task_id, cursor, end, int((cursor - now).total_seconds() // 60), order)
        allowed, score, applied, _ = evaluate_task_constraints(candidate, task_rule_constraints, minutes, daily_counts)
        if allowed:
            best = better_candidate(best, Candidate(task_id, cursor, end, int((cursor - now).total_seconds() // 60), order, score, tuple(applied)))
        cursor += timedelta(minutes=SLOT_MINUTES)

    if best:
        return [best], None, []
    if due and due <= now:
        return [], "due date is in the past", []
    return [], "no available slot before due date" if due else "no available future slot", []


def candidate_sort_key(candidate: Candidate) -> tuple[int, int, int]:
    return (candidate.score, candidate.slot, candidate.order)


def select_candidate(task_id: str, candidates: list[Candidate], task_count: int) -> Candidate | None:
    if not candidates:
        return None
    return min(candidates, key=candidate_sort_key)


def parse_busy(payload: dict[str, Any], target_timezone: timezone | ZoneInfo) -> list[tuple[datetime, datetime]]:
    busy = []
    busy_items = payload.get("busy", payload.get("calendarAvailability", []))
    for item in busy_items:
        if not isinstance(item, dict):
            continue
        start = parse_datetime(item.get("start"), target_timezone)
        end = parse_datetime(item.get("end"), target_timezone)
        if start and end and end > start:
            busy.append((start, end))
    return busy


def solve_schedule(payload: dict[str, Any]) -> dict[str, Any]:
    target_timezone = schedule_timezone(payload)
    now = parse_datetime(payload.get("now"), target_timezone) or datetime.now(target_timezone)
    horizon_end = parse_datetime(payload.get("horizonEnd"), target_timezone) or (now + timedelta(days=14))
    tasks = [task for task in payload.get("tasks", []) if isinstance(task, dict) and task.get("id")]
    constraints = constraint_map(payload)
    busy = parse_busy(payload, target_timezone)

    scheduled = []
    unscheduled: list[dict[str, Any]] = []
    task_order = {str(task["id"]): index for index, task in enumerate(tasks)}
    task_rule_constraints = {
        str(task["id"]): normalize_constraints(task_constraints(payload, str(task["id"])))
        for task in tasks
    }
    ordered_tasks = sorted(
        tasks,
        key=lambda task: (
            0 if str(task["id"]) in constraints else 1,
            task_priority_bias(task_rule_constraints[str(task["id"])]),
            parse_datetime(task.get("dueDateTime"), target_timezone) or horizon_end,
            task_order[str(task["id"])],
        ),
    )
    daily_counts: dict[tuple[str, str], int] = {}
    reserved: list[dict[str, Any]] = []
    work_state: dict[str, Any] = {"minutes": 0, "last_end": None}

    for task in ordered_tasks:
        task_id = str(task["id"])
        rule_constraints = task_rule_constraints[task_id]
        candidates, reason, blocking = build_candidates(
            task,
            task_order[task_id],
            now,
            horizon_end,
            busy,
            constraints,
            rule_constraints,
            daily_counts,
            target_timezone,
        )
        if not candidates:
            unscheduled_item = {"taskId": task_id, "reason": reason or "no valid candidates"}
            if blocking:
                unscheduled_item["blockingConstraintIds"] = blocking
            unscheduled.append(unscheduled_item)
            continue

        selected = select_candidate(task_id, candidates, len(tasks))
        if not selected:
            unscheduled.append({"taskId": task_id, "reason": "no valid slot selected"})
            continue

        busy.append((selected.start, selected.end))
        reserve_breaks_after_selected_task(selected, rule_constraints, busy, reserved, work_state)
        update_daily_limits(selected, rule_constraints, daily_counts)
        scheduled.append({
            "taskId": selected.task_id,
            "start": iso(selected.start),
            "end": iso(selected.end),
            "appliedConstraintIds": list(selected.applied_constraint_ids),
        })

    scheduled.sort(key=lambda item: item["start"])
    reserved.sort(key=lambda item: item["start"])
    return {"scheduled": scheduled, "reserved": reserved, "unscheduled": unscheduled}
