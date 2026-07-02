CREATE TABLE public.advisor_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text NOT NULL,
  command_id text NOT NULL,
  command_type text NOT NULL,
  task_id uuid,
  task_title text,
  title_fingerprint text NOT NULL DEFAULT '',
  feedback jsonb NOT NULL,
  command_preview jsonb NOT NULL,
  raw_command jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT advisor_feedback_pkey PRIMARY KEY (id)
);

CREATE TABLE public.advisor_memory_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_type text NOT NULL,
  title_fingerprint text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  rule jsonb NOT NULL,
  support_count integer NOT NULL DEFAULT 1,
  last_feedback_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT advisor_memory_rules_pkey PRIMARY KEY (id),
  CONSTRAINT advisor_memory_rules_unique UNIQUE (rule_type, title_fingerprint, action)
);

CREATE INDEX advisor_feedback_title_fingerprint_idx
ON public.advisor_feedback(title_fingerprint);

CREATE INDEX advisor_memory_rules_title_fingerprint_idx
ON public.advisor_memory_rules(title_fingerprint);

CREATE TRIGGER advisor_memory_rules_set_updated_at
BEFORE UPDATE ON public.advisor_memory_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
