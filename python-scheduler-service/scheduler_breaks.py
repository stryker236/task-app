from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from scheduler_constraints import candidate_matches_temporal_payload, daily_limit_key
from scheduler_time import iso, overlaps, workday_bounds
from scheduler_types import Candidate, DEFAULT_DURATION_MINUTES, MAX_DURATION_MINUTES, SLOT_MINUTES


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


def update_daily_limits(selected: Candidate, rule_constraints: list[dict[str, Any]], daily_counts: dict[tuple[str, str], int]) -> None:
    for constraint in rule_constraints:
        if str(constraint.get("type") or "") != "daily_limit":
            continue
        payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
        if candidate_matches_temporal_payload(selected, payload):
            key = (daily_limit_key(constraint), selected.start.date().isoformat())
            daily_counts[key] = daily_counts.get(key, 0) + 1
