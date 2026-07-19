CREATE TABLE task_work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_calendar_event_id uuid REFERENCES task_calendar_events(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned',
  planned_start_at timestamptz NOT NULL,
  planned_end_at timestamptz NOT NULL,
  planned_minutes integer NOT NULL,
  completed_minutes integer NOT NULL DEFAULT 0,
  note text,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_work_sessions_calendar_event_unique UNIQUE (task_calendar_event_id),
  CONSTRAINT task_work_sessions_status_check CHECK (status IN ('planned', 'completed', 'partially_completed', 'missed', 'cancelled')),
  CONSTRAINT task_work_sessions_time_check CHECK (planned_end_at > planned_start_at),
  CONSTRAINT task_work_sessions_planned_minutes_check CHECK (planned_minutes > 0),
  CONSTRAINT task_work_sessions_completed_minutes_check CHECK (completed_minutes >= 0)
);

CREATE INDEX task_work_sessions_task_id_idx ON task_work_sessions(task_id);
CREATE INDEX task_work_sessions_task_calendar_event_id_idx ON task_work_sessions(task_calendar_event_id);
CREATE INDEX task_work_sessions_status_idx ON task_work_sessions(status);
CREATE INDEX task_work_sessions_planned_start_at_idx ON task_work_sessions(planned_start_at);
