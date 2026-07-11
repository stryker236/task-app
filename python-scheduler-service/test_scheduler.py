import unittest

from scheduler import solve_schedule


class SchedulerTests(unittest.TestCase):
    def test_places_tasks_in_nearest_available_slots(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-09T22:00:00Z",
            "busy": [{"start": "2026-07-08T08:00:00Z", "end": "2026-07-08T08:30:00Z"}],
            "tasks": [
                {"id": "a", "title": "A", "durationMinutes": 30},
                {"id": "b", "title": "B", "durationMinutes": 30},
            ],
        })

        self.assertEqual([item["taskId"] for item in result["scheduled"]], ["a", "b"])
        self.assertEqual(result["scheduled"][0]["start"], "2026-07-08T08:30:00Z")
        self.assertEqual(result["scheduled"][1]["start"], "2026-07-08T09:00:00Z")

    def test_respects_fixed_user_constraints(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-09T22:00:00Z",
            "busy": [],
            "constraints": [
                {"taskId": "fixed", "fixedStart": "2026-07-08T10:00:00Z"}
            ],
            "tasks": [
                {"id": "fixed", "title": "Fixed", "durationMinutes": 30},
                {"id": "free", "title": "Free", "durationMinutes": 30},
            ],
        })

        by_id = {item["taskId"]: item for item in result["scheduled"]}
        self.assertEqual(by_id["fixed"]["start"], "2026-07-08T10:00:00Z")
        self.assertEqual(by_id["free"]["start"], "2026-07-08T08:00:00Z")

    def test_accepts_calendar_availability_alias(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "calendarAvailability": [{"start": "2026-07-08T08:00:00Z", "end": "2026-07-08T09:00:00Z"}],
            "tasks": [{"id": "task", "title": "Task", "durationMinutes": 30}],
        })

        self.assertEqual(result["scheduled"][0]["start"], "2026-07-08T09:00:00Z")

    def test_uses_calendar_timezone_for_working_hours(self):
        result = solve_schedule({
            "now": "2026-07-08T20:30:00Z",
            "horizonEnd": "2026-07-09T22:00:00Z",
            "timeZone": "Europe/Lisbon",
            "busy": [],
            "tasks": [{"id": "task", "title": "Task", "durationMinutes": 60}],
        })

        self.assertEqual(result["scheduled"][0]["start"], "2026-07-09T07:00:00Z")
        self.assertEqual(result["scheduled"][0]["end"], "2026-07-09T08:00:00Z")

    def test_schedules_many_tasks_without_timing_out(self):
        result = solve_schedule({
            "now": "2026-07-08T21:30:00Z",
            "horizonEnd": "2026-07-23T21:30:00Z",
            "timeZone": "Europe/Lisbon",
            "busy": [],
            "tasks": [
                {"id": f"task-{index}", "title": f"Task {index}", "durationMinutes": 30}
                for index in range(17)
            ],
        })

        self.assertEqual(len(result["scheduled"]), 17)
        self.assertEqual(result["unscheduled"], [])
        self.assertEqual(result["scheduled"][0]["start"], "2026-07-09T07:00:00Z")

    def test_respects_task_blocked_window_constraint(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "task": [
                    {
                        "id": "constraint-1",
                        "type": "blocked_window",
                        "payload": {"startTime": "08:00", "endTime": "09:00"},
                        "hard": True,
                    }
                ]
            },
            "tasks": [{"id": "task", "title": "Task", "durationMinutes": 30}],
        })

        self.assertEqual(result["scheduled"][0]["start"], "2026-07-08T09:00:00Z")

    def test_priority_boost_places_matching_task_first(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "focus": [
                    {
                        "id": "priority-focus",
                        "type": "priority_boost",
                        "payload": {"days": [3], "startTime": "08:00", "endTime": "10:00", "weight": 200},
                        "hard": False,
                    }
                ]
            },
            "tasks": [
                {"id": "admin", "title": "Admin", "durationMinutes": 30},
                {"id": "focus", "title": "Focus", "durationMinutes": 30},
            ],
        })

        self.assertEqual(result["scheduled"][0]["taskId"], "focus")
        self.assertEqual(result["scheduled"][0]["start"], "2026-07-08T08:00:00Z")

    def test_priority_boost_can_target_day_of_month(self):
        result = solve_schedule({
            "now": "2026-07-17T08:00:00Z",
            "horizonEnd": "2026-07-19T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "side-project": [
                    {
                        "id": "priority-day-18",
                        "type": "priority_boost",
                        "payload": {"daysOfMonth": [18]},
                        "hard": False,
                    }
                ]
            },
            "tasks": [
                {"id": "side-project", "title": "Side Project", "durationMinutes": 30},
            ],
        })

        self.assertEqual(result["scheduled"][0]["start"], "2026-07-18T08:00:00Z")

    def test_daily_limit_caps_matching_tasks_for_day(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-09T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "focus-1": [
                    {
                        "id": "limit-focus",
                        "type": "daily_limit",
                        "payload": {"days": [3], "max": 1},
                        "hard": True,
                    }
                ],
                "focus-2": [
                    {
                        "id": "limit-focus",
                        "type": "daily_limit",
                        "payload": {"days": [3], "max": 1},
                        "hard": True,
                    }
                ],
            },
            "tasks": [
                {"id": "focus-1", "title": "Focus 1", "durationMinutes": 30},
                {"id": "focus-2", "title": "Focus 2", "durationMinutes": 30},
            ],
        })

        by_id = {item["taskId"]: item for item in result["scheduled"]}
        self.assertEqual(by_id["focus-1"]["start"], "2026-07-08T08:00:00Z")
        self.assertEqual(by_id["focus-2"]["start"], "2026-07-09T08:00:00Z")

    def test_allowed_date_restricts_task_to_exact_date(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-20T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "task": [
                    {
                        "id": "allowed-date",
                        "type": "allowed_date",
                        "payload": {"date": "2026-07-18", "startTime": "10:00", "endTime": "12:00"},
                        "hard": True,
                    }
                ]
            },
            "tasks": [{"id": "task", "title": "Task", "durationMinutes": 30}],
        })

        self.assertEqual(result["scheduled"][0]["start"], "2026-07-18T10:00:00Z")

    def test_returns_break_after_task_reserved_block(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "task": [
                    {
                        "id": "break-after-task",
                        "type": "break_after_task",
                        "payload": {"breakMinutes": 15},
                        "hard": True,
                    }
                ]
            },
            "tasks": [{"id": "task", "title": "Task", "durationMinutes": 30}],
        })

        self.assertEqual(result["reserved"][0]["start"], "2026-07-08T08:30:00Z")
        self.assertEqual(result["reserved"][0]["end"], "2026-07-08T08:45:00Z")

    def test_break_after_task_respects_min_duration(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "short": [
                    {
                        "id": "break-after-long-task",
                        "type": "break_after_task",
                        "payload": {"breakMinutes": 15, "minDurationMinutes": 60},
                        "hard": False,
                    }
                ],
                "long": [
                    {
                        "id": "break-after-long-task",
                        "type": "break_after_task",
                        "payload": {"breakMinutes": 15, "minDurationMinutes": 60},
                        "hard": False,
                    }
                ],
            },
            "tasks": [
                {"id": "short", "title": "Short", "durationMinutes": 30},
                {"id": "long", "title": "Long", "durationMinutes": 60},
            ],
        })

        self.assertEqual(len(result["reserved"]), 1)
        self.assertEqual(result["reserved"][0]["start"], "2026-07-08T09:30:00Z")

    def test_returns_break_after_work_block_reserved_block(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "a": [
                    {
                        "id": "break-after-work",
                        "type": "break_after_work_block",
                        "payload": {"workMinutes": 90, "breakMinutes": 15},
                        "hard": True,
                    }
                ],
                "b": [
                    {
                        "id": "break-after-work",
                        "type": "break_after_work_block",
                        "payload": {"workMinutes": 90, "breakMinutes": 15},
                        "hard": True,
                    }
                ],
            },
            "tasks": [
                {"id": "a", "title": "A", "durationMinutes": 60},
                {"id": "b", "title": "B", "durationMinutes": 30},
            ],
        })

        self.assertEqual(result["reserved"][0]["start"], "2026-07-08T09:30:00Z")
        self.assertEqual(result["reserved"][0]["end"], "2026-07-08T09:45:00Z")

    def test_work_block_break_pushes_following_task(self):
        constraint = {
            "id": "break-after-work",
            "type": "break_after_work_block",
            "payload": {"workMinutes": 90, "breakMinutes": 15},
            "hard": True,
        }
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "timeZone": "UTC",
            "busy": [],
            "taskConstraints": {
                "a": [constraint],
                "b": [constraint],
                "c": [constraint],
                "d": [constraint],
            },
            "tasks": [
                {"id": "a", "title": "A", "durationMinutes": 30},
                {"id": "b", "title": "B", "durationMinutes": 30},
                {"id": "c", "title": "C", "durationMinutes": 30},
                {"id": "d", "title": "D", "durationMinutes": 30},
            ],
        })

        by_id = {item["taskId"]: item for item in result["scheduled"]}
        self.assertEqual(result["reserved"][0]["start"], "2026-07-08T09:30:00Z")
        self.assertEqual(result["reserved"][0]["end"], "2026-07-08T09:45:00Z")
        self.assertEqual(by_id["d"]["start"], "2026-07-08T09:45:00Z")

    def test_reports_due_date_conflict(self):
        result = solve_schedule({
            "now": "2026-07-08T08:00:00Z",
            "horizonEnd": "2026-07-08T22:00:00Z",
            "busy": [],
            "tasks": [
                {"id": "late", "title": "Late", "durationMinutes": 30, "dueDateTime": "2026-07-08T08:15:00Z"},
            ],
        })

        self.assertEqual(result["scheduled"], [])
        self.assertEqual(result["unscheduled"][0]["taskId"], "late")


if __name__ == "__main__":
    unittest.main()
