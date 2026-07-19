ALTER TABLE task_calendar_events
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS review_feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS xp_delta integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'task_calendar_events_review_status_check'
  ) THEN
    ALTER TABLE task_calendar_events
      ADD CONSTRAINT task_calendar_events_review_status_check
      CHECK (review_status IS NULL OR review_status IN ('completed', 'missed', 'skipped'));
  END IF;
END $$;