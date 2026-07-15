CREATE TABLE productivity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  xp integer NOT NULL CHECK (xp >= 0),
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  quick_queue_item_id uuid REFERENCES quick_queue_items(id) ON DELETE SET NULL,
  checklist_item_id uuid REFERENCES task_checklist_items(id) ON DELETE SET NULL,
  calendar_event_id uuid REFERENCES task_calendar_events(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX productivity_events_occurred_at_idx ON productivity_events(occurred_at DESC);
CREATE INDEX productivity_events_task_id_idx ON productivity_events(task_id);
CREATE INDEX productivity_events_event_type_idx ON productivity_events(event_type);
