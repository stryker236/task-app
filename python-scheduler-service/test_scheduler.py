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
            "tasks": [
                {"id": "fixed", "title": "Fixed", "durationMinutes": 30, "fixedStart": "2026-07-08T10:00:00Z"},
                {"id": "free", "title": "Free", "durationMinutes": 30},
            ],
        })

        by_id = {item["taskId"]: item for item in result["scheduled"]}
        self.assertEqual(by_id["fixed"]["start"], "2026-07-08T10:00:00Z")
        self.assertEqual(by_id["free"]["start"], "2026-07-08T08:00:00Z")

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
