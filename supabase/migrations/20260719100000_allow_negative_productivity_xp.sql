ALTER TABLE productivity_events
  DROP CONSTRAINT IF EXISTS productivity_events_xp_check;

ALTER TABLE productivity_events
  ADD CONSTRAINT productivity_events_xp_reasonable_check
  CHECK (xp BETWEEN -10000 AND 10000);