from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
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
    score: int = 0
    applied_constraint_ids: tuple[str, ...] = ()


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


def task_constraints(payload: dict[str, Any], task_id: str) -> list[dict[str, Any]]:
    constraints = payload.get("taskConstraints", {})
    if not isinstance(constraints, dict):
        return []
    items = constraints.get(task_id, [])
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def parse_hhmm(value: Any) -> int | None:
    if not isinstance(value, str) or ":" not in value:
        return None
    try:
        hour, minute = value.split(":", 1)
        resolved = int(hour) * 60 + int(minute)
    except ValueError:
        return None
    return resolved if 0 <= resolved <= 24 * 60 else None


def day_matches(candidate: Candidate, payload: dict[str, Any]) -> bool:
    days = payload.get("days")
    days_of_month = payload.get("daysOfMonth")
    if isinstance(days, list) and days:
        if candidate.start.isoweekday() not in {int(day) for day in days if str(day).isdigit()}:
            return False
    if isinstance(days_of_month, list) and days_of_month:
        if candidate.start.day not in {int(day) for day in days_of_month if str(day).isdigit()}:
            return False
    return True


def candidate_minutes(candidate: Candidate) -> tuple[int, int]:
    return (
        candidate.start.hour * 60 + candidate.start.minute,
        candidate.end.hour * 60 + candidate.end.minute,
    )


def window_payload(payload: dict[str, Any]) -> tuple[int | None, int | None]:
    return parse_hhmm(payload.get("startTime")), parse_hhmm(payload.get("endTime"))


def candidate_overlaps_window(candidate: Candidate, payload: dict[str, Any]) -> bool:
    start, end = window_payload(payload)
    if start is None or end is None or not day_matches(candidate, payload):
        return False
    candidate_start, candidate_end = candidate_minutes(candidate)
    return candidate_start < end and start < candidate_end


def candidate_inside_window(candidate: Candidate, payload: dict[str, Any]) -> bool:
    start, end = window_payload(payload)
    if start is None or end is None or not day_matches(candidate, payload):
        return False
    candidate_start, candidate_end = candidate_minutes(candidate)
    return candidate_start >= start and candidate_end <= end


def candidate_matches_temporal_payload(candidate: Candidate, payload: dict[str, Any]) -> bool:
    if not day_matches(candidate, payload):
        return False
    start, end = window_payload(payload)
    if start is None and end is None:
        return True
    if start is None or end is None:
        return False
    return candidate_inside_window(candidate, payload)


def candidate_inside_allowed_date(candidate: Candidate, payload: dict[str, Any]) -> bool:
    date = payload.get("date")
    if not isinstance(date, str):
        return False
    if candidate.start.date().isoformat() != date:
        return False
    start, end = window_payload(payload)
    if start is None and end is None:
        return True
    if start is None or end is None:
        return False
    candidate_start, candidate_end = candidate_minutes(candidate)
    return candidate_start >= start and candidate_end <= end


def daily_limit_key(constraint: dict[str, Any]) -> str:
    constraint_id = str(constraint.get("id") or "")
    if constraint_id:
        return constraint_id
    return json.dumps({
        "type": constraint.get("type"),
        "payload": constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {},
    }, sort_keys=True)


def scheduled_count_for_candidate(candidate: Candidate, constraint: dict[str, Any], daily_counts: dict[tuple[str, str], int]) -> int:
    day_key = candidate.start.date().isoformat()
    return daily_counts.get((daily_limit_key(constraint), day_key), 0)


def priority_boost_weight(payload: dict[str, Any]) -> int:
    if payload.get("weight") is not None:
        return int(payload.get("weight") or 100)
    if payload.get("daysOfMonth") or payload.get("days"):
        return 10000
    return 100


def task_priority_bias(constraints: list[dict[str, Any]]) -> int:
    bias = 0
    for constraint in constraints:
        if str(constraint.get("type") or "") != "priority_boost":
            continue
        payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
        bias -= priority_boost_weight(payload)
    return bias


def break_minutes(payload: dict[str, Any]) -> int:
    try:
        minutes = int(payload.get("breakMinutes") or DEFAULT_DURATION_MINUTES)
    except (TypeError, ValueError):
        minutes = DEFAULT_DURATION_MINUTES
    return max(SLOT_MINUTES, min(MAX_DURATION_MINUTES, minutes))


def min_break_task_duration(payload: dict[str, Any]) -> int:
    try:
        minutes = int(payload.get("minDurationMinutes") or 0)
    except (TypeError, ValueError):
        minutes = 0
    return max(0, minutes)


