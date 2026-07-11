CREATE TABLE public.scheduler_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  interpretation text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  enabled boolean NOT NULL DEFAULT false,
  confidence numeric,
  model text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduler_rules_status_check CHECK (status IN ('draft', 'needs_review', 'active', 'disabled', 'invalid'))
);

CREATE TABLE public.scheduler_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.scheduler_rules(id) ON DELETE CASCADE,
  type text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  hard boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scheduler_rules_enabled_status_idx
ON public.scheduler_rules(enabled, status);

CREATE INDEX scheduler_constraints_rule_id_idx
ON public.scheduler_constraints(rule_id);

CREATE INDEX scheduler_constraints_enabled_idx
ON public.scheduler_constraints(enabled);

CREATE TRIGGER scheduler_rules_set_updated_at
BEFORE UPDATE ON public.scheduler_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER scheduler_constraints_set_updated_at
BEFORE UPDATE ON public.scheduler_constraints
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
