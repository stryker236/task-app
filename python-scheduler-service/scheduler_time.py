from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from scheduler_types import SLOT_MINUTES, WORKDAY_END_HOUR, WORKDAY_START_HOUR


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


def overlaps(left_start: datetime, left_end: datetime, right_start: datetime, right_end: datetime) -> bool:
    return left_start < right_end and right_start < left_end


def workday_bounds(day: datetime) -> tuple[datetime, datetime]:
    start = day.replace(hour=WORKDAY_START_HOUR, minute=0, second=0, microsecond=0)
    end = day.replace(hour=WORKDAY_END_HOUR, minute=0, second=0, microsecond=0)
    return start, end


def parse_hhmm(value: Any) -> int | None:
    if not isinstance(value, str) or ":" not in value:
        return None
    try:
        hour, minute = value.split(":", 1)
        resolved = int(hour) * 60 + int(minute)
    except ValueError:
        return None
    return resolved if 0 <= resolved <= 24 * 60 else None
