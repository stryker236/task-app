CREATE TABLE task_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  calendar_id text NOT NULL,
  summary text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  html_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, google_event_id)
);

CREATE INDEX task_calendar_events_task_id_idx ON task_calendar_events(task_id);
