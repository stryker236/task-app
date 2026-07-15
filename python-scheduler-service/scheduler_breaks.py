from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from scheduler_constraints import candidate_matches_temporal_payload, daily_limit_key
from scheduler_time import iso, overlaps, workday_bounds
from scheduler_types import (
    Candidate,
    DEFAULT_DURATION_MINUTES,
    MAX_DURATION_MINUTES,
    SLOT_MINUTES,
)


def break_minutes(constraint_payload: dict[str, Any]) -> int:
    try:
        minutes = int(constraint_payload.get("breakMinutes") or DEFAULT_DURATION_MINUTES)
    except (TypeError, ValueError):
        minutes = DEFAULT_DURATION_MINUTES
    return max(SLOT_MINUTES, min(MAX_DURATION_MINUTES, minutes))



def min_break_task_duration(constraint_payload: dict[str, Any]) -> int:
    try:
        minutes = int(constraint_payload.get("minDurationMinutes") or 0)
    except (TypeError, ValueError):
        minutes = 0
        
    return max(0, minutes)


def can_place_reserved_break(
    break_start: datetime,
    break_end: datetime,
    occupied_intervals: list[tuple[datetime, datetime]],
) -> bool:
    day_start, day_end = workday_bounds(break_start)
    if break_start < day_start or break_end > day_end:
        return False

    return not any(
        overlaps(break_start, break_end, occupied_start, occupied_end)
        for occupied_start, occupied_end in occupied_intervals
    )


def append_reserved_break(
    reserved_breaks: list[dict[str, Any]],
    occupied_intervals: list[tuple[datetime, datetime]],
    break_start: datetime,
    duration_minutes: int,
    break_reason: str,
    source_constraint: dict[str, Any],
) -> bool:
    break_end = break_start + timedelta(minutes=duration_minutes)
    if not can_place_reserved_break(break_start, break_end, occupied_intervals):
        return False
    occupied_intervals.append((break_start, break_end))
    reserved_breaks.append(
        {
            "type": "break",
            "start": iso(break_start),
            "end": iso(break_end),
            "reason": break_reason,
            "sourceRuleId": str(source_constraint.get("ruleId") or "") or None,
            "sourceConstraintId": str(source_constraint.get("id") or "") or None,
        }
    )
    return True


def matching_break_constraints(
    task_constraints: list[dict[str, Any]], constraint_type: str
) -> list[dict[str, Any]]:
    return [
        constraint
        for constraint in task_constraints
        if str(constraint.get("type") or "") == constraint_type
    ]


def reserve_breaks_after_selected_task(
    selected_candidate: Candidate,
    task_rule_constraints: list[dict[str, Any]],
    occupied_intervals: list[tuple[datetime, datetime]],
    reserved_breaks: list[dict[str, Any]],
    work_block_state: dict[str, Any],
) -> None:
    task_duration_minutes = int(
        (selected_candidate.end - selected_candidate.start).total_seconds() // 60
    )

    for break_constraint in matching_break_constraints(
        task_rule_constraints, "break_after_task"
    ):
        constraint_payload = (
            break_constraint.get("payload")
            if isinstance(break_constraint.get("payload"), dict)
            else {}
        )
        if task_duration_minutes < min_break_task_duration(constraint_payload):
            continue
        append_reserved_break(
            reserved_breaks,
            occupied_intervals,
            selected_candidate.end,
            break_minutes(constraint_payload),
            "break_after_task",
            break_constraint,
        )

    work_block_constraints = matching_break_constraints(
        task_rule_constraints, "break_after_work_block"
    )
    if not work_block_constraints:
        work_block_state["minutes"] = 0
        work_block_state["last_end"] = None
        return

    work_block_constraint = work_block_constraints[0]
    constraint_payload = (
        work_block_constraint.get("payload")
        if isinstance(work_block_constraint.get("payload"), dict)
        else {}
    )
    work_minutes_threshold = int(constraint_payload.get("workMinutes") or 0)
    previous_task_end = work_block_state.get("last_end")
    if not previous_task_end or selected_candidate.start != previous_task_end:
        work_block_state["minutes"] = 0
    work_block_state["minutes"] = (
        int(work_block_state.get("minutes") or 0) + task_duration_minutes
    )
    work_block_state["last_end"] = selected_candidate.end
    if (
        work_minutes_threshold > 0
        and work_block_state["minutes"] >= work_minutes_threshold
    ):
        if append_reserved_break(
            reserved_breaks,
            occupied_intervals,
            selected_candidate.end,
            break_minutes(constraint_payload),
            "break_after_work_block",
            work_block_constraint,
        ):
            work_block_state["minutes"] = 0
            work_block_state["last_end"] = None


def update_daily_limits(
    selected_candidate: Candidate,
    task_rule_constraints: list[dict[str, Any]],
    daily_counts: dict[tuple[str, str], int],
) -> None:
    for daily_limit_constraint in task_rule_constraints:
        if str(daily_limit_constraint.get("type") or "") != "daily_limit":
            continue
        constraint_payload = (
            daily_limit_constraint.get("payload")
            if isinstance(daily_limit_constraint.get("payload"), dict)
            else {}
        )
        if candidate_matches_temporal_payload(selected_candidate, constraint_payload):
            key = (
                daily_limit_key(daily_limit_constraint),
                selected_candidate.start.date().isoformat(),
            )
            daily_counts[key] = daily_counts.get(key, 0) + 1
