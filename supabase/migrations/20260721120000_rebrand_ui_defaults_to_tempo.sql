UPDATE public.app_settings
SET value = jsonb_set(
  value,
  '{ui}',
  COALESCE(value->'ui', '{}'::jsonb) || '{
    "accentColor": "#3656bf",
    "breakColor": "#0f8f7e",
    "calendarDueDateColor": "#447276",
    "calendarEventColor": "#315efb",
    "calendarPreviewColor": "#6f48eb",
    "calendarTodayColor": "#eaf0ff",
    "compactMode": false,
    "fieldColor": "#ffffff",
    "fontFamily": "system",
    "fontScale": "normal",
    "lineColor": "#dde2ec",
    "mutedColor": "#677189",
    "pageColor": "#ced9ee",
    "surfaceColor": "#ffffff",
    "textColor": "#172033",
    "textSoftColor": "#4d586d"
  }'::jsonb,
  true
)
WHERE key = 'app';
