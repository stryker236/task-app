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
) VALUES (
  'tag_group_preference',
  'Tag group preference',
  'Resolves a semantic concept into existing tags, prefers scheduling matching tasks near each other, and can prefer or require a date/time window.',
  'preference',
  '{"type":"object","properties":{"tags":{"type":"array","items":{"type":"string"}},"taskIds":{"type":"array","items":{"type":"string"}}}}',
  '{"type":"object","required":["concept","resolvedTags"],"properties":{"concept":{"type":"string"},"resolvedTags":{"type":"array","items":{"type":"string"},"minItems":2},"strength":{"type":"number","minimum":0.1,"maximum":1},"scope":{"type":"string","enum":["block"]},"timeMode":{"type":"string","enum":["preferred","required"]},"days":{"type":"array","items":{"type":"integer","minimum":1,"maximum":7}},"date":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"dates":{"type":"array","items":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}},"startTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"endTime":{"type":"string","pattern":"^[0-9]{2}:[0-9]{2}$"},"weight":{"type":"integer","minimum":1,"maximum":50000}}}',
  '[{"text":"Agrupar coisas financeiras","constraint":{"type":"tag_group_preference","scope":{"tags":["finance","btc","money"]},"payload":{"concept":"coisas financeiras","resolvedTags":["finance","btc","money"],"strength":0.6,"scope":"block"},"hard":false}},{"text":"Quero coisas financeiras no sabado a tarde","constraint":{"type":"tag_group_preference","scope":{"tags":["finance","btc","money"]},"payload":{"concept":"coisas financeiras","resolvedTags":["finance","btc","money"],"strength":0.8,"scope":"block","timeMode":"preferred","days":[6],"startTime":"14:00","endTime":"18:00","weight":12000},"hard":false}}]',
  false,
  false
)
ON CONFLICT (type) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  scope_schema = EXCLUDED.scope_schema,
  payload_schema = EXCLUDED.payload_schema,
  examples = EXCLUDED.examples,
  supports_hard = EXCLUDED.supports_hard,
  default_hard = EXCLUDED.default_hard,
  enabled = true,
  updated_at = now();