def evaluate_task_constraints(
    candidate: Candidate,
    constraints: list[dict[str, Any]],
    duration: int,
    daily_counts: dict[tuple[str, str], int],
) -> tuple[bool, int, list[str], list[str]]:
    score = 0
    applied: list[str] = []
    blocking: list[str] = []
    for constraint in constraints:
        constraint_id = str(constraint.get("id") or "")
        kind = str(constraint.get("type") or "")
        payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
        hard = constraint.get("hard") is not False

        violates = False
        if kind == "blocked_window":
            violates = candidate_overlaps_window(candidate, payload)
        elif kind == "allowed_window":
            violates = not candidate_inside_window(candidate, payload)
        elif kind == "avoid_day":
            days = payload.get("days")
            violates = isinstance(days, list) and candidate.start.isoweekday() in {int(day) for day in days if str(day).isdigit()}
        elif kind == "min_duration":
            violates = duration < int(payload.get("minutes") or 0)
        elif kind == "max_duration":
            minutes = int(payload.get("minutes") or MAX_DURATION_MINUTES)
            violates = duration > minutes
        elif kind == "preferred_window":
            if candidate_inside_window(candidate, payload):
                score -= int(payload.get("weight") or 100)
                if constraint_id:
                    applied.append(constraint_id)
        elif kind == "priority_boost":
            if candidate_matches_temporal_payload(candidate, payload):
                score -= priority_boost_weight(payload)
                if constraint_id:
                    applied.append(constraint_id)
        elif kind == "daily_limit":
            max_count = int(payload.get("max") or 0)
            if max_count > 0 and candidate_matches_temporal_payload(candidate, payload):
                violates = scheduled_count_for_candidate(candidate, constraint, daily_counts) >= max_count
        elif kind == "allowed_date":
            violates = not candidate_inside_allowed_date(candidate, payload)
        elif kind in ("break_after_task", "break_after_work_block"):
            pass

        if violates and hard:
            if constraint_id:
                blocking.append(constraint_id)
        elif not violates and constraint_id and kind != "preferred_window":
            applied.append(constraint_id)

    return not blocking, score, applied, blocking


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
            return [], "fixed slot is in the past"
        if fixed_start < day_start or fixed_end > day_end:
            return [], "fixed slot is outside working hours"
        if due and fixed_end > due:
            return [], "fixed slot exceeds due date"
        candidate = Candidate(task_id, fixed_start, fixed_end, int((fixed_start - now).total_seconds() // 60), order)
        if candidate_overlaps_busy(candidate, busy):
            return [], "fixed slot overlaps busy time", []
        allowed, score, applied, blocking = evaluate_task_constraints(candidate, task_rule_constraints, minutes, daily_counts)
        if not allowed:
            return [], "fixed slot violates scheduler constraints", blocking
        return [Candidate(candidate.task_id, candidate.start, candidate.end, candidate.slot, candidate.order, score, tuple(applied))], None, []

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
                allowed, score, applied, _ = evaluate_task_constraints(candidate, task_rule_constraints, minutes, daily_counts)
                if allowed:
                    candidates.append(Candidate(task_id, cursor, end, int((cursor - now).total_seconds() // 60), order, score, tuple(applied)))
        cursor += timedelta(minutes=SLOT_MINUTES)

    if candidates:
        return candidates, None, []
    if due and due <= now:
        return [], "due date is in the past", []
    return [], "no available slot before due date" if due else "no available future slot", []


def can_place_reserved_break(start: datetime, end: datetime, occupied: list[tuple[datetime, datetime]]) -> bool:
    day_start, day_end = workday_bounds(start)
    if start < day_start or end > day_end:
        return False
    return not any(overlaps(start, end, occupied_start, occupied_end) for occupied_start, occupied_end in occupied)


def append_reserved_break(
    reserved: list[dict[str, Any]],
    occupied: list[tuple[datetime, datetime]],
    start: datetime,
    minutes: int,
    reason: str,
    constraint: dict[str, Any],
) -> bool:
    end = start + timedelta(minutes=minutes)
    if not can_place_reserved_break(start, end, occupied):
        return False
    occupied.append((start, end))
    reserved.append({
        "type": "break",
        "start": iso(start),
        "end": iso(end),
        "reason": reason,
        "sourceRuleId": str(constraint.get("ruleId") or "") or None,
        "sourceConstraintId": str(constraint.get("id") or "") or None,
    })
    return True


def matching_break_constraints(constraints: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [
        constraint
        for constraint in constraints
        if str(constraint.get("type") or "") == kind
    ]


def calculate_reserved_breaks(
    scheduled: list[dict[str, Any]],
    task_rule_constraints: dict[str, list[dict[str, Any]]],
    busy: list[tuple[datetime, datetime]],
    target_timezone: timezone | ZoneInfo,
) -> list[dict[str, Any]]:
    reserved: list[dict[str, Any]] = []
    scheduled_intervals = []
    for item in scheduled:
        start = parse_datetime(item.get("start"), target_timezone)
        end = parse_datetime(item.get("end"), target_timezone)
        if start and end:
            scheduled_intervals.append((str(item.get("taskId") or ""), start, end))
    scheduled_intervals.sort(key=lambda item: item[1])
    occupied = [*busy, *[(start, end) for _, start, end in scheduled_intervals]]

    work_block_minutes = 0
    last_end: datetime | None = None
    active_work_block_constraint: dict[str, Any] | None = None
    for task_id, start, end in scheduled_intervals:
        constraints = task_rule_constraints.get(task_id, [])
        for constraint in matching_break_constraints(constraints, "break_after_task"):
            payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
            duration = int((end - start).total_seconds() // 60)
            if duration < min_break_task_duration(payload):
                continue
            append_reserved_break(
                reserved,
                occupied,
                end,
                break_minutes(payload),
                "break_after_task",
                constraint,
            )

        block_constraints = matching_break_constraints(constraints, "break_after_work_block")
        if not block_constraints:
            work_block_minutes = 0
            last_end = None
            active_work_block_constraint = None
            continue
        constraint = block_constraints[0]
        payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
        threshold = int(payload.get("workMinutes") or 0)
        if not last_end or start > last_end:
            work_block_minutes = 0
            active_work_block_constraint = constraint
        work_block_minutes += int((end - start).total_seconds() // 60)
        last_end = end
        active_work_block_constraint = constraint
        if threshold > 0 and work_block_minutes >= threshold:
            if append_reserved_break(reserved, occupied, end, break_minutes(payload), "break_after_work_block", active_work_block_constraint):
                work_block_minutes = 0
                last_end = None
                active_work_block_constraint = None

    reserved.sort(key=lambda item: item["start"])
    return reserved


def reserve_breaks_after_selected_task(
    selected: Candidate,
    rule_constraints: list[dict[str, Any]],
    busy: list[tuple[datetime, datetime]],
    reserved: list[dict[str, Any]],
    work_state: dict[str, Any],
) -> None:
    duration = int((selected.end - selected.start).total_seconds() // 60)
    for constraint in matching_break_constraints(rule_constraints, "break_after_task"):
        payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
        if duration < min_break_task_duration(payload):
            continue
        append_reserved_break(
            reserved,
            busy,
            selected.end,
            break_minutes(payload),
            "break_after_task",
            constraint,
        )

    block_constraints = matching_break_constraints(rule_constraints, "break_after_work_block")
    if not block_constraints:
        work_state["minutes"] = 0
        work_state["last_end"] = None
        return

    constraint = block_constraints[0]
    payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
    threshold = int(payload.get("workMinutes") or 0)
    last_end = work_state.get("last_end")
    if not last_end or selected.start > last_end:
        work_state["minutes"] = 0
    work_state["minutes"] = int(work_state.get("minutes") or 0) + duration
    work_state["last_end"] = selected.end
    if threshold > 0 and work_state["minutes"] >= threshold:
        if append_reserved_break(reserved, busy, selected.end, break_minutes(payload), "break_after_work_block", constraint):
            work_state["minutes"] = 0
            work_state["last_end"] = None


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
    unscheduled: list[dict[str, Any]] = []
    task_order = {str(task["id"]): index for index, task in enumerate(tasks)}
    task_rule_constraints = {
        str(task["id"]): task_constraints(payload, str(task["id"]))
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
        order = task_order[task_id]
        rule_constraints = task_rule_constraints[task_id]
        candidates, reason, blocking = build_candidates(task, order, now, horizon_end, busy, constraints, rule_constraints, daily_counts, target_timezone)
        if not candidates:
            unscheduled_item = {"taskId": task_id, "reason": reason or "no valid candidates"}
            if blocking:
                unscheduled_item["blockingConstraintIds"] = blocking
            unscheduled.append(unscheduled_item)
            continue

        model = cp_model.CpModel()
        candidate_vars: list[tuple[Candidate, cp_model.IntVar]] = []
        for index, candidate in enumerate(candidates):
            var = model.NewBoolVar(f"{task_id}_{index}")
            candidate_vars.append((candidate, var))
        model.AddExactlyOne(var for _, var in candidate_vars)
        model.Minimize(sum((candidate.slot * max(1, len(tasks)) + candidate.order + candidate.score) * var for candidate, var in candidate_vars))

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
        reserve_breaks_after_selected_task(selected, rule_constraints, busy, reserved, work_state)
        for constraint in rule_constraints:
            if str(constraint.get("type") or "") == "daily_limit":
                payload_item = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
                if candidate_matches_temporal_payload(selected, payload_item):
                    key = (daily_limit_key(constraint), selected.start.date().isoformat())
                    daily_counts[key] = daily_counts.get(key, 0) + 1
        for candidate, var in candidate_vars:
            if candidate == selected:
                scheduled.append({
                    "taskId": selected.task_id,
                    "start": iso(selected.start),
                    "end": iso(selected.end),
                    "appliedConstraintIds": list(selected.applied_constraint_ids),
                })
                break

    scheduled.sort(key=lambda item: item["start"])
    reserved.sort(key=lambda item: item["start"])
    return {"scheduled": scheduled, "reserved": reserved, "unscheduled": unscheduled}
