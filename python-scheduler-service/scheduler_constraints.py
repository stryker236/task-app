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


def integer_set(values: Any) -> set[int]:
    if not isinstance(values, list):
        return set()
    return {int(value) for value in values if str(value).isdigit()}


def date_set(payload: dict[str, Any]) -> set[str]:
    dates: set[str] = set()
    date = payload.get("date")
    if isinstance(date, str) and date:
        dates.add(date)
    if isinstance(payload.get("dates"), list):
        dates.update(str(value) for value in payload.get("dates") if isinstance(value, str) and value)
    return dates


def normalized_constraint(constraint: dict[str, Any]) -> dict[str, Any]:
    payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
    normalized_payload = dict(payload)
    normalized_payload["_daysSet"] = integer_set(payload.get("days"))
    normalized_payload["_daysOfMonthSet"] = integer_set(payload.get("daysOfMonth"))
    normalized_payload["_datesSet"] = date_set(payload)
    normalized_payload["_startMinutes"] = parse_hhmm(payload.get("startTime"))
    normalized_payload["_endMinutes"] = parse_hhmm(payload.get("endTime"))
    return {**constraint, "payload": normalized_payload}


def normalize_constraints(constraints: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [normalized_constraint(constraint) for constraint in constraints]


def candidate_overlaps_busy(candidate: Candidate, busy: list[tuple]) -> bool:
    return any(overlaps(candidate.start, candidate.end, start, end) for start, end in busy)


def day_matches(candidate: Candidate, payload: dict[str, Any]) -> bool:
    days = payload.get("_daysSet")
    days_of_month = payload.get("_daysOfMonthSet")
    dates = payload.get("_datesSet")
    if not isinstance(days, set):
        days = integer_set(payload.get("days"))
    if not isinstance(days_of_month, set):
        days_of_month = integer_set(payload.get("daysOfMonth"))
    if not isinstance(dates, set):
        dates = date_set(payload)
    has_filters = bool(dates or days or days_of_month)
    if not has_filters:
        return True
    return (
        candidate.start.date().isoformat() in dates
        or candidate.start.isoweekday() in days
        or candidate.start.day in days_of_month
    )


def candidate_minutes(candidate: Candidate) -> tuple[int, int]:
    return (
        candidate.start.hour * 60 + candidate.start.minute,
        candidate.end.hour * 60 + candidate.end.minute,
    )


def window_payload(payload: dict[str, Any]) -> tuple[int | None, int | None]:
    start = payload.get("_startMinutes")
    end = payload.get("_endMinutes")
    return (
        start if isinstance(start, int) else parse_hhmm(payload.get("startTime")),
        end if isinstance(end, int) else parse_hhmm(payload.get("endTime")),
    )


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
    dates = payload.get("_datesSet")
    if not isinstance(dates, set):
        dates = date_set(payload)
    if not dates:
        return False
    if candidate.start.date().isoformat() not in dates:
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
    if payload.get("daysOfMonth") or payload.get("days") or payload.get("date") or payload.get("dates"):
        return 10000
    return 100


def temporal_payload_weight(payload: dict[str, Any]) -> int:
    has_day_filter = bool(payload.get("_daysSet") or payload.get("_daysOfMonthSet") or payload.get("_datesSet") or payload.get("date") or payload.get("dates"))
    has_time_filter = isinstance(payload.get("_startMinutes"), int) and isinstance(payload.get("_endMinutes"), int)
    if has_day_filter and has_time_filter:
        return 30000
    if has_day_filter or has_time_filter:
        return 20000
    return 10000


def has_temporal_filter(payload: dict[str, Any]) -> bool:
    return bool(
        payload.get("_daysSet")
        or payload.get("_daysOfMonthSet")
        or payload.get("_datesSet")
        or payload.get("days")
        or payload.get("date")
        or payload.get("dates")
        or isinstance(payload.get("_startMinutes"), int)
        or isinstance(payload.get("_endMinutes"), int)
        or payload.get("startTime")
        or payload.get("endTime")
    )


def tag_group_time_weight(payload: dict[str, Any]) -> int:
    if payload.get("weight") is not None:
        return int(payload.get("weight") or 10000)
    try:
        strength = float(payload.get("strength", 0.6))
    except (TypeError, ValueError):
        strength = 0.6
    return max(1000, int(round(max(0.1, min(1.0, strength)) * 15000)))


def task_priority_bias(constraints: list[dict[str, Any]]) -> int:
    bias = 0
    for constraint in constraints:
        kind = str(constraint.get("type") or "")
        payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
        hard = constraint.get("hard") is not False
        if kind == "priority_boost":
            bias -= priority_boost_weight(payload)
        elif kind == "tag_group_preference" and has_temporal_filter(payload):
            bias -= tag_group_time_weight(payload) if payload.get("timeMode") != "required" else temporal_payload_weight(payload)
        elif kind == "preferred_window":
            bias -= int(payload.get("weight") or 100)
        elif hard and kind == "allowed_date":
            bias -= 50000
        elif hard and kind == "allowed_window":
            bias -= temporal_payload_weight(payload)
        elif hard and kind == "daily_limit":
            bias -= 5000
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
            days = payload.get("_daysSet")
            if not isinstance(days, set):
                days = integer_set(payload.get("days"))
            violates = candidate.start.isoweekday() in days
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
        elif kind == "tag_group_preference":
            if has_temporal_filter(payload):
                matches = candidate_matches_temporal_payload(candidate, payload)
                if payload.get("timeMode") == "required":
                    violates = not matches
                elif matches:
                    score -= tag_group_time_weight(payload)
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

        if violates and (hard or kind == "tag_group_preference"):
            if constraint_id:
                blocking.append(constraint_id)
        elif not violates and constraint_id and kind not in ("preferred_window", "priority_boost", "tag_group_preference"):
            applied.append(constraint_id)

    return not blocking, score, applied, blocking
