CREATE TABLE public.periodic_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 2,
  estimated_minutes integer NOT NULL DEFAULT 30,
  period text NOT NULL DEFAULT 'week',
  target_count integer NOT NULL DEFAULT 1,
  hard_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodic_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT periodic_tasks_period_check CHECK (period IN ('week', 'month')),
  CONSTRAINT periodic_tasks_priority_check CHECK (priority BETWEEN 1 AND 4),
  CONSTRAINT periodic_tasks_target_count_check CHECK (target_count BETWEEN 1 AND 31),
  CONSTRAINT periodic_tasks_estimated_minutes_check CHECK (estimated_minutes BETWEEN 15 AND 480)
);

CREATE INDEX periodic_tasks_active_idx ON public.periodic_tasks(active);

CREATE TRIGGER periodic_tasks_set_updated_at
BEFORE UPDATE ON public.periodic_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.periodic_task_constraints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  periodic_task_id uuid NOT NULL REFERENCES public.periodic_tasks(id) ON DELETE CASCADE,
  type text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  hard boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodic_task_constraints_pkey PRIMARY KEY (id),
  CONSTRAINT periodic_task_constraints_type_check CHECK (type IN ('fixed_occurrence', 'allowed_window', 'minimum_count'))
);

CREATE INDEX periodic_task_constraints_task_idx ON public.periodic_task_constraints(periodic_task_id, active);

CREATE TRIGGER periodic_task_constraints_set_updated_at
BEFORE UPDATE ON public.periodic_task_constraints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.periodic_task_occurrences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  periodic_task_id uuid NOT NULL REFERENCES public.periodic_tasks(id) ON DELETE CASCADE,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  google_event_id text,
  html_link text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodic_task_occurrences_pkey PRIMARY KEY (id),
  CONSTRAINT periodic_task_occurrences_status_check CHECK (status IN ('scheduled', 'completed', 'skipped', 'cancelled')),
  CONSTRAINT periodic_task_occurrences_time_check CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX periodic_task_occurrences_task_start_idx
ON public.periodic_task_occurrences(periodic_task_id, scheduled_start);

CREATE TRIGGER periodic_task_occurrences_set_updated_at
BEFORE UPDATE ON public.periodic_task_occurrences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
