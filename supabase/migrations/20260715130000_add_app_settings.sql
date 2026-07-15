CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_app_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
BEFORE UPDATE ON app_settings
FOR EACH ROW EXECUTE FUNCTION set_app_settings_updated_at();

INSERT INTO app_settings (key, value)
VALUES ('app', '{
  "productivity": {
    "dailyGoalXp": 50,
    "showDashboardPanel": true
  },
  "ai": {
    "advisorEnabled": true,
    "feedbackMemoryEnabled": true,
    "feedbackMemoryStrength": "strong",
    "agendaRulesEnabled": true
  },
  "calendar": {
    "defaultEventDurationMinutes": 60,
    "workingHoursStart": "09:00",
    "workingHoursEnd": "18:00",
    "weekdaysOnly": true
  },
  "ui": {
    "compactMode": false
  }
}'::jsonb)
ON CONFLICT (key) DO NOTHING;