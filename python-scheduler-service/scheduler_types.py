from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

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
