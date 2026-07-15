from __future__ import annotations

import json
from typing import Any

from scheduler_time import parse_hhmm, overlaps
from scheduler_types import Candidate, MAX_DURATION_MINUTES


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


def task_constraints(payload: dict[str, Any], task_id: str) -> list[dict[str, Any]]:
    constraints = payload.get("taskConstraints", {})
    if not isinstance(constraints, dict):
        return []
    items = constraints.get(task_id, [])
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def candidate_overlaps_busy(candidate: Candidate, busy: list[tuple]) -> bool:
    return any(overlaps(candidate.start, candidate.end, start, end) for start, end in busy)


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
    payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
    initial_counts = payload.get("initialCounts") if isinstance(payload.get("initialCounts"), dict) else {}
    try:
        initial_count = int(initial_counts.get(day_key) or 0)
    except (TypeError, ValueError):
        initial_count = 0
    return initial_count + daily_counts.get((daily_limit_key(constraint), day_key), 0)


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
            matches = candidate_inside_window(candidate, payload)
            if hard:
                violates = not matches
            elif matches:
                score -= int(payload.get("weight") or 100)
            if matches and constraint_id:
                applied.append(constraint_id)
        elif kind == "priority_boost":
            matches = candidate_matches_temporal_payload(candidate, payload)
            if hard:
                violates = not matches
            elif matches:
                score -= priority_boost_weight(payload)
            if matches and constraint_id:
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
        elif not violates and constraint_id and kind not in ("preferred_window", "priority_boost"):
            applied.append(constraint_id)

    return not blocking, score, applied, blocking
