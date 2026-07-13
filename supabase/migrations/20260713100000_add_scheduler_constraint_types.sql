CREATE TABLE public.scheduler_constraint_types (
  type text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  scope_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  supports_hard boolean NOT NULL DEFAULT true,
  default_hard boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scheduler_constraint_types_enabled_idx
ON public.scheduler_constraint_types(enabled);

CREATE TRIGGER scheduler_constraint_types_set_updated_at
BEFORE UPDATE ON public.scheduler_constraint_types
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.scheduler_constraint_types (
  type,
  label,
  description,
  category,
  scope_schema,
  payload_schema,
  examples,
  supports_hard,
  default_hard
) VALUES
(
  'blocked_window',
  'Blocked window',
  'Prevents matching tasks from being scheduled inside a time window.',
  'time_window',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["startTime","endTime"],"properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}',
  '[{"text":"Do not schedule work after 18:00","constraint":{"type":"blocked_window","scope":{"allTasks":true},"payload":{"startTime":"18:00","endTime":"22:00"},"hard":true}}]',
  true,
  true
),
(
  'allowed_window',
  'Allowed window',
  'Restricts matching tasks to a time window.',
  'time_window',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["startTime","endTime"],"properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}',
  '[{"text":"Schedule study tasks only in the morning","constraint":{"type":"allowed_window","scope":{"tags":["study"]},"payload":{"startTime":"08:00","endTime":"12:00"},"hard":true}}]',
  true,
  true
),
(
  'preferred_window',
  'Preferred window',
  'Prioritizes matching tasks inside a time window when possible.',
  'preference',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["startTime","endTime"],"properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"weight":{"type":"integer","minimum":1}}}',
  '[{"text":"I prefer deep work before lunch","constraint":{"type":"preferred_window","scope":{"tags":["deep-work"]},"payload":{"startTime":"08:00","endTime":"12:00","weight":100},"hard":false}}]',
  true,
  false
),
(
  'avoid_day',
  'Avoid day',
  'Avoids scheduling matching tasks on specific weekdays.',
  'time_window',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["days"],"properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}}}}',
  '[{"text":"Avoid admin work on Mondays","constraint":{"type":"avoid_day","scope":{"tags":["admin"]},"payload":{"days":[1]},"hard":true}}]',
  true,
  true
),
(
  'min_duration',
  'Minimum duration',
  'Applies only to matching tasks at or above a minimum duration.',
  'duration',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["minutes"],"properties":{"minutes":{"type":"integer","minimum":1}}}',
  '[{"text":"Only schedule long tasks with this rule","constraint":{"type":"min_duration","scope":{"allTasks":true},"payload":{"minutes":60},"hard":true}}]',
  true,
  true
),
(
  'max_duration',
  'Maximum duration',
  'Applies only to matching tasks at or below a maximum duration.',
  'duration',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["minutes"],"properties":{"minutes":{"type":"integer","minimum":1}}}',
  '[{"text":"Keep quick tasks under 30 minutes","constraint":{"type":"max_duration","scope":{"tags":["quick"]},"payload":{"minutes":30},"hard":true}}]',
  true,
  true
),
(
  'priority_boost',
  'Priority boost',
  'Moves matching tasks earlier when possible.',
  'preference',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"weight":{"type":"integer","minimum":1}}}',
  '[{"text":"Prioritize urgent tasks on Friday","constraint":{"type":"priority_boost","scope":{"priorities":[4]},"payload":{"days":[5],"weight":10000},"hard":false}}]',
  true,
  false
),
(
  'daily_limit',
  'Daily limit',
  'Limits how many matching tasks can be scheduled in a matching day/window.',
  'capacity',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["max"],"properties":{"max":{"type":"integer","minimum":1},"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}',
  '[{"text":"Only schedule two admin tasks per day","constraint":{"type":"daily_limit","scope":{"tags":["admin"]},"payload":{"max":2},"hard":true}}]',
  true,
  true
),
(
  'break_after_task',
  'Break after task',
  'Reserves a calculated break after each matching scheduled task.',
  'break',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["breakMinutes"],"properties":{"breakMinutes":{"type":"integer","minimum":1},"minDurationMinutes":{"type":"integer","minimum":1}}}',
  '[{"text":"Take a 15 minute break after tasks of 1 hour or more","constraint":{"type":"break_after_task","scope":{"allTasks":true},"payload":{"breakMinutes":15,"minDurationMinutes":60},"hard":false}}]',
  true,
  false
),
(
  'break_after_work_block',
  'Break after work block',
  'Reserves a calculated break after a continuous block of scheduled work.',
  'break',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["workMinutes","breakMinutes"],"properties":{"workMinutes":{"type":"integer","minimum":1},"breakMinutes":{"type":"integer","minimum":1}}}',
  '[{"text":"Take a 15 minute break after 90 minutes of work","constraint":{"type":"break_after_work_block","scope":{"allTasks":true},"payload":{"workMinutes":90,"breakMinutes":15},"hard":true}}]',
  true,
  true
),
(
  'allowed_date',
  'Allowed date',
  'Restricts matching tasks to one exact calendar date, optionally inside a time range.',
  'date',
  '{"type":"object","properties":{"allTasks":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"priorities":{"type":"array","items":{"type":"integer"}},"statuses":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["date"],"properties":{"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}',
  '[{"text":"Schedule tax tasks on July 18, 2026","constraint":{"type":"allowed_date","scope":{"tags":["taxes"]},"payload":{"date":"2026-07-18"},"hard":true}}]',
  true,
  true
);
