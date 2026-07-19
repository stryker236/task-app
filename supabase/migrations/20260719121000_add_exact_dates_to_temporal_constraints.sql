UPDATE scheduler_constraint_types
SET
  description = CASE type
    WHEN 'blocked_window' THEN 'Prevents matching tasks from being scheduled inside a time window. Payload may include days for recurring weekdays, date for one exact calendar date, or dates for several exact calendar dates.'
    WHEN 'allowed_window' THEN 'Restricts matching tasks to a time window. Payload may include days for recurring weekdays, date for one exact calendar date, or dates for several exact calendar dates.'
    WHEN 'preferred_window' THEN 'Prioritizes matching tasks inside a time window when possible. Payload may include days for recurring weekdays, date for one exact calendar date, or dates for several exact calendar dates.'
    WHEN 'priority_boost' THEN 'Moves matching tasks earlier when possible. Payload may include days for recurring weekdays, date for one exact calendar date, dates for several exact calendar dates, and an optional time window.'
    WHEN 'daily_limit' THEN 'Limits how many matching tasks can be scheduled in a matching day/window. Payload may include days for recurring weekdays, date for one exact calendar date, or dates for several exact calendar dates.'
    WHEN 'allowed_date' THEN 'Restricts matching tasks to one or more exact calendar dates, optionally inside a time range.'
    ELSE description
  END,
  payload_schema = CASE
    WHEN type IN ('blocked_window', 'allowed_window') THEN
      '{"type":"object","required":["startTime","endTime"],"properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"dates":{"type":"array","items":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}'::jsonb
    WHEN type = 'preferred_window' THEN
      '{"type":"object","required":["startTime","endTime"],"properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"dates":{"type":"array","items":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"weight":{"type":"integer","minimum":1}}}'::jsonb
    WHEN type = 'priority_boost' THEN
      '{"type":"object","properties":{"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"daysOfMonth":{"type":"array","items":{"type":"integer","minimum":1,"maximum":31}},"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"dates":{"type":"array","items":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"weight":{"type":"integer","minimum":1}}}'::jsonb
    WHEN type = 'daily_limit' THEN
      '{"type":"object","required":["max"],"properties":{"max":{"type":"integer","minimum":1},"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"dates":{"type":"array","items":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}'::jsonb
    WHEN type = 'allowed_date' THEN
      '{"type":"object","properties":{"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"dates":{"type":"array","items":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"}}}'::jsonb
    ELSE payload_schema
  END,
  updated_at = now()
WHERE type IN ('blocked_window', 'allowed_window', 'preferred_window', 'priority_boost', 'daily_limit', 'allowed_date');
