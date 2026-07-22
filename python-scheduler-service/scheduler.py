from __future__ import annotations

from dataclasses import dataclass, replace
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


TAG_GROUPING_SCORE_WEIGHT = 3000
TAG_GROUPING_BEAM_WIDTH = 12
TAG_GROUPING_BRANCH_WIDTH = 8


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


def normalized_tag(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_tag_grouping(payload: dict[str, Any]) -> dict[str, Any]:
    grouping = payload.get("tagGrouping")
    if not isinstance(grouping, dict) or not grouping.get("enabled"):
        return {"enabled": False, "mode": "off", "scope": "block", "strength": 0.0, "groups": []}
    mode = str(grouping.get("mode") or "preferred")
    if mode not in {"preferred", "required"}:
        mode = "preferred"
    scope = str(grouping.get("scope") or "block")
    if scope not in {"block", "day"}:
        scope = "block"
    try:
        strength = float(grouping.get("strength", 0.35))
    except (TypeError, ValueError):
        strength = 0.35
    groups = []
    seen_group_ids = set()
    for index, group in enumerate(grouping.get("groups", [])):
        if not isinstance(group, dict):
            continue
        group_id = str(group.get("id") or group.get("label") or f"group-{index + 1}").strip()
        if not group_id or group_id in seen_group_ids:
            continue
        tags = [normalized_tag(tag) for tag in group.get("tags", []) if normalized_tag(tag)]
        unique_tags = []
        seen_tags = set()
        for tag in tags:
            if tag in seen_tags:
                continue
            seen_tags.add(tag)
            unique_tags.append(tag)
        if len(unique_tags) < 2:
            continue
        seen_group_ids.add(group_id)
        groups.append({"id": group_id, "tags": unique_tags})
    return {
        "enabled": bool(groups),
        "mode": mode if groups else "off",
        "scope": scope,
        "strength": max(0.0, min(1.0, strength)),
        "groups": groups,
    }


def tag_grouping_from_rule_constraints(task_rule_constraints: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    groups: list[dict[str, Any]] = []
    seen_keys = set()
    max_strength = 0.0
    for constraints in task_rule_constraints.values():
        for constraint in constraints:
            if str(constraint.get("type") or "") != "tag_group_preference" or constraint.get("enabled") is False:
                continue
            payload = constraint.get("payload") if isinstance(constraint.get("payload"), dict) else {}
            tags = [normalized_tag(tag) for tag in payload.get("resolvedTags", []) if normalized_tag(tag)]
            unique_tags = []
            seen_tags = set()
            for tag in tags:
                if tag in seen_tags:
                    continue
                seen_tags.add(tag)
                unique_tags.append(tag)
            if len(unique_tags) < 2:
                continue
            key = tuple(unique_tags)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            concept = str(payload.get("concept") or "tag group").strip()
            group_id = str(constraint.get("ruleId") or constraint.get("id") or concept or f"rule-group-{len(groups) + 1}")
            groups.append({
                "id": f"rule:{group_id}",
                "tags": unique_tags,
                "concept": concept,
            })
            try:
                strength = float(payload.get("strength", 0.6))
            except (TypeError, ValueError):
                strength = 0.6
            max_strength = max(max_strength, max(0.1, min(1.0, strength)))
    return {
        "enabled": bool(groups),
        "mode": "preferred" if groups else "off",
        "scope": "block",
        "strength": max_strength,
        "groups": groups,
    }


def merge_tag_grouping(base: dict[str, Any], rule_grouping: dict[str, Any]) -> dict[str, Any]:
    if not rule_grouping.get("enabled"):
        return base
    groups = list(base.get("groups", [])) if base.get("enabled") else []
    existing_keys = {tuple(group.get("tags", [])) for group in groups}
    for group in rule_grouping.get("groups", []):
        key = tuple(group.get("tags", []))
        if key in existing_keys:
            continue
        existing_keys.add(key)
        groups.append(group)
    return {
        "enabled": bool(groups),
        "mode": base.get("mode") if base.get("enabled") else "preferred",
        "scope": base.get("scope") if base.get("enabled") else rule_grouping.get("scope", "block"),
        "strength": max(float(base.get("strength") or 0.0), float(rule_grouping.get("strength") or 0.0)),
        "groups": groups,
        "ruleGroupCount": len(rule_grouping.get("groups", [])),
    }


def tag_group_memberships(tasks: list[dict[str, Any]], tag_grouping: dict[str, Any]) -> dict[str, dict[str, float]]:
    memberships: dict[str, dict[str, float]] = {}
    if not tag_grouping.get("enabled"):
        return memberships
    for task in tasks:
        task_id = str(task.get("id") or "")
        task_tags = {normalized_tag(tag) for tag in task.get("tags", []) if normalized_tag(tag)}
        task_groups: dict[str, float] = {}
        for group in tag_grouping.get("groups", []):
            group_tags = set(group.get("tags", []))
            overlap = task_tags & group_tags
            if overlap:
                task_groups[str(group.get("id"))] = len(overlap) / max(1, len(group_tags))
        memberships[task_id] = task_groups
    return memberships


def group_similarity(task_id: str, block_group_strengths: dict[str, float], memberships: dict[str, dict[str, float]]) -> float:
    task_groups = memberships.get(task_id, {})
    shared = set(task_groups) & set(block_group_strengths)
    if not shared:
        return 0.0
    return max(min(task_groups[group_id], block_group_strengths[group_id]) for group_id in shared)


def candidate_adjacent_gap_minutes(candidate: Candidate, neighbor: Candidate) -> int | None:
    if candidate.start.date() != neighbor.start.date():
        return None
    if neighbor.end <= candidate.start:
        return int((candidate.start - neighbor.end).total_seconds() // 60)
    if candidate.end <= neighbor.start:
        return int((neighbor.start - candidate.end).total_seconds() // 60)
    return None


def candidate_adjacent_block_groups(
    candidate: Candidate,
    scheduled_candidates: list[Candidate],
    memberships: dict[str, dict[str, float]],
) -> dict[str, float]:
    block_groups: dict[str, float] = {}
    for neighbor in scheduled_candidates:
        gap_minutes = candidate_adjacent_gap_minutes(candidate, neighbor)
        if gap_minutes is None or gap_minutes < 0 or gap_minutes > SLOT_MINUTES:
            continue
        for group_id, strength in memberships.get(neighbor.task_id, {}).items():
            block_groups[group_id] = max(float(block_groups.get(group_id, 0)), strength)
    return block_groups


def tag_grouping_score(
    candidate: Candidate,
    scheduled_candidates: list[Candidate],
    memberships: dict[str, dict[str, float]],
    tag_grouping: dict[str, Any],
) -> tuple[int, float, dict[str, float]]:
    if not tag_grouping.get("enabled") or tag_grouping.get("scope") != "block":
        return 0, 0.0, {}
    block_groups = candidate_adjacent_block_groups(candidate, scheduled_candidates, memberships)
    if not block_groups:
        return 0, 0.0, {}
    similarity = group_similarity(candidate.task_id, block_groups, memberships)
    if similarity <= 0:
        if tag_grouping.get("mode") == "required" and memberships.get(candidate.task_id):
            return 100_000, 0.0, block_groups
        return 0, 0.0, block_groups
    strength = float(tag_grouping.get("strength") or 0.0)
    return -int(round(similarity * strength * TAG_GROUPING_SCORE_WEIGHT)), similarity, block_groups


def candidate_with_tag_grouping_score(
    candidate: Candidate,
    scheduled_candidates: list[Candidate],
    memberships: dict[str, dict[str, float]],
    tag_grouping: dict[str, Any],
) -> tuple[Candidate, int, float, dict[str, float]]:
    adjustment, similarity, block_groups = tag_grouping_score(candidate, scheduled_candidates, memberships, tag_grouping)
    if adjustment == 0:
        return candidate, adjustment, similarity, block_groups
    return replace(candidate, score=candidate.score + adjustment), adjustment, similarity, block_groups


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


@dataclass
class ScheduleState:
    busy: list[tuple[datetime, datetime]]
    reserved: list[dict[str, Any]]
    daily_counts: dict[tuple[str, str], int]
    work_state: dict[str, Any]
    remaining_tasks: list[dict[str, Any]]
    scheduled: list[dict[str, Any]]
    scheduled_candidates: list[Candidate]
    unscheduled: list[dict[str, Any]]
    tag_grouping_trace: list[dict[str, Any]]
    total_score: int = 0


def clone_work_state(work_state: dict[str, Any]) -> dict[str, Any]:
    return dict(work_state)


def state_sort_key(state: ScheduleState) -> tuple[int, int, int, tuple[str, ...]]:
    last_candidate = state.scheduled_candidates[-1] if state.scheduled_candidates else None
    last_slot = last_candidate.slot if last_candidate else 0
    last_order = last_candidate.order if last_candidate else 0
    return (
        state.total_score,
        len(state.remaining_tasks),
        last_slot,
        tuple(item["taskId"] for item in state.scheduled),
    )


def apply_selected_candidate(
    state: ScheduleState,
    selected: Candidate,
    selected_debug: dict[str, Any],
    task_rule_constraints: dict[str, list[dict[str, Any]]],
) -> ScheduleState:
    busy = list(state.busy)
    reserved = [dict(item) for item in state.reserved]
    daily_counts = dict(state.daily_counts)
    work_state = clone_work_state(state.work_state)
    scheduled = [dict(item) for item in state.scheduled]
    scheduled_candidates = list(state.scheduled_candidates)
    tag_grouping_trace = [dict(item) for item in state.tag_grouping_trace]

    selected_debug = dict(selected_debug)
    selected_debug["blockGroupsBefore"] = selected_debug["adjacentBlockGroups"]
    tag_grouping_trace.append(selected_debug)
    scheduled_candidates.append(selected)
    busy.append((selected.start, selected.end))
    selected_rule_constraints = task_rule_constraints[selected.task_id]
    reserve_breaks_after_selected_task(selected, selected_rule_constraints, busy, reserved, work_state)
    update_daily_limits(selected, selected_rule_constraints, daily_counts)
    scheduled.append({
        "taskId": selected.task_id,
        "start": iso(selected.start),
        "end": iso(selected.end),
        "appliedConstraintIds": list(selected.applied_constraint_ids),
    })
    return ScheduleState(
        busy=busy,
        reserved=reserved,
        daily_counts=daily_counts,
        work_state=work_state,
        remaining_tasks=[task for task in state.remaining_tasks if str(task["id"]) != selected.task_id],
        scheduled=scheduled,
        scheduled_candidates=scheduled_candidates,
        unscheduled=[dict(item) for item in state.unscheduled],
        tag_grouping_trace=tag_grouping_trace,
        total_score=state.total_score + selected.score,
    )


def expand_schedule_state(
    state: ScheduleState,
    now: datetime,
    horizon_end: datetime,
    constraints: dict[str, dict[str, Any]],
    task_rule_constraints: dict[str, list[dict[str, Any]]],
    task_order: dict[str, int],
    memberships: dict[str, dict[str, float]],
    tag_grouping: dict[str, Any],
    target_timezone: timezone | ZoneInfo,
) -> list[ScheduleState]:
    selectable: list[tuple[dict[str, Any], Candidate, dict[str, Any]]] = []
    rejected: list[tuple[dict[str, Any], str | None, list[str]]] = []
    for task in state.remaining_tasks:
        task_id = str(task["id"])
        rule_constraints = task_rule_constraints[task_id]
        candidates, reason, blocking = build_candidates(
            task,
            task_order[task_id],
            now,
            horizon_end,
            state.busy,
            constraints,
            rule_constraints,
            state.daily_counts,
            target_timezone,
        )
        selected_for_task = select_candidate(task_id, candidates, len(task_order))
        if selected_for_task:
            base_score = selected_for_task.score
            priority_bias = task_priority_bias(rule_constraints)
            selected_for_task = replace(
                selected_for_task,
                score=selected_for_task.score + priority_bias,
            )
            grouped_candidate, grouping_adjustment, grouping_similarity, adjacent_block_groups = candidate_with_tag_grouping_score(
                selected_for_task,
                state.scheduled_candidates,
                memberships,
                tag_grouping,
            )
            selectable.append((
                task,
                grouped_candidate,
                {
                    "taskId": task_id,
                    "start": iso(grouped_candidate.start),
                    "end": iso(grouped_candidate.end),
                    "groups": memberships.get(task_id, {}),
                    "baseScore": base_score,
                    "priorityBias": priority_bias,
                    "tagGroupingAdjustment": grouping_adjustment,
                    "tagGroupingSimilarity": grouping_similarity,
                    "finalScore": grouped_candidate.score,
                    "adjacentBlockGroups": adjacent_block_groups,
                },
            ))
        else:
            rejected.append((task, reason, blocking))

    if not selectable:
        unscheduled = [dict(item) for item in state.unscheduled]
        for task, reason, blocking in rejected:
            task_id = str(task["id"])
            unscheduled_item = {"taskId": task_id, "reason": reason or "no valid candidates"}
            if blocking:
                unscheduled_item["blockingConstraintIds"] = blocking
            unscheduled.append(unscheduled_item)
        return [replace(state, remaining_tasks=[], unscheduled=unscheduled)]

    selectable.sort(key=lambda item: candidate_sort_key(item[1]))
    branch_width = TAG_GROUPING_BRANCH_WIDTH if tag_grouping.get("enabled") else 1
    return [
        apply_selected_candidate(state, selected, selected_debug, task_rule_constraints)
        for _, selected, selected_debug in selectable[:branch_width]
    ]


def solve_schedule_states(
    initial_state: ScheduleState,
    now: datetime,
    horizon_end: datetime,
    constraints: dict[str, dict[str, Any]],
    task_rule_constraints: dict[str, list[dict[str, Any]]],
    task_order: dict[str, int],
    memberships: dict[str, dict[str, float]],
    tag_grouping: dict[str, Any],
    target_timezone: timezone | ZoneInfo,
) -> ScheduleState:
    beam_width = TAG_GROUPING_BEAM_WIDTH if tag_grouping.get("enabled") else 1
    states = [initial_state]
    while any(state.remaining_tasks for state in states):
        next_states: list[ScheduleState] = []
        for state in states:
            if state.remaining_tasks:
                next_states.extend(expand_schedule_state(
                    state,
                    now,
                    horizon_end,
                    constraints,
                    task_rule_constraints,
                    task_order,
                    memberships,
                    tag_grouping,
                    target_timezone,
                ))
            else:
                next_states.append(state)
        states = sorted(next_states, key=state_sort_key)[:beam_width]
    return min(states, key=state_sort_key)


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
    unscheduled: list[dict[str, Any]] = []
    task_order = {str(task["id"]): index for index, task in enumerate(tasks)}
    task_rule_constraints = {
        str(task["id"]): normalize_constraints(task_constraints(payload, str(task["id"])))
        for task in tasks
    }
    tag_grouping = merge_tag_grouping(
        normalize_tag_grouping(payload),
        tag_grouping_from_rule_constraints(task_rule_constraints),
    )
    memberships = tag_group_memberships(tasks, tag_grouping)
    ordered_tasks = sorted(
        tasks,
        key=lambda task: (
            0 if str(task["id"]) in constraints else 1,
            task_priority_bias(task_rule_constraints[str(task["id"])]),
            parse_datetime(task.get("dueDateTime"), target_timezone) or horizon_end,
            task_order[str(task["id"])],
        ),
    )
    best_state = solve_schedule_states(
        ScheduleState(
            busy=busy,
            reserved=[],
            daily_counts={},
            work_state={"minutes": 0, "last_end": None},
            remaining_tasks=list(ordered_tasks),
            scheduled=[],
            scheduled_candidates=[],
            unscheduled=unscheduled,
            tag_grouping_trace=[],
        ),
        now,
        horizon_end,
        constraints,
        task_rule_constraints,
        task_order,
        memberships,
        tag_grouping,
        target_timezone,
    )

    scheduled = sorted(best_state.scheduled, key=lambda item: item["start"])
    reserved = sorted(best_state.reserved, key=lambda item: item["start"])
    return {
        "scheduled": scheduled,
        "reserved": reserved,
        "unscheduled": best_state.unscheduled,
        "debug": {
            "schedulerVersion": "tag-grouping-v1",
            "tagGrouping": {
                "enabled": tag_grouping.get("enabled", False),
                "mode": tag_grouping.get("mode", "off"),
                "scope": tag_grouping.get("scope", "block"),
                "strength": tag_grouping.get("strength", 0.0),
                "groups": tag_grouping.get("groups", []),
                "ruleGroupCount": tag_grouping.get("ruleGroupCount", 0),
                "taskMemberships": {task_id: groups for task_id, groups in memberships.items() if groups},
                "selectionTrace": best_state.tag_grouping_trace,
                "beamWidth": TAG_GROUPING_BEAM_WIDTH if tag_grouping.get("enabled") else 1,
                "branchWidth": TAG_GROUPING_BRANCH_WIDTH if tag_grouping.get("enabled") else 1,
                "totalScore": best_state.total_score,
            },
        },
    }
